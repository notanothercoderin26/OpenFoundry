/**
 * API mock factory for E2E tests.
 *
 * Two layers, used together in every spec:
 *
 * 1. {@link installDefaultApiMocks} — a catch-all safety net that fulfils
 *    *any* unmatched `/api/v1/...` request: GETs return an empty
 *    `{ data: [], next_cursor: null, total: 0 }` envelope, mutations
 *    (POST/PUT/PATCH/DELETE) return 204. Install once per test before
 *    `page.goto()` so no real network call escapes.
 *
 * 2. Per-resource builders (`makeX`) + mockers (`mockXList`, `mockXDetail`)
 *    that override the catch-all with realistic, deterministic data for
 *    the endpoints the spec actually exercises.
 *
 * **Ordering matters.** `page.route` matches handlers most-recent-first,
 * so install resource-specific mocks AFTER `installDefaultApiMocks` (or
 * the default would shadow them). Likewise install handlers before
 * navigating — `page.route` only intercepts requests made after the
 * handler is registered.
 *
 * Defaults:
 * - All timestamps derive from {@link E2E_NOW}.
 * - IDs follow the pattern `<resource>-<n>` (`dataset-1`, `project-2`, …)
 *   so tests can hard-code references without fixture juggling.
 * - List envelopes match the Go `models.ListResponse[T]` wire shape:
 *   `{ data, next_cursor, total }`.
 */
import type { Page, Request, Route } from '@playwright/test';
import { E2E_NOW } from './mocks';

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface ListEnvelope<T> {
  data: T[];
  next_cursor: string | null;
  total: number;
}

export interface ListOptions {
  /** Override the reported total (defaults to `items.length`). */
  total?: number;
  /** Force an error response. Skip route fulfilment and return `{ status, body }`. */
  error?: { status: number; body?: unknown };
  /** Force a `next_cursor` value (default null). */
  nextCursor?: string | null;
}

export interface DetailOptions {
  /** Force an error response instead of returning the item. */
  error?: { status: number; body?: unknown };
}

const BASE = '**/api/v1';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Build a list-style `page.route` handler that returns an envelope on GET
 * and falls back to whatever lower-priority handler (e.g. the default
 * catch-all) for non-GET methods.
 */
async function fulfillList<T>(
  page: Page,
  pattern: string | RegExp,
  items: T[],
  opts: ListOptions = {},
): Promise<void> {
  await page.route(pattern, async (route: Route) => {
    if (opts.error) {
      await route.fulfill({ status: opts.error.status, json: opts.error.body ?? {} });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        data: items,
        next_cursor: opts.nextCursor ?? null,
        total: opts.total ?? items.length,
      } satisfies ListEnvelope<T>,
    });
  });
}

/**
 * Build a detail-style `page.route` handler that returns a single item on
 * GET (or the configured error). Other methods fall through.
 */
async function fulfillDetail<T>(
  page: Page,
  pattern: string | RegExp,
  item: T,
  opts: DetailOptions = {},
): Promise<void> {
  await page.route(pattern, async (route: Route) => {
    if (opts.error) {
      await route.fulfill({ status: opts.error.status, json: opts.error.body ?? {} });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: item });
  });
}

// ---------------------------------------------------------------------------
// Catch-all default mocks
// ---------------------------------------------------------------------------

/**
 * Catch-all safety net. Installs a *low-priority* handler that fulfils any
 * `/api/v1/...` request the spec didn't explicitly mock:
 *
 * - GET     → empty list envelope (`{ data: [], next_cursor: null, total: 0 }`).
 * - POST    → `{ id: 'new-1', created_at: E2E_NOW }`.
 * - PUT/PATCH/DELETE → `204 No Content`.
 *
 * Always call this BEFORE any per-resource mocker and BEFORE `page.goto()`.
 */
export async function installDefaultApiMocks(page: Page): Promise<void> {
  await page.route(/\/api\/v1\//, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: { data: [], next_cursor: null, total: 0 } satisfies ListEnvelope<never>,
      });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'new-1', created_at: E2E_NOW } });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

// ---------------------------------------------------------------------------
// Request capture
// ---------------------------------------------------------------------------

