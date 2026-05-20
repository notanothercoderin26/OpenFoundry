import type { Page } from '@playwright/test';
import { E2E_NOW } from './mocks';

export type WorkshopWidget = {
  id: string;
  widget_type: string;
  title?: string;
  description?: string;
  position?: { x: number; y: number; width: number; height: number };
  props?: Record<string, unknown>;
  binding?: unknown;
  events?: unknown[];
  children?: WorkshopWidget[];
};

export type WorkshopOverlay = {
  id: string;
  name: string;
  overlay_type: 'drawer' | 'modal' | string;
  visible_variable_id: string;
  layout?: { kind: string; columns: number; gap: string; max_width: string };
  widgets: WorkshopWidget[];
  sections?: unknown[];
  props: Record<string, unknown>;
};

export type WorkshopPage = {
  id: string;
  name: string;
  path?: string;
  description?: string;
  visible?: boolean;
  layout?: { kind: string; columns: number; gap: string; max_width: string };
  widgets: WorkshopWidget[];
  sections?: unknown[];
  overlays?: WorkshopOverlay[];
};

export type WorkshopVariable = {
  id: string;
  kind: 'primitive' | 'object_set' | string;
  name: string;
  default_value?: unknown;
  [k: string]: unknown;
};

export type WorkshopAppInput = {
  id?: string;
  slug: string;
  name?: string;
  description?: string;
  status?: 'draft' | 'published';
  pages: WorkshopPage[];
  variables?: WorkshopVariable[];
  objectSetVariables?: unknown[];
  homePageId?: string;
  navigationStyle?: string;
  maxWidth?: string;
  themeOverrides?: Record<string, unknown>;
  settingsOverrides?: Record<string, unknown>;
  publishedVersionNumber?: number;
  /** ISO timestamp for created_at / updated_at / published_at. Defaults to `E2E_NOW`. */
  now?: string;
  createdBy?: string;
  publishedVersionId?: string | null;
  templateKey?: string | null;
};

const DEFAULT_THEME = {
  name: 'E2E Theme',
  primary_color: '#0f766e',
  accent_color: '#c2410c',
  background_color: '#f8fafc',
  surface_color: '#ffffff',
  text_color: '#0f172a',
  heading_font: 'Inter',
  body_font: 'Inter',
  border_radius: 8,
  logo_url: null,
};

const DEFAULT_CONSUMER_MODE = {
  enabled: false,
  allow_guest_access: false,
  portal_title: null,
  portal_subtitle: null,
  primary_cta_label: null,
  primary_cta_url: null,
};

const DEFAULT_INTERACTIVE_WORKSHOP = {
  enabled: false,
  title: null,
  subtitle: null,
  briefing_template: null,
  primary_scenario_widget_id: null,
  primary_agent_widget_id: null,
  suggested_questions: [],
  scenario_presets: [],
};

const DEFAULT_SLATE = {
  enabled: false,
  framework: 'react',
  package_name: '',
  entry_file: '',
  sdk_import: '',
  workspace: {
    enabled: false,
    repository_id: null,
    layout: '',
    runtime: '',
    dev_command: '',
    preview_command: '',
    files: [],
  },
  quiver_embed: {
    enabled: false,
    primary_type_id: null,
    secondary_type_id: null,
    join_field: null,
    secondary_join_field: null,
    date_field: null,
    metric_field: null,
    group_field: null,
    selected_group: null,
  },
};

function fillPage(p: WorkshopPage): WorkshopPage {
  return {
    path: '/',
    description: '',
    visible: true,
    layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
    sections: [],
    ...p,
  };
}

/**
 * Builds a complete Workshop app response object matching the production API
 * shape. Only `slug` and `pages` are required; everything else has a sensible
 * default suitable for E2E tests.
 */
export function defineWorkshopApp(input: WorkshopAppInput) {
  const slug = input.slug;
  const id = input.id ?? `${slug}-app`;
  const homePageId = input.homePageId ?? input.pages[0]?.id ?? 'main';
  const now = input.now ?? E2E_NOW;

  return {
    app: {
      id,
      name: input.name ?? slug,
      slug,
      description: input.description ?? '',
      status: input.status ?? 'published',
      pages: input.pages.map(fillPage),
      theme: { ...DEFAULT_THEME, name: input.name ?? slug, ...input.themeOverrides },
      settings: {
        home_page_id: homePageId,
        navigation_style: input.navigationStyle ?? 'none',
        max_width: input.maxWidth ?? '1280px',
        show_branding: false,
        custom_css: null,
        builder_experience: 'workshop',
        ontology_source_type_id: null,
        object_set_variables: input.objectSetVariables ?? [],
        workshop_variables: input.variables ?? [],
        consumer_mode: DEFAULT_CONSUMER_MODE,
        interactive_workshop: DEFAULT_INTERACTIVE_WORKSHOP,
        workshop_header: { title: null, icon: null, color: null },
        slate: DEFAULT_SLATE,
        ...input.settingsOverrides,
      },
      template_key: input.templateKey ?? null,
      created_by: input.createdBy ?? 'e2e',
      published_version_id: input.publishedVersionId === undefined ? 'version-1' : input.publishedVersionId,
      created_at: now,
      updated_at: now,
    },
    embed: { url: `/apps/runtime/${slug}`, iframe_html: '' },
    published_version_number: input.publishedVersionNumber ?? 1,
    published_at: now,
  };
}

/**
 * Registers a route mock for `GET /api/v1/apps/public/:slug` returning the
 * given workshop app definition.
 */
export async function mockWorkshopApp(
  page: Page,
  slug: string,
  app: ReturnType<typeof defineWorkshopApp>,
): Promise<void> {
  await page.route(`**/api/v1/apps/public/${slug}`, async (route) => {
    await route.fulfill({ json: app });
  });
}

export function textWidget(
  id: string,
  content: string,
  overrides: Partial<WorkshopWidget> = {},
): WorkshopWidget {
  return {
    id,
    widget_type: 'text',
    title: '',
    description: '',
    position: { x: 0, y: 0, width: 12, height: 1 },
    props: { content },
    binding: null,
    events: [],
    children: [],
    ...overrides,
  };
}

export function buttonWidget(
  id: string,
  label: string,
  events: unknown[] = [],
  overrides: Partial<WorkshopWidget> = {},
): WorkshopWidget {
  return {
    id,
    widget_type: 'button',
    title: '',
    description: '',
    position: { x: 0, y: 0, width: 4, height: 1 },
    props: { label },
    binding: null,
    events,
    children: [],
    ...overrides,
  };
}