export interface CapturedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface RequestCapture {
  /** All matching calls in order. */
  calls: CapturedCall[];
  /** Convenience: number of calls captured so far. */
  count(): number;
  /** Convenience: most recent call body or undefined. */
  last(): CapturedCall | undefined;
}

/**
 * Capture all requests matching `pattern` into a mutable array. The capture
 * runs *alongside* any existing route handler (does not fulfil), so you can
 * combine it with `mockXList` / `mockXDetail` to observe payloads while
 * still returning canned responses.
 *
 * @example
 * const cap = captureRequests(page, '** /api/v1/datasets');
 * await page.getByRole('button', { name: 'Create' }).click();
 * await expect.poll(() => cap.count()).toBe(1);
 * expect(cap.last()?.body).toMatchObject({ name: 'New' });
 */
export function captureRequests(page: Page, pattern: string | RegExp): RequestCapture {
  const calls: CapturedCall[] = [];
  const listener = async (request: Request): Promise<void> => {
    const url = request.url();
    const matches =
      typeof pattern === 'string'
        ? url.includes(pattern.replace(/^\*+/, '').replace(/\*+$/, ''))
        : pattern.test(url);
    if (!matches) return;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    calls.push({
      url,
      method: request.method(),
      body,
      headers: request.headers(),
    });
  };
  page.on('request', listener);
  return {
    calls,
    count: () => calls.length,
    last: () => calls[calls.length - 1],
  };
}

// ===========================================================================
// Per-resource builders + mockers
// ---------------------------------------------------------------------------
// Convention for every resource block:
//   1. Type alias (sticks close to the Go wire shape; loose where it eases
//      tests).
//   2. `makeX(overrides?: Partial<X>): X` — deterministic builder, id
//      defaults to `<resource>-1`.
//   3. `mockXList(page, items?, opts?)` — GET list envelope.
//   4. `mockXDetail(page, item)` — GET single item by id.
//
// All mockers narrowly route by resource path, so resource-specific calls
// take precedence over `installDefaultApiMocks`.
// ===========================================================================

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export interface Dataset extends BaseEntity {
  name: string;
  description: string;
  owner_id: string;
  project_id: string | null;
  format: 'csv' | 'parquet' | 'iceberg' | 'json';
  size_bytes: number;
  row_count: number;
  tags: string[];
}

/** Builder for a {@link Dataset}. Defaults: id `dataset-1`, csv. */
export function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: 'dataset-1',
    name: 'Sample dataset',
    description: 'Deterministic E2E dataset',
    owner_id: 'user-1',
    project_id: 'project-1',
    format: 'csv',
    size_bytes: 1024,
    row_count: 100,
    tags: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockDatasetsList(
  page: Page,
  items: Dataset[] = [makeDataset()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/datasets`, items, opts);
}

export async function mockDatasetDetail(
  page: Page,
  item: Dataset = makeDataset(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/datasets/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project extends BaseEntity {
  name: string;
  description: string;
  owner_id: string;
  visibility: 'private' | 'organization' | 'public';
  archived: boolean;
}

/** Builder for a {@link Project}. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Sample project',
    description: 'Deterministic E2E project',
    owner_id: 'user-1',
    visibility: 'organization',
    archived: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockProjectsList(
  page: Page,
  items: Project[] = [makeProject()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/projects`, items, opts);
}

export async function mockProjectDetail(
  page: Page,
  item: Project = makeProject(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/projects/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export interface Pipeline extends BaseEntity {
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  owner_id: string;
  schedule_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: 'pipeline-1',
    name: 'Sample pipeline',
    description: 'Deterministic E2E pipeline',
    status: 'active',
    owner_id: 'user-1',
    schedule_id: null,
    last_run_at: E2E_NOW,
    next_run_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockPipelinesList(
  page: Page,
  items: Pipeline[] = [makePipeline()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/pipelines`, items, opts);
}

export async function mockPipelineDetail(
  page: Page,
  item: Pipeline = makePipeline(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/pipelines/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export interface Schedule extends BaseEntity {
  name: string;
  cron: string;
  timezone: string;
  target_rid: string;
  paused: boolean;
}

export function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'schedule-1',
    name: 'Daily refresh',
    cron: '0 6 * * *',
    timezone: 'UTC',
    target_rid: 'pipeline-1',
    paused: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockSchedulesList(
  page: Page,
  items: Schedule[] = [makeSchedule()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/schedules`, items, opts);
}

export async function mockScheduleDetail(
  page: Page,
  item: Schedule = makeSchedule(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/schedules/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

export interface Build extends BaseEntity {
  pipeline_id: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'canceled';
  started_at: string | null;
  finished_at: string | null;
  triggered_by: string;
  duration_ms: number | null;
}

export function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    id: 'build-1',
    pipeline_id: 'pipeline-1',
    status: 'success',
    started_at: E2E_NOW,
    finished_at: E2E_NOW,
    triggered_by: 'user-1',
    duration_ms: 12_345,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockBuildsList(
  page: Page,
  items: Build[] = [makeBuild()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/builds`, items, opts);
}

export async function mockBuildDetail(
  page: Page,
  item: Build = makeBuild(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/builds/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Ontology types (the ontology itself, not Object types)
// ---------------------------------------------------------------------------

export interface OntologyType extends BaseEntity {
  name: string;
  display_name: string;
  description: string;
  namespace: string;
  status: 'draft' | 'published';
}

export function makeOntologyType(overrides: Partial<OntologyType> = {}): OntologyType {
  return {
    id: 'ontology-type-1',
    name: 'asset',
    display_name: 'Asset',
    description: 'Deterministic ontology type',
    namespace: 'default',
    status: 'published',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockOntologyTypesList(
  page: Page,
  items: OntologyType[] = [makeOntologyType()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/ontology/types`, items, opts);
}

export async function mockOntologyTypeDetail(
  page: Page,
  item: OntologyType = makeOntologyType(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/ontology/types/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Object types (instances of ontology types — what the user manages in UI)
// ---------------------------------------------------------------------------

export interface ObjectProperty {
  id: string;
  name: string;
  display_name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  required: boolean;
}

export interface ObjectType extends BaseEntity {
  name: string;
  display_name: string;
  plural: string;
  description: string;
  icon: string;
  color: string;
  primary_key: string;
  properties: ObjectProperty[];
}

export function makeObjectType(overrides: Partial<ObjectType> = {}): ObjectType {
  return {
    id: 'object-type-1',
    name: 'aircraft',
    display_name: 'Aircraft',
    plural: 'Aircraft',
    description: 'Deterministic object type',
    icon: 'plane',
    color: '#0f766e',
    primary_key: 'tail_number',
    properties: [
      { id: 'p-1', name: 'tail_number', display_name: 'Tail #', type: 'string', required: true },
    ],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockObjectTypesList(
  page: Page,
  items: ObjectType[] = [makeObjectType()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/ontology/object-types`, items, opts);
}

export async function mockObjectTypeDetail(
  page: Page,
  item: ObjectType = makeObjectType(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/ontology/object-types/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Object views
// ---------------------------------------------------------------------------

export interface ObjectView extends BaseEntity {
  name: string;
  description: string;
  object_type_id: string;
  filters: unknown[];
  columns: string[];
  is_public: boolean;
}

export function makeObjectView(overrides: Partial<ObjectView> = {}): ObjectView {
  return {
    id: 'object-view-1',
    name: 'Active aircraft',
    description: 'Deterministic view',
    object_type_id: 'object-type-1',
    filters: [],
    columns: ['tail_number'],
    is_public: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockObjectViewsList(
  page: Page,
  items: ObjectView[] = [makeObjectView()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/object-views`, items, opts);
}

export async function mockObjectViewDetail(
  page: Page,
  item: ObjectView = makeObjectView(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/object-views/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Actions (executions of an action type against object instances)
// ---------------------------------------------------------------------------

export interface Action extends BaseEntity {
  action_type_id: string;
  target_object_ids: string[];
  parameters: Record<string, unknown>;
  status: 'pending' | 'validated' | 'executed' | 'failed';
  executed_by: string | null;
}

export function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'action-1',
    action_type_id: 'action-type-1',
    target_object_ids: ['weather-1'],
    parameters: {},
    status: 'executed',
    executed_by: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockActionsList(
  page: Page,
  items: Action[] = [makeAction()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/ontology/actions`, items, opts);
}

export async function mockActionDetail(
  page: Page,
  item: Action = makeAction(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/ontology/actions/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export interface ActionTypeParameter {
  name: string;
  display_name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  default_value: unknown;
}

export interface ActionType extends BaseEntity {
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  parameters: ActionTypeParameter[];
  is_published: boolean;
}

export function makeActionType(overrides: Partial<ActionType> = {}): ActionType {
  return {
    id: 'action-type-1',
    name: 'edit_aircraft',
    display_name: 'Edit aircraft',
    description: 'Deterministic action type',
    object_type_id: 'object-type-1',
    parameters: [
      {
        name: 'status',
        display_name: 'Status',
        type: 'string',
        required: true,
        default_value: 'active',
      },
    ],
    is_published: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockActionTypesList(
  page: Page,
  items: ActionType[] = [makeActionType()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/action-types`, items, opts);
}

export async function mockActionTypeDetail(
  page: Page,
  item: ActionType = makeActionType(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/action-types/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Functions (compute modules)
// ---------------------------------------------------------------------------

export interface ComputeFunction extends BaseEntity {
  name: string;
  description: string;
  runtime: 'python' | 'go' | 'node' | 'java';
  version: string;
  deployed: boolean;
}

export function makeFunction(overrides: Partial<ComputeFunction> = {}): ComputeFunction {
  return {
    id: 'function-1',
    name: 'compute_score',
    description: 'Deterministic compute function',
    runtime: 'python',
    version: '1.0.0',
    deployed: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockFunctionsList(
  page: Page,
  items: ComputeFunction[] = [makeFunction()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/compute-modules`, items, opts);
}

export async function mockFunctionDetail(
  page: Page,
  item: ComputeFunction = makeFunction(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/compute-modules/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Connectors (data-connection sources)
// ---------------------------------------------------------------------------

export interface Connector extends BaseEntity {
  name: string;
  type: 'postgres' | 'mysql' | 's3' | 'kafka' | 'snowflake';
  status: 'connected' | 'disconnected' | 'error';
  last_sync_at: string | null;
  config: Record<string, unknown>;
}

export function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: 'connector-1',
    name: 'Sample Postgres',
    type: 'postgres',
    status: 'connected',
    last_sync_at: E2E_NOW,
    config: {},
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockConnectorsList(
  page: Page,
  items: Connector[] = [makeConnector()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/data-connection/sources`, items, opts);
}

export async function mockConnectorDetail(
  page: Page,
  item: Connector = makeConnector(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/data-connection/sources/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Agents (data-connection agents)
// ---------------------------------------------------------------------------

export interface Agent extends BaseEntity {
  name: string;
  status: 'online' | 'offline';
  last_heartbeat_at: string | null;
  tags: string[];
}

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Edge agent eu-west-1',
    status: 'online',
    last_heartbeat_at: E2E_NOW,
    tags: ['eu-west-1'],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockAgentsList(
  page: Page,
  items: Agent[] = [makeAgent()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/data-connection/agents`, items, opts);
}

export async function mockAgentDetail(
  page: Page,
  item: Agent = makeAgent(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/data-connection/agents/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface AdminUser extends BaseEntity {
  email: string;
  name: string;
  is_active: boolean;
  roles: string[];
  groups: string[];
  mfa_enabled: boolean;
  last_login_at: string | null;
}

export function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'user-1',
    email: 'user-1@example.com',
    name: 'Sample User',
    is_active: true,
    roles: ['admin'],
    groups: [],
    mfa_enabled: false,
    last_login_at: E2E_NOW,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockUsersList(
  page: Page,
  items: AdminUser[] = [makeUser()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/users`, items, opts);
}

export async function mockUserDetail(
  page: Page,
  item: AdminUser = makeUser(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/users/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface Group extends BaseEntity {
  name: string;
  description: string;
  member_count: number;
  permissions: string[];
}

export function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: 'Engineers',
    description: 'Deterministic group',
    member_count: 1,
    permissions: ['read:*'],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockGroupsList(
  page: Page,
  items: Group[] = [makeGroup()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/groups`, items, opts);
}

export async function mockGroupDetail(
  page: Page,
  item: Group = makeGroup(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/groups/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Role sets
// ---------------------------------------------------------------------------

export interface RoleSet extends BaseEntity {
  name: string;
  description: string;
  roles: string[];
  permissions: Record<string, string[]>;
}

export function makeRoleSet(overrides: Partial<RoleSet> = {}): RoleSet {
  return {
    id: 'role-set-1',
    name: 'Engineering admin',
    description: 'Deterministic role set',
    roles: ['admin'],
    permissions: { datasets: ['*'] },
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockRoleSetsList(
  page: Page,
  items: RoleSet[] = [makeRoleSet()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/role-sets`, items, opts);
}

export async function mockRoleSetDetail(
  page: Page,
  item: RoleSet = makeRoleSet(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/role-sets/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Marking categories
// ---------------------------------------------------------------------------

export interface Marking {
  id: string;
  name: string;
  color: string;
}

export interface MarkingCategory extends BaseEntity {
  name: string;
  description: string;
  color: string;
  markings: Marking[];
}

export function makeMarkingCategory(
  overrides: Partial<MarkingCategory> = {},
): MarkingCategory {
  return {
    id: 'marking-category-1',
    name: 'PII',
    description: 'Personally identifiable information',
    color: '#ef4444',
    markings: [{ id: 'm-1', name: 'PII', color: '#ef4444' }],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockMarkingCategoriesList(
  page: Page,
  items: MarkingCategory[] = [makeMarkingCategory()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/marking-categories`, items, opts);
}

export async function mockMarkingCategoryDetail(
  page: Page,
  item: MarkingCategory = makeMarkingCategory(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/marking-categories/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Identity providers
// ---------------------------------------------------------------------------

export interface IdentityProvider extends BaseEntity {
  name: string;
  slug: string;
  kind: 'oidc' | 'saml';
  enabled: boolean;
  issuer: string | null;
  client_id: string | null;
}

export function makeIdentityProvider(
  overrides: Partial<IdentityProvider> = {},
): IdentityProvider {
  return {
    id: 'idp-1',
    name: 'Corporate SSO',
    slug: 'corp-sso',
    kind: 'oidc',
    enabled: true,
    issuer: 'https://idp.example.com',
    client_id: 'openfoundry-e2e',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockIdentityProvidersList(
  page: Page,
  items: IdentityProvider[] = [makeIdentityProvider()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/auth/sso/providers`, items, opts);
}

export async function mockIdentityProviderDetail(
  page: Page,
  item: IdentityProvider = makeIdentityProvider(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/auth/sso/providers/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export interface Notebook extends BaseEntity {
  name: string;
  description: string;
  kernel: 'python' | 'r' | 'sql';
  owner_id: string;
  cells: unknown[];
}

export function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    id: 'notebook-1',
    name: 'Exploration',
    description: 'Deterministic notebook',
    kernel: 'python',
    owner_id: 'user-1',
    cells: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockNotebooksList(
  page: Page,
  items: Notebook[] = [makeNotebook()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/notebooks`, items, opts);
}

export async function mockNotebookDetail(
  page: Page,
  item: Notebook = makeNotebook(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/notebooks/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Notepad
// ---------------------------------------------------------------------------

export interface NotepadNote extends BaseEntity {
  title: string;
  content: string;
  pinned: boolean;
  archived: boolean;
}

export function makeNotepadNote(overrides: Partial<NotepadNote> = {}): NotepadNote {
  return {
    id: 'notepad-1',
    title: 'Sample note',
    content: 'Deterministic note body',
    pinned: false,
    archived: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockNotepadList(
  page: Page,
  items: NotepadNote[] = [makeNotepadNote()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/notepad`, items, opts);
}

export async function mockNotepadDetail(
  page: Page,
  item: NotepadNote = makeNotepadNote(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/notepad/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Media sets
// ---------------------------------------------------------------------------

export interface MediaSet extends BaseEntity {
  name: string;
  description: string;
  media_type: 'image' | 'video' | 'audio' | 'mixed';
  item_count: number;
}

export function makeMediaSet(overrides: Partial<MediaSet> = {}): MediaSet {
  return {
    id: 'media-set-1',
    name: 'Field photos 2026',
    description: 'Deterministic media set',
    media_type: 'image',
    item_count: 0,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockMediaSetsList(
  page: Page,
  items: MediaSet[] = [makeMediaSet()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/media-sets`, items, opts);
}

export async function mockMediaSetDetail(
  page: Page,
  item: MediaSet = makeMediaSet(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/media-sets/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface StreamingStream extends BaseEntity {
  name: string;
  topic: string;
  status: 'active' | 'paused' | 'error';
  consumer_count: number;
  schema_id: string | null;
}

export function makeStream(overrides: Partial<StreamingStream> = {}): StreamingStream {
  return {
    id: 'stream-1',
    name: 'orders.events',
    topic: 'orders',
    status: 'active',
    consumer_count: 1,
    schema_id: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockStreamingList(
  page: Page,
  items: StreamingStream[] = [makeStream()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/streaming`, items, opts);
}

export async function mockStreamingDetail(
  page: Page,
  item: StreamingStream = makeStream(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/streaming/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// ML models
// ---------------------------------------------------------------------------

export interface MlModel extends BaseEntity {
  name: string;
  framework: 'pytorch' | 'tensorflow' | 'sklearn' | 'xgboost';
  version: string;
  stage: 'development' | 'staging' | 'production';
  deployed: boolean;
  metrics: Record<string, number>;
}

export function makeMlModel(overrides: Partial<MlModel> = {}): MlModel {
  return {
    id: 'ml-model-1',
    name: 'risk-scorer',
    framework: 'sklearn',
    version: '1.0.0',
    stage: 'production',
    deployed: true,
    metrics: { auc: 0.92 },
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockMlModelsList(
  page: Page,
  items: MlModel[] = [makeMlModel()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/ml-models`, items, opts);
}

export async function mockMlModelDetail(
  page: Page,
  item: MlModel = makeMlModel(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/ml-models/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Threads (AI conversations)
// ---------------------------------------------------------------------------

export interface Thread extends BaseEntity {
  title: string;
  owner_id: string;
  message_count: number;
  pinned: boolean;
}

export function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    title: 'Sample conversation',
    owner_id: 'user-1',
    message_count: 0,
    pinned: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockThreadsList(
  page: Page,
  items: Thread[] = [makeThread()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/ai/conversations`, items, opts);
}

export async function mockThreadDetail(
  page: Page,
  item: Thread = makeThread(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/ai/conversations/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Documents (knowledge base documents for AI)
// ---------------------------------------------------------------------------

export interface AiDocument extends BaseEntity {
  name: string;
  mime_type: string;
  size_bytes: number;
  status: 'queued' | 'indexing' | 'ready' | 'failed';
  knowledge_base_id: string;
}

export function makeDocument(overrides: Partial<AiDocument> = {}): AiDocument {
  return {
    id: 'document-1',
    name: 'handbook.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024 * 1024,
    status: 'ready',
    knowledge_base_id: 'kb-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockDocumentsList(
  page: Page,
  items: AiDocument[] = [makeDocument()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, /\/api\/v1\/ai\/knowledge-bases\/[^/]+\/documents/, items, opts);
}

export async function mockDocumentDetail(
  page: Page,
  item: AiDocument = makeDocument(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/ai/knowledge-bases/[^/]+/documents/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Iceberg tables
// ---------------------------------------------------------------------------

export interface IcebergTable extends BaseEntity {
  namespace: string;
  name: string;
  format: 'iceberg';
  snapshot_count: number;
  partition_count: number;
}

export function makeIcebergTable(overrides: Partial<IcebergTable> = {}): IcebergTable {
  return {
    id: 'iceberg-table-1',
    namespace: 'default',
    name: 'transactions',
    format: 'iceberg',
    snapshot_count: 1,
    partition_count: 4,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockIcebergTablesList(
  page: Page,
  items: IcebergTable[] = [makeIcebergTable()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/iceberg-tables`, items, opts);
}

export async function mockIcebergTableDetail(
  page: Page,
  item: IcebergTable = makeIcebergTable(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/iceberg-tables/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Virtual tables
// ---------------------------------------------------------------------------

export interface VirtualTable extends BaseEntity {
  name: string;
  description: string;
  query: string;
  source_dataset_ids: string[];
}

export function makeVirtualTable(overrides: Partial<VirtualTable> = {}): VirtualTable {
  return {
    id: 'virtual-table-1',
    name: 'high_value_customers',
    description: 'Deterministic virtual table',
    query: 'SELECT * FROM customers WHERE lifetime_value > 1000',
    source_dataset_ids: ['dataset-1'],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockVirtualTablesList(
  page: Page,
  items: VirtualTable[] = [makeVirtualTable()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/virtual-tables`, items, opts);
}

export async function mockVirtualTableDetail(
  page: Page,
  item: VirtualTable = makeVirtualTable(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/virtual-tables/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Apps (Workshop apps)
// ---------------------------------------------------------------------------

export interface WorkshopAppListItem extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'published';
  owner_id: string;
}

export function makeApp(overrides: Partial<WorkshopAppListItem> = {}): WorkshopAppListItem {
  return {
    id: 'app-1',
    name: 'Sample app',
    slug: 'sample-app',
    description: 'Deterministic Workshop app',
    status: 'published',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockAppsList(
  page: Page,
  items: WorkshopAppListItem[] = [makeApp()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/apps`, items, opts);
}

export async function mockAppDetail(
  page: Page,
  item: WorkshopAppListItem = makeApp(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/apps/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit-1',
    actor_id: 'user-1',
    action: 'dataset.read',
    resource_type: 'dataset',
    resource_id: 'dataset-1',
    occurred_at: E2E_NOW,
    payload: {},
    ...overrides,
  };
}

export async function mockAuditEventsList(
  page: Page,
  items: AuditEvent[] = [makeAuditEvent()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/audit/events`, items, opts);
}

export async function mockAuditEventDetail(
  page: Page,
  item: AuditEvent = makeAuditEvent(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/audit/events/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification extends BaseEntity {
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  category: string;
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    title: 'Sample notification',
    body: 'A pipeline finished successfully.',
    read: false,
    link: '/pipelines/pipeline-1',
    category: 'pipeline',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockNotificationsList(
  page: Page,
  items: Notification[] = [makeNotification()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/notifications`, items, opts);
}

export async function mockNotificationDetail(
  page: Page,
  item: Notification = makeNotification(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/notifications/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Retention policies
// ---------------------------------------------------------------------------

export interface RetentionPolicy extends BaseEntity {
  name: string;
  description: string;
  target_resource_type: string;
  ttl_days: number;
  action: 'archive' | 'delete';
  paused: boolean;
}

export function makeRetentionPolicy(
  overrides: Partial<RetentionPolicy> = {},
): RetentionPolicy {
  return {
    id: 'retention-1',
    name: '90-day raw events',
    description: 'Deterministic retention policy',
    target_resource_type: 'dataset',
    ttl_days: 90,
    action: 'archive',
    paused: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockRetentionPoliciesList(
  page: Page,
  items: RetentionPolicy[] = [makeRetentionPolicy()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/retention`, items, opts);
}

export async function mockRetentionPolicyDetail(
  page: Page,
  item: RetentionPolicy = makeRetentionPolicy(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/retention/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Restricted views
// ---------------------------------------------------------------------------

export interface RestrictedView extends BaseEntity {
  name: string;
  resource_id: string;
  condition: string;
  authorized_roles: string[];
}

export function makeRestrictedView(
  overrides: Partial<RestrictedView> = {},
): RestrictedView {
  return {
    id: 'restricted-view-1',
    name: 'EU customers only',
    resource_id: 'dataset-1',
    condition: 'region = "EU"',
    authorized_roles: ['eu-admin'],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockRestrictedViewsList(
  page: Page,
  items: RestrictedView[] = [makeRestrictedView()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/restricted-views`, items, opts);
}

export async function mockRestrictedViewDetail(
  page: Page,
  item: RestrictedView = makeRestrictedView(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/restricted-views/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Third-party applications (OAuth clients)
// ---------------------------------------------------------------------------

export interface ThirdPartyApp extends BaseEntity {
  name: string;
  client_id: string;
  redirect_uris: string[];
  scopes: string[];
  revoked: boolean;
}

export function makeThirdPartyApp(overrides: Partial<ThirdPartyApp> = {}): ThirdPartyApp {
  return {
    id: 'third-party-app-1',
    name: 'Sample integration',
    client_id: 'openfoundry-e2e-client',
    redirect_uris: ['https://example.com/callback'],
    scopes: ['openid', 'profile'],
    revoked: false,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockThirdPartyAppsList(
  page: Page,
  items: ThirdPartyApp[] = [makeThirdPartyApp()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/third-party-applications`, items, opts);
}

export async function mockThirdPartyAppDetail(
  page: Page,
  item: ThirdPartyApp = makeThirdPartyApp(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(
    page,
    new RegExp(`/api/v1/third-party-applications/${item.id}$`),
    item,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Code repos
// ---------------------------------------------------------------------------

export interface CodeRepo extends BaseEntity {
  name: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  url: string;
  default_branch: string;
  connected: boolean;
}

export function makeCodeRepo(overrides: Partial<CodeRepo> = {}): CodeRepo {
  return {
    id: 'code-repo-1',
    name: 'openfoundry/sample',
    provider: 'github',
    url: 'https://github.com/openfoundry/sample',
    default_branch: 'main',
    connected: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockCodeReposList(
  page: Page,
  items: CodeRepo[] = [makeCodeRepo()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/code-repos`, items, opts);
}

export async function mockCodeRepoDetail(
  page: Page,
  item: CodeRepo = makeCodeRepo(),
  opts: DetailOptions = {},
): Promise<void> {
  await fulfillDetail(page, new RegExp(`/api/v1/code-repos/${item.id}$`), item, opts);
}

// ---------------------------------------------------------------------------
// Workspace (favorites + recent + search)
// ---------------------------------------------------------------------------

export interface WorkspaceItem {
  id: string;
  resource_type: string;
  resource_id: string;
  name: string;
  url: string;
  accessed_at?: string;
}

export function makeWorkspaceItem(overrides: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    id: 'workspace-1',
    resource_type: 'dataset',
    resource_id: 'dataset-1',
    name: 'Sample dataset',
    url: '/datasets/dataset-1',
    accessed_at: E2E_NOW,
    ...overrides,
  };
}

export async function mockFavoritesList(
  page: Page,
  items: WorkspaceItem[] = [makeWorkspaceItem()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/workspace/favorites`, items, opts);
}

export async function mockRecentList(
  page: Page,
  items: WorkspaceItem[] = [makeWorkspaceItem()],
  opts: ListOptions = {},
): Promise<void> {
  await fulfillList(page, `${BASE}/workspace/recent`, items, opts);
}

// ---------------------------------------------------------------------------
// Convenience: install a realistic dataset of mocks in one call
// ---------------------------------------------------------------------------

/**
 * Install one non-empty mock per major resource. Useful for "the page renders
 * with realistic data" smoke specs that don't care about specific shapes.
 * Composes on top of {@link installDefaultApiMocks}; call BOTH (defaults
 * first, then this one) before navigating.
 */
export async function installPopulatedApiMocks(page: Page): Promise<void> {
  await mockDatasetsList(page);
  await mockProjectsList(page);
  await mockPipelinesList(page);
  await mockSchedulesList(page);
  await mockBuildsList(page);
  await mockOntologyTypesList(page);
  await mockObjectTypesList(page);
  await mockObjectViewsList(page);
  await mockActionTypesList(page);
  await mockFunctionsList(page);
  await mockConnectorsList(page);
  await mockAgentsList(page);
  await mockUsersList(page);
  await mockGroupsList(page);
  await mockRoleSetsList(page);
  await mockMarkingCategoriesList(page);
  await mockNotebooksList(page);
  await mockNotepadList(page);
  await mockMediaSetsList(page);
  await mockStreamingList(page);
  await mockMlModelsList(page);
  await mockThreadsList(page);
  await mockIcebergTablesList(page);
  await mockVirtualTablesList(page);
  await mockAppsList(page);
  await mockAuditEventsList(page);
  await mockNotificationsList(page);
  await mockRetentionPoliciesList(page);
  await mockRestrictedViewsList(page);
  await mockThirdPartyAppsList(page);
  await mockCodeReposList(page);
  await mockFavoritesList(page);
  await mockRecentList(page);
}
