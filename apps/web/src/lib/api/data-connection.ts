import api from './client';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Capabilities a connector can support. Mirrors the Foundry "Data Connection"
 * core concepts page; only a subset is wired in the MVP backend.
 */
export type ConnectorCapability =
  | 'batch_sync'
  | 'streaming_sync'
  | 'cdc_sync'
  | 'media_sync'
  | 'hyperauto'
  | 'file_export'
  | 'table_export'
  | 'streaming_export'
  | 'webhook'
  | 'virtual_table'
  | 'virtual_media'
  | 'exploration'
  | 'use_in_code';

export type SourceWorker = 'foundry' | 'agent';

export type ConnectorCategory =
  | 'databases'
  | 'filesystems_blob_stores'
  | 'event_streams'
  | 'message_queues'
  | 'rest_apis'
  | 'productivity_tools'
  | 'saas_applications'
  | 'geospatial_systems'
  | 'media_sources'
  | 'generic_connectors';

export type ConnectorCredentialKind =
  | 'none'
  | 'username_password'
  | 'api_key'
  | 'bearer_token'
  | 'oauth_client'
  | 'cloud_identity'
  | 'service_account_json'
  | 'certificate_key'
  | 'connector_specific';

export interface ConnectorCredentialField {
  key: string;
  label: string;
  kind: ConnectorCredentialKind;
  required: boolean;
  secret: boolean;
  description?: string;
}

export type ConnectorNetworkMode = 'direct_egress' | 'agent_proxy' | 'agent_worker' | 'public_internet' | 'listener';

export interface ConnectorNetworkRequirement {
  modes: ConnectorNetworkMode[];
  defaultPorts: number[];
  privateNetworkSupported: boolean;
  notes: string;
}

export interface ConnectorFeatureFlags {
  supportsDiscovery: boolean;
  supportsConnectionTest: boolean;
  supportsIncrementalSync: boolean;
  supportsStreaming: boolean;
  supportsVirtualTables: boolean;
  supportsExports: boolean;
  supportsWebhooks: boolean;
  supportsMedia: boolean;
}

/**
 * Available connector type listed in the gallery. `available: false` means we
 * advertise the connector but do not allow source creation yet — explicit
 * about the MVP scope so we don't promise capabilities we don't ship.
 */
export interface ConnectorCatalogEntry {
  type: string;
  name: string;
  description: string;
  capabilities: ConnectorCapability[];
  workers: SourceWorker[];
  workerCapabilities?: Partial<Record<SourceWorker, ConnectorCapability[]>>;
  available: boolean;
  category: ConnectorCategory;
  credentialFields: ConnectorCredentialField[];
  network: ConnectorNetworkRequirement;
  setupDocsUrl: string;
  featureFlags: ConnectorFeatureFlags;
  /**
   * Legacy UI grouping retained for backend responses that still send the
   * earlier family shape. Prefer `category` for new source-type registry UI.
   */
  family?: ConnectorFamily;
}

export type ConnectorFamily =
  | 'Storage'
  | 'Streaming'
  | 'SaaS'
  | 'RDBMS'
  | 'API';

export const CONNECTOR_FAMILY_ORDER: ConnectorFamily[] = [
  'Storage',
  'RDBMS',
  'Streaming',
  'SaaS',
  'API',
];

export const CONNECTOR_CATEGORY_ORDER: ConnectorCategory[] = [
  'databases',
  'filesystems_blob_stores',
  'event_streams',
  'message_queues',
  'rest_apis',
  'productivity_tools',
  'saas_applications',
  'geospatial_systems',
  'media_sources',
  'generic_connectors',
];

export interface ConnectorCatalog {
  connectors: ConnectorCatalogEntry[];
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type SourceStatus =
  | 'draft'
  | 'configuring'
  | 'healthy'
  | 'degraded'
  | 'error';

export interface SourceHealthSummary {
  state: SourceStatus;
  last_checked_at: string | null;
  recent_failures: number;
  message: string | null;
}

export type DataConnectionHealthState = 'ok' | 'warning' | 'critical' | 'unknown';
export type DataConnectionHealthSeverity = 'info' | 'warning' | 'critical';
export type DataConnectionHealthSurface =
  | 'source'
  | 'agent'
  | 'credential'
  | 'network_policy'
  | 'sync'
  | 'stream'
  | 'export'
  | 'webhook'
  | 'cdc'
  | 'virtual_table'
  | 'schedule'
  | 'retry';

export interface DataConnectionHealthCounts {
  ok: number;
  warning: number;
  critical: number;
  unknown: number;
}

export interface DataConnectionHealthCheck {
  code: string;
  label: string;
  surface: DataConnectionHealthSurface;
  severity: DataConnectionHealthSeverity;
  state: DataConnectionHealthState;
  message: string;
  resource_id?: string | null;
  resource_rid?: string | null;
  resource_name?: string | null;
  recommendation?: string | null;
  last_observed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DataConnectionHealthSummary {
  source_id: string;
  source_rid: string;
  state: DataConnectionHealthState;
  checked_at: string;
  counts: DataConnectionHealthCounts;
  surfaces: DataConnectionHealthSurface[];
  checks: DataConnectionHealthCheck[];
}

// SDC.40 — Automatic retries and failure recovery wire shapes + pure helpers.
export type RetryFailureCategory =
  | 'source'
  | 'network'
  | 'credential'
  | 'destination'
  | 'unknown';

export const RETRY_FAILURE_CATEGORIES: RetryFailureCategory[] = [
  'source',
  'network',
  'credential',
  'destination',
];

export interface RetryBackoffPolicy {
  max_attempts: number;
  initial_backoff_seconds: number;
  max_backoff_seconds: number;
  backoff_multiplier: number;
  jitter_ratio: number;
  preserve_checkpoint: boolean;
  escalate_after_attempts: number;
  retryable_substrings?: string[] | null;
  non_retryable_substrings?: string[] | null;
}

export interface SourceRetryPolicy {
  source_id: string;
  source_rid: string;
  categories: Partial<Record<RetryFailureCategory, RetryBackoffPolicy>>;
  updated_by?: string | null;
  updated_at: string;
}

export interface UpdateSourceRetryPolicyRequest {
  categories: Partial<Record<RetryFailureCategory, RetryBackoffPolicy>>;
}

export type RetryDecisionAction = 'retry' | 'exhausted' | 'escalate' | 'no_retry';

export interface RetryDecision {
  action: RetryDecisionAction;
  next_attempt: number;
  max_attempts: number;
  backoff_seconds: number;
  next_retry_at?: string | null;
  category: RetryFailureCategory;
  escalate_to_data_health: boolean;
  preserve_checkpoint: boolean;
  reason: string;
}

export interface RetryRecoveryRunSummary {
  sync_def_id: string;
  sync_def_name?: string;
  run_id: string;
  status: string;
  attempt: number;
  max_attempts: number;
  category: RetryFailureCategory;
  error?: string;
  next_retry_at?: string | null;
  has_checkpoint: boolean;
  checkpoint_summary?: string;
  started_at: string;
  finished_at?: string | null;
  escalated: boolean;
  decision?: RetryDecision | null;
}

export interface RetryRecoverySummary {
  source_id: string;
  source_rid: string;
  policy: SourceRetryPolicy;
  recent_runs: RetryRecoveryRunSummary[];
  backoff_in_progress_count: number;
  exhausted_count: number;
  escalated_count: number;
  checkpoint_preserved_runs: number;
  checked_at: string;
}

const DEFAULT_NETWORK_RETRY_SUBSTRINGS = [
  'connection reset',
  'connection refused',
  'timeout',
  'tls handshake',
  'i/o timeout',
  'no route to host',
  'temporary failure',
  '503',
  '504',
];

const DEFAULT_CREDENTIAL_RETRY_SUBSTRINGS = [
  'token expired',
  'expired token',
  '401',
  'unauthorized: retry',
  'refresh required',
];

const DEFAULT_CREDENTIAL_NON_RETRYABLE = ['invalid credentials', 'permission denied', 'forbidden'];

const DEFAULT_DESTINATION_RETRY_SUBSTRINGS = [
  'write conflict',
  'dataset busy',
  'lock timeout',
  'transient',
  'throttled',
  'rate limit',
];

const DEFAULT_DESTINATION_NON_RETRYABLE = ['schema mismatch', 'constraint violation'];

const DEFAULT_SOURCE_RETRY_SUBSTRINGS = ['temporary', 'transient', 'retry', 'server busy', 'throttled'];

export function defaultRetryBackoffPolicy(category: RetryFailureCategory): RetryBackoffPolicy {
  switch (category) {
    case 'network':
      return {
        max_attempts: 6,
        initial_backoff_seconds: 5,
        max_backoff_seconds: 600,
        backoff_multiplier: 2,
        jitter_ratio: 0.2,
        preserve_checkpoint: true,
        escalate_after_attempts: 4,
        retryable_substrings: [...DEFAULT_NETWORK_RETRY_SUBSTRINGS],
      };
    case 'credential':
      return {
        max_attempts: 3,
        initial_backoff_seconds: 30,
        max_backoff_seconds: 600,
        backoff_multiplier: 2,
        jitter_ratio: 0.1,
        preserve_checkpoint: true,
        escalate_after_attempts: 2,
        retryable_substrings: [...DEFAULT_CREDENTIAL_RETRY_SUBSTRINGS],
        non_retryable_substrings: [...DEFAULT_CREDENTIAL_NON_RETRYABLE],
      };
    case 'destination':
      return {
        max_attempts: 5,
        initial_backoff_seconds: 15,
        max_backoff_seconds: 1800,
        backoff_multiplier: 2,
        jitter_ratio: 0.2,
        preserve_checkpoint: true,
        escalate_after_attempts: 3,
        retryable_substrings: [...DEFAULT_DESTINATION_RETRY_SUBSTRINGS],
        non_retryable_substrings: [...DEFAULT_DESTINATION_NON_RETRYABLE],
      };
    case 'source':
    default:
      return {
        max_attempts: 4,
        initial_backoff_seconds: 10,
        max_backoff_seconds: 900,
        backoff_multiplier: 2,
        jitter_ratio: 0.2,
        preserve_checkpoint: true,
        escalate_after_attempts: 3,
        retryable_substrings: [...DEFAULT_SOURCE_RETRY_SUBSTRINGS],
      };
  }
}

export function classifyRunFailure(errorMessage: string | null | undefined): RetryFailureCategory {
  const msg = (errorMessage ?? '').toLowerCase().trim();
  if (!msg) return 'unknown';
  const credentialMarkers = [
    'unauthorized',
    '401',
    '403',
    'forbidden',
    'credential',
    'token expired',
    'expired token',
    'permission denied',
    'access denied',
    'invalid signature',
  ];
  if (credentialMarkers.some((marker) => msg.includes(marker))) return 'credential';
  const networkMarkers = [
    'connection reset',
    'connection refused',
    'timeout',
    'dns',
    'i/o timeout',
    'tls handshake',
    'no route to host',
    'network is unreachable',
    'eof',
    'broken pipe',
    '503',
    '504',
    '502 bad gateway',
  ];
  if (networkMarkers.some((marker) => msg.includes(marker))) return 'network';
  const destinationMarkers = [
    'dataset',
    'dataset version',
    'transaction',
    'write conflict',
    'schema mismatch',
    'constraint',
    'lock timeout',
    'throttled',
    'rate limit',
    'destination',
    'stream archive',
  ];
  if (destinationMarkers.some((marker) => msg.includes(marker))) return 'destination';
  return 'source';
}

export function computeRetryBackoffSeconds(policy: RetryBackoffPolicy, attempt: number): number {
  const effectiveAttempt = attempt < 1 ? 1 : attempt;
  const base = policy.initial_backoff_seconds > 0 ? policy.initial_backoff_seconds : 1;
  const multiplier = policy.backoff_multiplier > 1 ? policy.backoff_multiplier : 1;
  let value = base;
  for (let i = 1; i < effectiveAttempt; i += 1) {
    value *= multiplier;
    if (policy.max_backoff_seconds > 0 && value >= policy.max_backoff_seconds) {
      value = policy.max_backoff_seconds;
      break;
    }
  }
  if (policy.max_backoff_seconds > 0 && value > policy.max_backoff_seconds) {
    value = policy.max_backoff_seconds;
  }
  return Math.max(1, Math.round(value));
}

export interface EvaluateRetryDecisionInput {
  category: RetryFailureCategory;
  errorMessage?: string;
  attempt: number;
  hasCheckpoint?: boolean;
  now?: Date;
}

export function evaluateRetryDecision(policy: RetryBackoffPolicy, input: EvaluateRetryDecisionInput): RetryDecision {
  const attempt = Math.max(1, input.attempt);
  const now = input.now ?? new Date();
  const msg = (input.errorMessage ?? '').toLowerCase();
  const hasCheckpoint = input.hasCheckpoint ?? false;

  const matches = (markers?: string[] | null) =>
    !!markers && markers.some((marker) => marker.trim() !== '' && msg.includes(marker.toLowerCase()));

  if (matches(policy.non_retryable_substrings)) {
    return {
      action: 'no_retry',
      next_attempt: attempt,
      max_attempts: policy.max_attempts,
      backoff_seconds: 0,
      next_retry_at: null,
      category: input.category,
      escalate_to_data_health: true,
      preserve_checkpoint: policy.preserve_checkpoint && hasCheckpoint,
      reason: 'Failure matched a non-retryable signature; manual remediation required.',
    };
  }

  let retryable = true;
  if (policy.retryable_substrings && policy.retryable_substrings.length > 0) {
    retryable = matches(policy.retryable_substrings);
  }
  if (!retryable) {
    return {
      action: 'no_retry',
      next_attempt: attempt,
      max_attempts: policy.max_attempts,
      backoff_seconds: 0,
      next_retry_at: null,
      category: input.category,
      escalate_to_data_health: true,
      preserve_checkpoint: policy.preserve_checkpoint && hasCheckpoint,
      reason: 'Failure signature is outside the configured retryable patterns for this category.',
    };
  }

  if (attempt >= policy.max_attempts) {
    return {
      action: 'exhausted',
      next_attempt: attempt,
      max_attempts: policy.max_attempts,
      backoff_seconds: 0,
      next_retry_at: null,
      category: input.category,
      escalate_to_data_health: true,
      preserve_checkpoint: policy.preserve_checkpoint && hasCheckpoint,
      reason: `Reached the configured max ${policy.max_attempts} attempts for ${input.category} failures.`,
    };
  }

  const nextAttempt = attempt + 1;
  const backoff = computeRetryBackoffSeconds(policy, nextAttempt);
  const nextRetryAt = new Date(now.getTime() + backoff * 1000).toISOString();
  const escalate = attempt >= policy.escalate_after_attempts;

  return {
    action: escalate ? 'escalate' : 'retry',
    next_attempt: nextAttempt,
    max_attempts: policy.max_attempts,
    backoff_seconds: backoff,
    next_retry_at: nextRetryAt,
    category: input.category,
    escalate_to_data_health: escalate,
    preserve_checkpoint: policy.preserve_checkpoint && hasCheckpoint,
    reason: escalate
      ? `Attempt ${nextAttempt}/${policy.max_attempts} scheduled in ${backoff}s. Persistent failure escalated to Data Health.`
      : `Attempt ${nextAttempt}/${policy.max_attempts} scheduled in ${backoff}s.`,
  };
}

export function retryFailureCategoryLabel(category: RetryFailureCategory): string {
  switch (category) {
    case 'source':
      return 'Source';
    case 'network':
      return 'Network';
    case 'credential':
      return 'Credential';
    case 'destination':
      return 'Destination';
    default:
      return 'Unknown';
  }
}

export function retryDecisionActionLabel(action: RetryDecisionAction): string {
  switch (action) {
    case 'retry':
      return 'Retry scheduled';
    case 'escalate':
      return 'Escalate to Data Health';
    case 'exhausted':
      return 'Attempts exhausted';
    case 'no_retry':
      return 'Manual remediation';
    default:
      return action;
  }
}

export interface SourceUsageSummary {
  sync_count: number;
  export_count: number;
  webhook_count: number;
  virtual_table_count: number;
  code_import_count: number;
  last_used_at: string | null;
}

export interface SourceAuditMetadata {
  created_by: string | null;
  updated_by: string | null;
  archived_by?: string | null;
  archived_at?: string | null;
  last_event_id?: string | null;
}

export interface Source {
  id: string;
  name: string;
  description?: string | null;
  connector_type: string;
  project_rid?: string | null;
  folder_rid?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  organization_id?: string | null;
  worker: SourceWorker;
  status: SourceStatus;
  network_policy_id?: string | null;
  credential_reference_ids?: string[] | null;
  default_output_location?: string | null;
  supported_capabilities?: ConnectorCapability[] | null;
  health?: SourceHealthSummary | null;
  usage?: SourceUsageSummary | null;
  audit?: SourceAuditMetadata | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceListResponse {
  data: Source[];
  total: number;
  page: number;
  per_page: number;
}

export interface CreateSourceRequest {
  name: string;
  connector_type: string;
  worker?: SourceWorker;
  description?: string;
  project_rid?: string;
  folder_rid?: string;
  owner_id?: string;
  default_output_location?: string;
  config?: Record<string, unknown>;
}

export interface UpdateSourceRequest {
  name?: string;
  description?: string | null;
  worker?: SourceWorker;
  project_rid?: string | null;
  folder_rid?: string | null;
  owner_id?: string | null;
  default_output_location?: string | null;
  config?: Record<string, unknown>;
}

export interface DuplicateSourceRequest {
  name: string;
  description?: string;
  project_rid?: string;
  folder_rid?: string;
  copy_credentials?: boolean;
  copy_network_policies?: boolean;
}

export interface ArchiveSourceRequest {
  reason?: string;
}

export type SourcePermissionRole =
  | 'source_view'
  | 'source_edit'
  | 'source_use'
  | 'source_owner'
  | 'webhook_execute'
  | 'sync_create'
  | 'export_create'
  | 'code_import';

export interface SourcePermissionRoleDefinition {
  role: SourcePermissionRole;
  label: string;
  description: string;
  implied_roles?: SourcePermissionRole[];
}

export interface SourcePermissionGrant {
  id?: string;
  source_id?: string;
  principal_id: string;
  principal_type: 'user' | 'group' | 'service_account' | string;
  principal_name?: string;
  roles: SourcePermissionRole[];
  granted_by?: string | null;
  reason?: string;
  expires_at?: string | null;
  granted_at?: string;
}

export interface SourceVisibilityPolicy {
  source_visibility_roles: SourcePermissionRole[];
  credential_visibility_roles: SourcePermissionRole[];
  external_sample_visibility_roles: SourcePermissionRole[];
  output_dataset_permission_roles: string[];
  credential_values_visible: boolean;
  external_samples_persisted: boolean;
  output_dataset_permissions_enforced: boolean;
  output_dataset_permission_system: string;
  source_visibility_distinct: boolean;
  credential_visibility_distinct: boolean;
  external_sample_visibility_distinct: boolean;
  output_dataset_permissions_distinct: boolean;
}

export interface SourceOutputDatasetPermission {
  dataset_id?: string | null;
  dataset_rid?: string;
  required_permissions: string[];
  actor_permissions: string[];
  verified: boolean;
  message?: string;
}

export interface SourceGovernanceWarning {
  code: string;
  severity: 'info' | 'warning' | 'error' | string;
  message: string;
}

export interface SourceGovernanceAuditEvent {
  id: string;
  source_id: string;
  actor_id?: string | null;
  event_type: 'permission_change' | 'source_use' | string;
  action: string;
  result: string;
  principal_id?: string;
  principal_type?: string;
  roles?: SourcePermissionRole[];
  capability?: string;
  job_rid?: string;
  downstream_resource_rid?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SourceGovernance {
  source_id: string;
  source_rid: string;
  owner_id: string;
  role_definitions: SourcePermissionRoleDefinition[];
  effective_roles: SourcePermissionRole[];
  permission_grants: SourcePermissionGrant[];
  visibility: SourceVisibilityPolicy;
  output_dataset_permissions: SourceOutputDatasetPermission[];
  audit_events: SourceGovernanceAuditEvent[];
  warnings?: SourceGovernanceWarning[];
}

export interface UpdateSourceGovernanceRequest {
  permission_grants?: SourcePermissionGrant[];
  visibility?: SourceVisibilityPolicy;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export type CredentialKind =
  | 'username_password'
  | 'password'
  | 'api_key'
  | 'bearer_token'
  | 'oauth_client_secret'
  | 'oauth_token'
  | 'cloud_identity'
  | 'certificate_key'
  | 'connector_specific'
  | 'aws_keys'
  | 'service_account_json';

export type CredentialStorageMode = 'encrypted_secret' | 'external_secret_reference' | 'cloud_identity_reference';
export type CredentialTestStatus = 'untested' | 'passed' | 'failed' | 'expired';
export type CredentialAuditEventType = 'created' | 'rotated' | 'tested' | 'attached' | 'detached' | 'revoked';

export interface CredentialUsageSummary {
  source_count: number;
  last_used_at: string | null;
  source_ids: string[];
}

export interface CredentialAuditEvent {
  id: string;
  event_type: CredentialAuditEventType | string;
  actor_id: string | null;
  created_at: string;
  message: string;
}

export interface Credential {
  id: string;
  source_id: string;
  kind: CredentialKind;
  storage_mode?: CredentialStorageMode;
  external_secret_ref?: string | null;
  cloud_identity_ref?: string | null;
  // The raw secret is never returned by the API; only a non-reversible
  // fingerprint useful for "you stored a secret on YYYY-MM-DD" UI.
  fingerprint: string;
  secret_version?: string | null;
  last_rotated_at?: string | null;
  created_by?: string | null;
  validation_status?: string | null;
  last_validated_at?: string | null;
  expires_at?: string | null;
  test_status?: CredentialTestStatus;
  last_tested_at?: string | null;
  usage?: CredentialUsageSummary | null;
  audit_events?: CredentialAuditEvent[] | null;
  created_at: string;
}

export interface SetCredentialRequest {
  kind: CredentialKind;
  storage_mode?: CredentialStorageMode;
  external_secret_ref?: string;
  cloud_identity_ref?: string;
  secret_version?: string;
  // Only sent on POST/PUT, never received.
  value?: string;
}

export interface RotateCredentialRequest extends SetCredentialRequest {
  rotation_reason?: string;
}

export interface TestCredentialResult {
  status: CredentialTestStatus;
  message: string;
  tested_at: string;
}

// ---------------------------------------------------------------------------
// Connector agents
// ---------------------------------------------------------------------------

export interface ConnectorAgent {
  id: string;
  name: string;
  agent_url: string;
  version: string;
  environment: string;
  host: string;
  owner_id: string;
  status: string;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
  connected_sources: AgentConnectedSource[];
  supported_connector_capabilities: AgentConnectorCapabilitySummary[];
  assigned_proxy_policies: AgentProxyPolicyAssignment[];
  connection_failures: AgentConnectionFailure[];
  health: AgentHealthSummary;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterConnectorAgentRequest {
  name: string;
  agent_url: string;
  version?: string;
  environment?: string;
  host?: string;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  connected_sources?: AgentConnectedSource[];
  supported_connector_capabilities?: AgentConnectorCapabilitySummary[];
  assigned_proxy_policies?: AgentProxyPolicyAssignment[];
  connection_failures?: AgentConnectionFailure[];
}

export interface ConnectorAgentHeartbeatRequest {
  version?: string;
  environment?: string;
  host?: string;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  connected_sources?: AgentConnectedSource[];
  supported_connector_capabilities?: AgentConnectorCapabilitySummary[];
  assigned_proxy_policies?: AgentProxyPolicyAssignment[];
  connection_failures?: AgentConnectionFailure[];
}

export interface AgentConnectedSource {
  source_id: string;
  source_name: string;
  connector_type: string;
  status: string;
  last_connected_at?: string | null;
}

export interface AgentConnectorCapabilitySummary {
  connector_type: string;
  capabilities: string[];
}

export interface AgentProxyPolicyAssignment {
  policy_id: string;
  policy_name?: string;
  source_id?: string;
  source_name?: string;
  proxy_mode?: string;
  status?: string;
  assigned_at?: string | null;
}

export interface AgentConnectionFailure {
  source_id?: string;
  source_name?: string;
  policy_id?: string;
  code: string;
  message: string;
  retryable: boolean;
  occurred_at?: string | null;
}

export interface AgentHealthSummary {
  state: 'healthy' | 'warning' | 'stale' | 'error' | string;
  message?: string;
  stale: boolean;
  last_heartbeat_age_seconds?: number | null;
  connected_source_count: number;
  assigned_proxy_policy_count: number;
  failure_count: number;
}

// ---------------------------------------------------------------------------
// Egress policies
// ---------------------------------------------------------------------------

export type EgressEndpointKind = 'host' | 'ip' | 'cidr';
export type EgressPortKind = 'single' | 'range' | 'any';

export interface EgressEndpoint {
  kind: EgressEndpointKind;
  value: string;
}

export interface EgressPort {
  kind: EgressPortKind;
  // For 'single' value is "443"; for 'range' value is "8000-9000"; ignored for 'any'.
  value: string;
}

export type EgressPolicyKind = 'direct' | 'agent_proxy' | 'same_region_bucket';
export type EgressProtocol = 'tcp' | 'tls' | 'http' | 'https';
export type EgressPolicyStatus = 'pending_approval' | 'active' | 'paused' | 'revoked';
export type AgentProxyMode = 'none' | 'http_connect' | 'socks5' | 'mtls_tunnel';
export type EgressSNIBehavior = 'verify' | 'disabled' | 'passthrough';
export type EgressBucketAccessLevel = 'read' | 'write' | 'read_write';

export interface EgressRiskWarning {
  code: string;
  severity: 'info' | 'warning' | 'error' | string;
  message: string;
}

export interface EgressPolicyAuditEvent {
  id: string;
  timestamp: string;
  actor_id: string;
  action: string;
  categories?: string[];
  outcome: string;
  reason?: string;
  high_risk?: boolean;
  potential_data_export?: boolean;
  workload_id?: string;
  workload_kind?: string;
  metadata?: Record<string, unknown>;
}

export type EgressApprovalStatus = 'pending' | 'approved' | 'denied';

export interface EgressApprovalTask {
  id: string;
  policy_id: string;
  action: string;
  status: EgressApprovalStatus | string;
  requested_by: string;
  requested_at: string;
  requested_state?: EgressPolicyStatus;
  required_roles: string[];
  summary: string;
  reason?: string;
  decided_by?: string;
  decided_at?: string | null;
  decision_reason?: string;
  high_risk: boolean;
  metadata?: Record<string, unknown>;
}

export interface EgressPolicyWorkloadUsage {
  workload_id: string;
  workload_kind: string;
  actor_id: string;
  organization_id?: string;
  last_decision: string;
  last_used_at: string;
  potential_data_export: boolean;
  export_risk_reason?: string;
  destination: EgressEndpoint;
  port?: number;
}

export interface NetworkEgressPolicy {
  id: string;
  name: string;
  description: string;
  kind: EgressPolicyKind;
  address: EgressEndpoint;
  port: EgressPort;
  protocol?: EgressProtocol;
  proxy_mode?: AgentProxyMode;
  sni_behavior?: EgressSNIBehavior;
  agents?: string[];
  bucket_name?: string;
  bucket_access_level?: EgressBucketAccessLevel;
  state?: EgressPolicyStatus;
  status?: EgressPolicyStatus;
  allowed_organizations?: string[];
  is_global: boolean;
  viewer_grants?: string[];
  importer_grants?: string[];
  admin_grants?: string[];
  importer_grants_high_risk?: boolean;
  risk_warnings?: EgressRiskWarning[];
  egress_ip_ranges?: string[];
  agent_hosts?: string[];
  overlap_policy_ids?: string[];
  bucket_policy_requirements?: string[];
  approval_tasks?: EgressApprovalTask[];
  workload_usages?: EgressPolicyWorkloadUsage[];
  audit_events?: EgressPolicyAuditEvent[];
  // Legacy alias for importer grants, kept for source/detail compatibility.
  permissions: string[];
  created_at: string;
  updated_at?: string;
}

export interface CreateEgressPolicyRequest {
  name: string;
  description: string;
  kind: EgressPolicyKind;
  address: EgressEndpoint;
  port: EgressPort;
  protocol?: EgressProtocol;
  proxy_mode?: AgentProxyMode;
  sni_behavior?: EgressSNIBehavior;
  agents?: string[];
  bucket_name?: string;
  bucket_access_level?: EgressBucketAccessLevel;
  state?: EgressPolicyStatus;
  status?: EgressPolicyStatus;
  allowed_organizations?: string[];
  is_global: boolean;
  viewer_grants?: string[];
  importer_grants?: string[];
  admin_grants?: string[];
  permissions: string[];
  reason?: string;
}

export interface UpdateEgressPolicyStateRequest {
  state: EgressPolicyStatus;
  reason?: string;
}

export interface UpdateEgressPolicySharingRequest {
  viewer_grants?: string[];
  importer_grants?: string[];
  admin_grants?: string[];
  permissions?: string[];
  reason?: string;
}

export interface DecideEgressApprovalRequest {
  decision: 'approved' | 'denied';
  reason?: string;
}

export interface DecideEgressApprovalResponse {
  policy: NetworkEgressPolicy;
  approval_task: EgressApprovalTask;
}

export interface SourcePolicyBinding {
  source_id: string;
  policy_id: string;
  kind: EgressPolicyKind;
}


export interface EgressPolicyValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const CIDR_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\/(?:[0-9]|[1-2]\d|3[0-2])$/;

function validateEndpoint(endpoint: EgressEndpoint): EgressPolicyValidationIssue[] {
  const value = endpoint.value.trim();
  if (!value) return [{ field: 'address', message: 'Destination address is required.', severity: 'error' }];
  if (endpoint.kind === 'host' && !HOST_PATTERN.test(value)) {
    return [{ field: 'address', message: 'Host policies require a DNS name such as api.example.com or *.example.com.', severity: 'error' }];
  }
  if (endpoint.kind === 'ip' && !IPV4_PATTERN.test(value)) {
    return [{ field: 'address', message: 'IP policies require an IPv4 address such as 10.20.30.40.', severity: 'error' }];
  }
  if (endpoint.kind === 'cidr' && !CIDR_PATTERN.test(value)) {
    return [{ field: 'address', message: 'CIDR policies require an IPv4 CIDR block such as 10.20.0.0/16.', severity: 'error' }];
  }
  return [];
}

function validatePort(port: EgressPort): EgressPolicyValidationIssue[] {
  if (port.kind === 'any') return [];
  if (port.kind === 'single') {
    const parsed = Number(port.value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return [{ field: 'port', message: 'Port must be a number between 1 and 65535.', severity: 'error' }];
    }
    return [];
  }
  const match = port.value.trim().match(/^(\d{1,5})\s*-\s*(\d{1,5})$/);
  if (!match) return [{ field: 'port', message: 'Port range must look like 8000-9000.', severity: 'error' }];
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) {
    return [{ field: 'port', message: 'Port range must be between 1 and 65535, with the lower port first.', severity: 'error' }];
  }
  return [];
}

export function validateEgressPolicy(policy: Pick<NetworkEgressPolicy, 'kind' | 'address' | 'port'> & Partial<Pick<NetworkEgressPolicy, 'protocol' | 'proxy_mode' | 'sni_behavior' | 'agents' | 'bucket_name' | 'bucket_access_level' | 'state' | 'status' | 'allowed_organizations'>>): EgressPolicyValidationIssue[] {
  const issues = [...validateEndpoint(policy.address), ...validatePort(policy.port)];
  if (policy.kind === 'direct' && policy.proxy_mode && policy.proxy_mode !== 'none') {
    issues.push({ field: 'proxy_mode', message: 'Direct egress policies cannot use an agent proxy mode.', severity: 'error' });
  }
  if (policy.kind === 'agent_proxy' && (!policy.proxy_mode || policy.proxy_mode === 'none')) {
    issues.push({ field: 'proxy_mode', message: 'Agent proxy policies require an HTTP CONNECT, SOCKS5, or mTLS tunnel mode.', severity: 'error' });
  }
  if (policy.kind === 'agent_proxy' && (policy.agents ?? []).length === 0) {
    issues.push({ field: 'agents', message: 'Agent proxy policies require at least one connector agent.', severity: 'error' });
  }
  if (policy.kind === 'same_region_bucket') {
    if (policy.address.kind !== 'host' || policy.address.value.trim().startsWith('*.')) {
      issues.push({ field: 'address', message: 'Same-region bucket policies require a concrete DNS host endpoint.', severity: 'error' });
    }
    if (policy.port.kind !== 'single' || policy.port.value.trim() !== '443') {
      issues.push({ field: 'port', message: 'Same-region bucket policies must use port 443.', severity: 'error' });
    }
    if (!policy.bucket_name?.trim()) {
      issues.push({ field: 'bucket_name', message: 'Bucket name is required for same-region bucket policies.', severity: 'error' });
    }
    if (!policy.bucket_access_level || !['read', 'write', 'read_write'].includes(policy.bucket_access_level)) {
      issues.push({ field: 'bucket_access_level', message: 'Bucket access level must be read, write, or read/write.', severity: 'error' });
    }
  }
  if (policy.address.kind === 'host' && policy.port.kind === 'range') {
    issues.push({ field: 'port', message: 'DNS host egress policies must use a single port.', severity: 'error' });
  }
  if (policy.protocol && !['tcp', 'tls', 'http', 'https'].includes(policy.protocol)) {
    issues.push({ field: 'protocol', message: 'Protocol must be tcp, tls, http, or https.', severity: 'error' });
  }
  if (policy.sni_behavior && !['verify', 'disabled', 'passthrough'].includes(policy.sni_behavior)) {
    issues.push({ field: 'sni_behavior', message: 'SNI behavior must be verify, disabled, or passthrough.', severity: 'error' });
  }
  const status = policy.state ?? policy.status;
  if (status && !['pending_approval', 'active', 'paused', 'revoked'].includes(status)) {
    issues.push({ field: 'status', message: 'Policy status is not recognized.', severity: 'error' });
  }
  for (const organization of policy.allowed_organizations ?? []) {
    if (!organization.trim()) {
      issues.push({ field: 'allowed_organizations', message: 'Allowed organization identifiers cannot be blank.', severity: 'error' });
      break;
    }
  }
  return issues;
}

export interface ConnectionTestPolicyValidationOptions {
  expectedKind: EgressPolicyKind;
  organizationId?: string | null;
}

export function validateEgressPoliciesForConnectionTest(
  policies: NetworkEgressPolicy[],
  { expectedKind, organizationId }: ConnectionTestPolicyValidationOptions,
): EgressPolicyValidationIssue[] {
  if (policies.length === 0) {
    return [{ field: 'policy', message: 'Attach an active egress policy before testing this source.', severity: 'error' }];
  }

  const issues: EgressPolicyValidationIssue[] = [];
  const matching = policies.filter((policy) => policy.kind === expectedKind);
  if (matching.length === 0) {
    const expectedLabel = expectedKind === 'direct' ? 'active direct egress' : expectedKind === 'agent_proxy' ? 'active agent proxy' : 'active same-region bucket egress';
    issues.push({
      field: 'kind',
      message: `Attach an ${expectedLabel} policy before testing this source.`,
      severity: 'error',
    });
  }

  for (const policy of matching) {
    const policyIssues = validateEgressPolicy(policy);
    const status = policy.state ?? policy.status ?? 'active';
    if (status !== 'active') {
      policyIssues.push({ field: 'status', message: `Policy "${policy.name}" must be active before connection tests can run. Current status: ${status}.`, severity: 'error' });
    }
    if (organizationId && (policy.allowed_organizations ?? []).length > 0 && !policy.allowed_organizations?.includes(organizationId)) {
      policyIssues.push({ field: 'allowed_organizations', message: `Policy "${policy.name}" does not allow organization ${organizationId}.`, severity: 'error' });
    }
    issues.push(...policyIssues.map((issue) => ({ ...issue, field: `${policy.name}.${issue.field}` })));
  }

  if (matching.length > 0 && matching.every((policy) => (policy.state ?? policy.status ?? 'active') !== 'active')) {
    issues.push({ field: 'status', message: 'At least one matching egress policy must be active before testing.', severity: 'error' });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Batch sync defs and runs
// ---------------------------------------------------------------------------

export type SyncRunStatus = 'queued' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'aborted' | 'retrying' | 'ignored' | 'partially_succeeded';

export type SyncCapabilityType = 'batch_sync' | 'streaming_sync' | 'cdc_sync' | 'media_sync';
export type SyncOutputKind = 'dataset' | 'stream' | 'media_set';
export type SyncWriteMode = 'snapshot' | 'append' | 'upsert' | 'incremental';
export type SyncTransactionMode = 'transactional' | 'external_checkpoint' | 'non_transactional';
export type DatasetTransactionType = 'SNAPSHOT' | 'APPEND' | 'UPDATE';
export type SyncResourceHealthState = 'not_run' | 'healthy' | 'warning' | 'error';
export type FileSyncMode = 'snapshot_mirror' | 'incremental_append' | 'historical_snapshot_incremental';
export type TableBatchSyncMode = 'full_snapshot' | 'incremental';
export type CdcSyncInputKind = 'relational_connector' | 'streaming_middleware_changelog';
export type CdcStartPosition = 'initial_snapshot' | 'latest' | 'timestamp' | 'lsn' | 'offset';

export interface SyncResourceHealth {
  state: SyncResourceHealthState;
  message: string | null;
  last_checked_at: string | null;
}

export interface SyncRunLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
}

export interface SyncRunBuildLink {
  build_id: string | null;
  job_id: string | null;
  job_spec_id?: string | null;
  build_url?: string | null;
}

export interface SyncRunSourceProgress {
  offsets?: Record<string, unknown> | null;
  file_checkpoints?: string[] | null;
}

export interface SyncRunOutputTransaction {
  transaction_id: string | null;
  transaction_type: DatasetTransactionType | null;
  dataset_id?: string | null;
  stream_id?: string | null;
}

export interface SyncResourceRunSummary {
  status: SyncRunStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
  worker?: SourceWorker | null;
  agent_id?: string | null;
  build?: SyncRunBuildLink | null;
  source_progress?: SyncRunSourceProgress | null;
  output_transaction?: SyncRunOutputTransaction | null;
  rows_written?: number | null;
  files_written?: number | null;
  bytes_written: number;
  records_written?: number | null;
  retry_count?: number;
  logs?: SyncRunLogEntry[];
  error: string | null;
}

export interface SyncResourceSchemaField {
  name: string;
  source_type: string;
  foundry_type: string;
  nullable: boolean;
}

export interface SyncValidationWarning {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface FileSyncSettings {
  mode: FileSyncMode;
  transaction_type: DatasetTransactionType;
  exclude_already_synced: boolean;
  file_count_limit: number | null;
  include_globs: string[];
  exclude_globs: string[];
  include_path_metadata: boolean;
  path_metadata_columns: string[];
  historical_snapshot_cutoff?: string | null;
  incremental_recent_window?: string | null;
  low_level?: Record<string, unknown> | null;
  warnings?: SyncValidationWarning[];
}

export interface TableBatchSyncSelection {
  source_table: string;
  destination_dataset_id: string;
  source_schema?: SyncResourceSchemaField[] | null;
  destination_schema?: SyncResourceSchemaField[] | null;
  estimated_row_count?: number | null;
  incremental_column?: string | null;
  last_transaction_id?: string | null;
}

export interface TableBatchSyncSettings {
  mode: TableBatchSyncMode;
  selected_tables: TableBatchSyncSelection[];
  infer_schema: boolean;
  incremental_column?: string | null;
  row_count?: number | null;
  transaction_ids?: string[];
  warnings?: SyncValidationWarning[];
}

export interface CdcConnectorDerivedMetadata {
  connector_type: string;
  source_database?: string | null;
  source_schema?: string | null;
  source_table?: string | null;
  upstream_topic?: string | null;
  output_stream_id?: string | null;
  debezium_connector?: string | null;
  snapshot_mode?: string | null;
  publication_name?: string | null;
  replication_slot?: string | null;
  start_position_metadata?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  derived_at?: string | null;
}

export interface CdcSyncSettings {
  input_kind: CdcSyncInputKind;
  source_database?: string | null;
  source_schema?: string | null;
  source_table: string;
  source_topic?: string | null;
  primary_key_columns: string[];
  ordering_column: string;
  deletion_column?: string | null;
  output_stream_id?: string | null;
  output_stream_location: string;
  schema: SyncResourceSchemaField[];
  start_position: CdcStartPosition;
  start_position_value?: string | number | null;
  source_database_cdc_enabled: boolean;
  source_table_cdc_enabled: boolean;
  changelog_input_validated: boolean;
  connector_metadata: CdcConnectorDerivedMetadata;
  warnings?: SyncValidationWarning[];
}

export type DataExportType = 'file' | 'table' | 'streaming';
export type DataExportMode =
  | 'snapshot'
  | 'incremental'
  | 'mirror'
  | 'full_snapshot'
  | 'full_snapshot_truncate'
  | 'incremental_truncate'
  | 'incremental_append_only'
  | 'continuous';
export type DataExportStatus = 'draft' | 'scheduled' | 'running' | 'succeeded' | 'failed' | 'stopped';
export type DataExportHealthState = SyncResourceHealthState | 'running';

export interface DataExportControls {
  allowed_markings: string[];
  allowed_organizations: string[];
}

export interface DataExportHealth {
  state: DataExportHealthState;
  message?: string | null;
  last_checked_at?: string | null;
}

export interface DataExportHistoryEntry {
  id: string;
  action: string;
  status: string;
  message?: string | null;
  build_id?: string | null;
  build_report_url?: string | null;
  files_written?: number;
  files_skipped?: number;
  bytes_written?: number;
  rows_written?: number;
  truncate_performed?: boolean;
  records_exported?: number;
  records_skipped?: number;
  last_exported_offset?: string | null;
  replay_behavior?: string;
  schedule_triggered?: boolean;
  retry_attempts?: number;
  error_message?: string | null;
  high_watermark_transaction_id?: string | null;
  full_reexport?: boolean;
  metadata?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface DataExportSchedule {
  rid: string;
  name: string;
  build_system: string;
  trigger_kind: string;
  cron: string;
  time_zone: string;
  target_kind: string;
  target_rid: string;
  target_display_name: string;
  schedule_url?: string | null;
  active: boolean;
  last_triggered_at?: string | null;
}

export type FileExportIncrementalPolicy = 'modified_since_last_success' | 'full_snapshot';
export type FileExportOverwriteBehavior = 'overwrite_existing' | 'fail_if_exists' | 'skip_existing' | 'connector_default';
export type FileExportFullReexportStrategy = 'create_new_export_or_overwrite_upstream' | 'include_all_files_once';

export interface FileExportSourceFile {
  path: string;
  size_bytes: number;
  modified_at?: string | null;
  transaction_id?: string | null;
  content_hash?: string | null;
}

export interface FileExportSettings {
  incremental_policy: FileExportIncrementalPolicy;
  overwrite_behavior: FileExportOverwriteBehavior;
  destination_subfolder?: string | null;
  preserve_directory_structure: boolean;
  full_reexport_requested: boolean;
  full_reexport_strategy: FileExportFullReexportStrategy;
  source_files?: FileExportSourceFile[];
  last_successful_transaction_id?: string | null;
  last_successful_at?: string | null;
  destination_subfolder_guidance?: string[];
}

export interface FileExportRunPlan {
  incremental_policy: FileExportIncrementalPolicy;
  overwrite_behavior: FileExportOverwriteBehavior;
  destination_path: string;
  destination_subfolder?: string | null;
  files_considered: number;
  files_written: number;
  files_skipped: number;
  bytes_written: number;
  full_reexport: boolean;
  last_successful_at?: string | null;
  last_exported_transaction_id?: string | null;
  exported_files: FileExportSourceFile[];
  skipped_files: FileExportSourceFile[];
  destination_subfolder_advice: string[];
}

export interface TableExportColumn {
  name: string;
  foundry_type: string;
  external_type: string;
  nullable: boolean;
}

export interface TableExportValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  column?: string | null;
}

export interface TableExportSettings {
  dataset_schema: TableExportColumn[];
  destination_schema: TableExportColumn[];
  input_parquet_backed: boolean;
  destination_table_exists: boolean;
  truncate_permission: boolean;
  exact_column_match: boolean;
  row_count_estimate?: number | null;
  last_successful_transaction_id?: string | null;
  last_successful_at?: string | null;
  validation_issues?: TableExportValidationIssue[];
}

export interface TableExportRunPlan {
  export_mode: DataExportMode;
  resolution_strategy: string;
  rows_written: number;
  truncate_required: boolean;
  truncate_performed: boolean;
  input_parquet_backed: boolean;
  destination_table_exists: boolean;
  exact_column_match: boolean;
  last_successful_at?: string | null;
  validation_issues: TableExportValidationIssue[];
}

export type StreamingExportReplayBehavior = 'export_replayed_records' | 'skip_replayed_records';
export type StreamingExportStartOffset = 'previous_export_offset' | 'latest' | 'earliest' | 'explicit';

export interface StreamingExportWarning {
  code: string;
  severity: 'warning' | 'error';
  message: string;
}

export interface StreamingExportSettings {
  replay_behavior: StreamingExportReplayBehavior;
  start_offset: StreamingExportStartOffset;
  start_offset_value?: string | null;
  last_exported_offset?: string | null;
  last_checkpoint_id?: string | null;
  schedule_restart_enabled: boolean;
  restart_from_previous_offset: boolean;
  records_exported_estimate?: number | null;
  replayed_records_detected: boolean;
  last_started_at?: string | null;
  last_stopped_at?: string | null;
  warnings?: StreamingExportWarning[];
}

export interface StreamingExportStartPlan {
  replay_behavior: StreamingExportReplayBehavior;
  start_offset: StreamingExportStartOffset;
  effective_start_offset?: string | null;
  restart_from_previous_offset: boolean;
  schedule_restart_enabled: boolean;
  schedule_triggered: boolean;
  records_to_export: number;
  duplicate_risk: boolean;
  drop_risk: boolean;
  warnings: StreamingExportWarning[];
}

export interface DataExport {
  id: string;
  source_id: string;
  name: string;
  export_type: DataExportType;
  export_mode: DataExportMode;
  input_dataset_id?: string | null;
  input_dataset_rid?: string | null;
  input_stream_id?: string | null;
  destination_path?: string | null;
  destination_table?: string | null;
  destination_topic?: string | null;
  schedule_cron?: string | null;
  start_behavior: 'manual' | 'scheduled' | 'start_immediately' | string;
  stop_behavior: 'after_run' | 'manual' | 'continuous' | string;
  export_controls: DataExportControls;
  config: Record<string, unknown>;
  file_export?: FileExportSettings | null;
  table_export?: TableExportSettings | null;
  streaming_export?: StreamingExportSettings | null;
  schedule?: DataExportSchedule | null;
  status: DataExportStatus;
  health: DataExportHealth;
  history: DataExportHistoryEntry[];
  last_run_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceExportControls {
  allow_foundry_inputs: boolean;
  allowed_markings: string[];
  allowed_organizations: string[];
}

export interface SourceCodeRepositoryImport {
  repository_rid: string;
  repository_name: string;
  file_path?: string | null;
  url?: string | null;
  imported_name: string;
  last_imported_at?: string | null;
  rendered_link?: string;
  rendered_display?: string;
}

export interface SourceGeneratedBinding {
  library: string;
  import_line: string;
  decorator: string;
  source_rid: string;
  parameter_name: string;
  friendly_name: string;
  code_snippet: string;
  source_panel_url: string;
}

export interface ExternalTransformPattern {
  id: string;
  title: string;
  summary: string;
  alternative_for: string[];
  example_kind: string;
  runtime: string;
  requires_source_import: boolean;
  requires_foundry_input: boolean;
  requires_export_controls: boolean;
  requires_agent_proxy: boolean;
  source_requirements: string[];
  recommended_when: string[];
  limitations: string[];
  code_snippet: string;
  docs_url: string;
}

export interface ComputeModuleAlternative {
  id: string;
  title: string;
  summary: string;
  alternative_for: string;
  runtime_kind: string;
  status: 'blocked' | 'available' | string;
  supported_languages: string[];
  required_contracts: string[];
  blockers: string[];
  readiness_checks: string[];
  source_rid: string;
  source_import_contract: string;
  deployment_contract: string;
  execution_contract: string;
  code_sketch: string;
  docs_url: string;
}

export interface SourceCodeImportWarning {
  code: string;
  severity: 'info' | 'warning' | 'error' | string;
  message: string;
}

export interface SourceCodeImportFoundryInput {
  rid: string;
  display_name?: string;
  resource_type?: string;
  markings: string[];
  organizations: string[];
}

export interface SourceCodeImportExportPolicyDecision {
  status: 'allowed' | 'blocked' | 'not_applicable' | string;
  build_allowed: boolean;
  uses_foundry_inputs: boolean;
  allow_foundry_inputs: boolean;
  foundry_inputs: SourceCodeImportFoundryInput[];
  matched_markings?: string[];
  missing_markings?: string[];
  matched_organizations?: string[];
  missing_organizations?: string[];
  blocking_reasons?: SourceCodeImportWarning[];
  owner_approval_required: boolean;
}

export interface SourceCredentialBinding {
  credential_id: string;
  kind: string;
  fingerprint: string;
  created_at: string;
}

export interface SourceEgressPolicyBinding {
  policy_id: string;
  kind: string;
}

export interface SourceCodeImportBuildResolution {
  source_id: string;
  source_rid: string;
  source_name: string;
  connector_type: string;
  python_identifier: string;
  friendly_name: string;
  build_rid?: string | null;
  repository_rid?: string | null;
  branch?: string | null;
  resolved_at: string;
  source_updated_at: string;
  config_hash: string;
  credential_bindings: SourceCredentialBinding[];
  egress_policy_bindings: SourceEgressPolicyBinding[];
  export_controls: SourceExportControls;
  export_policy_decision: SourceCodeImportExportPolicyDecision;
  uses_live_configuration: boolean;
  no_code_change_required: boolean;
  generated_binding: SourceGeneratedBinding;
  warnings?: SourceCodeImportWarning[];
}

export interface SourceCodeImport {
  source_id: string;
  source_rid: string;
  source_name: string;
  connector_type: string;
  enabled: boolean;
  friendly_name: string;
  python_identifier: string;
  generated_binding: SourceGeneratedBinding;
  code_repositories: SourceCodeRepositoryImport[];
  export_controls: SourceExportControls;
  external_transform_patterns: ExternalTransformPattern[];
  compute_module_alternatives: ComputeModuleAlternative[];
  build_start_resolution: SourceCodeImportBuildResolution;
  warnings?: SourceCodeImportWarning[];
  created_at: string;
  updated_at: string;
}

export interface UpdateSourceCodeImportRequest {
  enabled?: boolean;
  friendly_name?: string;
  python_identifier?: string;
  code_repositories?: SourceCodeRepositoryImport[];
  export_controls?: SourceExportControls;
}

export interface ResolveSourceCodeImportBuildRequest {
  repository_rid?: string;
  build_rid?: string;
  branch?: string;
  uses_foundry_inputs?: boolean;
  foundry_inputs?: SourceCodeImportFoundryInput[];
}

export interface CreateDataExportRequest {
  source_id?: string;
  name?: string;
  export_type: DataExportType;
  export_mode?: DataExportMode;
  input_dataset_id?: string;
  input_dataset_rid?: string;
  input_stream_id?: string;
  destination_path?: string;
  destination_table?: string;
  destination_topic?: string;
  schedule_cron?: string;
  start_behavior?: 'manual' | 'scheduled' | 'start_immediately';
  stop_behavior?: 'after_run' | 'manual' | 'continuous';
  export_controls?: DataExportControls;
  config?: Record<string, unknown>;
  file_export?: FileExportSettings;
  table_export?: TableExportSettings;
  streaming_export?: StreamingExportSettings;
}

export interface UpdateDataExportRequest {
  name?: string;
  export_mode?: DataExportMode;
  input_dataset_id?: string;
  input_dataset_rid?: string;
  input_stream_id?: string;
  destination_path?: string;
  destination_table?: string;
  destination_topic?: string;
  schedule_cron?: string;
  start_behavior?: 'manual' | 'scheduled' | 'start_immediately';
  stop_behavior?: 'after_run' | 'manual' | 'continuous';
  export_controls?: DataExportControls;
  config?: Record<string, unknown>;
  file_export?: FileExportSettings;
  table_export?: TableExportSettings;
  streaming_export?: StreamingExportSettings;
}

export interface BatchSyncDef {
  id: string;
  source_id: string;
  capability_type?: SyncCapabilityType;
  output_kind?: SyncOutputKind;
  output_dataset_id?: string | null;
  output_stream_id?: string | null;
  output_media_set_id?: string | null;
  source_selector?: string | null;
  source_path?: string | null;
  source_table?: string | null;
  source_topic?: string | null;
  schema?: SyncResourceSchemaField[] | null;
  write_mode?: SyncWriteMode;
  transaction_mode?: SyncTransactionMode;
  build_integration?: string | null;
  last_run?: SyncResourceRunSummary | null;
  next_run_at?: string | null;
  health?: SyncResourceHealth | null;
  history?: SyncResourceRunSummary[] | null;
  dataset_transaction_type?: DatasetTransactionType;
  file_sync?: FileSyncSettings | null;
  table_sync?: TableBatchSyncSettings | null;
  cdc_sync?: CdcSyncSettings | null;
  file_glob: string | null;
  schedule_cron: string | null;
  created_at: string;
}

export interface CreateBatchSyncRequest {
  source_id: string;
  capability_type?: SyncCapabilityType;
  output_kind?: SyncOutputKind;
  output_dataset_id?: string;
  output_stream_id?: string;
  output_media_set_id?: string;
  source_selector?: string;
  source_path?: string;
  source_table?: string;
  source_topic?: string;
  schema?: SyncResourceSchemaField[];
  write_mode?: SyncWriteMode;
  transaction_mode?: SyncTransactionMode;
  build_integration?: string;
  create_output_dataset?: boolean;
  output_folder_rid?: string;
  dataset_transaction_type?: DatasetTransactionType;
  file_sync?: FileSyncSettings;
  table_sync?: TableBatchSyncSettings;
  cdc_sync?: CdcSyncSettings;
  file_glob?: string;
  schedule_cron?: string;
}

export interface SyncRun {
  id: string;
  sync_def_id: string;
  status: SyncRunStatus;
  queued_at?: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
  worker?: SourceWorker | null;
  agent_id?: string | null;
  build?: SyncRunBuildLink | null;
  source_progress?: SyncRunSourceProgress | null;
  output_transaction?: SyncRunOutputTransaction | null;
  rows_written?: number | null;
  records_written?: number | null;
  bytes_written: number;
  files_written: number;
  retry_count?: number;
  logs?: SyncRunLogEntry[];
  error: string | null;
}


export type StreamingSyncStatus = 'draft' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
export type StreamingStartOffset = 'earliest' | 'latest' | 'timestamp' | 'offset';

export interface StreamingSyncSetup {
  id: string;
  source_id: string;
  output_stream_id: string;
  source_topic: string;
  consumer_group: string | null;
  schema: SyncResourceSchemaField[];
  key_fields: string[];
  start_offset: StreamingStartOffset;
  start_offset_value?: string | number | null;
  consistency_guarantee: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  checkpoint_interval_ms: number;
  output_stream_location: string;
  status: StreamingSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateStreamingSyncRequest {
  source_id: string;
  output_stream_id?: string;
  source_topic: string;
  consumer_group?: string | null;
  schema?: SyncResourceSchemaField[];
  key_fields?: string[];
  start_offset: StreamingStartOffset;
  start_offset_value?: string | number | null;
  consistency_guarantee: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  checkpoint_interval_ms: number;
  output_stream_location: string;
}

export type StreamStorageSource = 'hot' | 'cold' | 'hybrid';
export type StreamReplayStatus = 'available' | 'running' | 'disabled';
export type StreamCheckpointStatus = 'pending' | 'completed' | 'failed' | 'expired';
export type StreamingRuntimeKind = 'foundry_streaming' | 'flink' | 'spark_structured_streaming' | 'agent_runtime';

export interface StreamPermissionSummary {
  readers: string[];
  writers: string[];
  admins: string[];
  markings?: string[];
}

export interface StreamStorageSummary {
  hot_buffer_retention_ms: number;
  hot_buffer_bytes: number | null;
  cold_dataset_id: string | null;
  archive_dataset_id?: string | null;
  archive_interval_ms: number | null;
}

export interface StreamOffsetSummary {
  earliest_offset: number | null;
  latest_offset: number | null;
  committed_offset: number | null;
  lag: number | null;
}

export interface StreamOperatorStateMetadata {
  operator_id: string;
  operator_name: string;
  state_uri: string | null;
  size_bytes: number | null;
}

export interface StreamCheckpointSummary {
  id: string;
  status: StreamCheckpointStatus | string;
  offset: number | null;
  last_processed_source_location?: string | null;
  operator_state?: StreamOperatorStateMetadata[];
  size_bytes?: number | null;
  created_at: string;
  completed_at?: string | null;
  duration_ms: number | null;
}

export interface StreamRestartPlan {
  can_restart: boolean;
  latest_completed_checkpoint_id: string | null;
  restart_from_source_location?: string | null;
  reason: string | null;
}

export interface StreamConsistencySupport {
  requested: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  effective: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  runtime: StreamingRuntimeKind;
  source_supports_exactly_once: boolean;
  sink_supports_exactly_once: boolean;
  downgraded: boolean;
  duplicate_tolerant_consumers_required: boolean;
  reason: string | null;
}

export interface StreamReplayMetadata {
  status: StreamReplayStatus;
  from_offset: number | null;
  to_offset: number | null;
  requested_by: string | null;
  requested_at: string | null;
}

export interface StreamConsumerSummary {
  id: string;
  name: string;
  consumer_group: string | null;
  last_read_offset: number | null;
  lag: number | null;
  status: string;
}

export interface StreamLiveRow {
  offset: number;
  event_time: string;
  payload: Record<string, unknown>;
  source: StreamStorageSource;
}

export interface CdcResolvedArchiveView {
  live_rows: StreamLiveRow[];
  archive_rows: StreamLiveRow[];
  deleted_rows: StreamLiveRow[];
  primary_key_columns: string[];
  ordering_column: string | null;
  deletion_column: string | null;
  resolution_strategy: string;
  used_backend_archive: boolean;
  warnings: SyncValidationWarning[];
}

export type CdcDownstreamSurface =
  | 'pipeline_builder'
  | 'ontology_indexing'
  | 'stream_processing'
  | 'archive_view'
  | 'data_health';

export type CdcDownstreamIntegrationStatus = 'ready' | 'warning' | 'blocked';

export interface CdcDataHealthCheckDefinition {
  code: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
  columns: string[];
}

export interface CdcDownstreamIntegrationTarget {
  surface: CdcDownstreamSurface;
  label: string;
  status: CdcDownstreamIntegrationStatus;
  required_columns: string[];
  metadata: Record<string, unknown>;
  warnings: SyncValidationWarning[];
  recommended_checks?: CdcDataHealthCheckDefinition[];
}

export interface CdcDownstreamIntegrationMetadata {
  stream_id: string;
  stream_name: string;
  source: string;
  output_stream_id: string | null;
  primary_key_columns: string[];
  ordering_column: string;
  deletion_column: string | null;
  required_metadata_columns: string[];
  propagated_metadata_columns: string[];
  resolution_strategy: string;
  targets: CdcDownstreamIntegrationTarget[];
  warnings: SyncValidationWarning[];
}


export interface StreamArchivePolicy {
  enabled: boolean;
  archive_dataset_id: string | null;
  cadence_ms: number | null;
  retention_ms: number | null;
  last_archived_at: string | null;
}

export interface StreamHybridReadMetadata {
  hot_rows: number;
  cold_rows: number;
  from_offset: number | null;
  to_offset: number | null;
  consistency_guarantee: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
}

export interface StreamHybridReadResponse {
  stream_id: string;
  source: 'hot' | 'cold' | 'hybrid';
  rows: StreamLiveRow[];
  metadata: StreamHybridReadMetadata;
}


export type PushStreamAuthMode = 'third_party_application' | 'personal_token';

export interface PushStreamEndpointDescriptor {
  stream_id: string;
  dataset_rid: string;
  branch: string;
  url: string;
  auth_mode: PushStreamAuthMode;
  token_reference_id: string | null;
}

export interface PushStreamRecordsRequest {
  dataset_rid: string;
  branch: string;
  records: Record<string, unknown>[];
  token_reference_id: string;
  idempotency_key?: string | null;
}

export interface PushStreamRecordsResponse {
  stream_id: string;
  dataset_rid: string;
  branch: string;
  accepted_record_count: number;
  rejected_record_count: number;
  next_offset: number | null;
  idempotency_key?: string | null;
  rate_limit_remaining?: number | null;
  warnings?: SyncValidationWarning[];
}

export interface PushStreamValidationOptions {
  datasetRid: string;
  branch: string;
  tokenReferenceId: string;
  records: Record<string, unknown>[];
  schema?: SyncResourceSchemaField[] | null;
  maxRecordsPerRequest?: number;
  rateLimitRemaining?: number | null;
  idempotencyKey?: string | null;
}

export type StreamIngestionRecommendationKind = 'streaming_sync' | 'listener' | 'push_api';

export interface StreamIngestionRecommendation {
  kind: StreamIngestionRecommendationKind;
  message: string;
}

export interface StreamIngestionRecommendationOptions {
  sourceConnectorExists: boolean;
  inboundSystemCanAuthenticate: boolean;
  inboundSystemConformsToSchema: boolean;
}

export interface DataConnectionStreamResource {
  id: string;
  rid?: string | null;
  name: string;
  description?: string | null;
  schema: SyncResourceSchemaField[];
  permissions: StreamPermissionSummary;
  branch: string;
  hot_buffer: StreamStorageSummary;
  cold_storage: StreamStorageSummary;
  archive_policy?: StreamArchivePolicy | null;
  hybrid_read?: StreamHybridReadMetadata | null;
  consistency_guarantee: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  offsets: StreamOffsetSummary;
  checkpoints: StreamCheckpointSummary[];
  restart_plan?: StreamRestartPlan | null;
  consistency?: StreamConsistencySupport | null;
  cdc_metadata?: CdcSyncSettings | null;
  replay: StreamReplayMetadata | null;
  source_sync_ids: string[];
  consumers: StreamConsumerSummary[];
  health: SyncResourceHealth;
  live_view?: StreamLiveRow[];
  archive_view?: StreamLiveRow[];
  created_at: string;
  updated_at: string;
}

export type ConnectionTestCheckStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface ConnectionTestCheck {
  name: string;
  status: ConnectionTestCheckStatus;
  message: string;
  latency_ms: number | null;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
  checks?: ConnectionTestCheck[];
  tested_at?: string;
}

// ---------------------------------------------------------------------------
// Streaming source contracts
// ---------------------------------------------------------------------------

export type StreamingSourceFieldKind = 'string' | 'int' | 'secret';

export interface StreamingSourceFieldDescriptor {
  name: string;
  kind: StreamingSourceFieldKind;
  required: boolean;
  description: string;
}

export interface StreamingSourceContract {
  kind: string;
  display_name: string;
  description: string;
  requires_agent: boolean;
  config_fields: StreamingSourceFieldDescriptor[];
}

export interface StreamingSourceContractResponse {
  data: StreamingSourceContract[];
}


// ---------------------------------------------------------------------------
// REST API sources and webhooks
// ---------------------------------------------------------------------------

export type RestApiAuthKind = 'none' | 'bearer_token' | 'api_key' | 'basic' | 'oauth_client';
export type WebhookHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type WebhookParameterKind = 'boolean' | 'integer' | 'long' | 'double' | 'string' | 'date' | 'timestamp' | 'list' | 'record' | 'optional' | 'attachment';
export type WebhookOutputExtractorKind = 'whole_response' | 'key_path' | 'array_index' | 'json_path' | 'http_status' | 'full_response_string';
export type WebhookInvocationStatus = 'succeeded' | 'failed' | 'retrying' | 'cancelled';
export type WebhookInputMappingSource = 'action_parameter' | 'function_output' | 'literal';

export interface RestApiAuthConfig {
  kind: RestApiAuthKind;
  credential_reference_id?: string | null;
  header_name?: string | null;
  query_param_name?: string | null;
}

export interface RestApiSourceSetupRequest {
  name: string;
  base_domain: string;
  auth: RestApiAuthConfig;
  additional_secret_reference_ids: string[];
  network_policy_id?: string | null;
  worker: SourceWorker;
  permissions: string[];
}


export interface WebhookParameterMetadata {
  name: string;
  type: WebhookParameterKind;
  required: boolean;
  description?: string | null;
  allowed_values?: string[] | null;
  item_type?: WebhookParameterMetadata | null;
  fields?: WebhookParameterMetadata[] | null;
  inner_type?: WebhookParameterMetadata | null;
}

export interface WebhookOutputExtractor {
  kind: WebhookOutputExtractorKind;
  key_path?: string[];
  array_index_path?: number[];
  json_path?: string;
}

export interface WebhookOutputParameterMetadata {
  name: string;
  type: WebhookParameterKind;
  extractor: WebhookOutputExtractor;
  description?: string | null;
}

export interface WebhookInputParameterMapping {
  parameter_name: string;
  source: WebhookInputMappingSource;
  source_path?: string[];
  value?: unknown;
  skip_when_undefined?: boolean;
}

export interface WebhookInputMappingResult {
  should_invoke: boolean;
  inputs: Record<string, unknown>;
  skipped_reason: string | null;
}

export interface WebhookResponseForExtraction {
  status: number;
  body: unknown;
  text?: string | null;
}

export interface WebhookInvocationRedactedMetadata {
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  body_preview?: string | null;
  body_bytes?: number;
  truncated?: boolean;
}

export interface WebhookInvocationRecord {
  id: string;
  source_id: string;
  webhook_id: string;
  invoked_at: string;
  caller_id: string | null;
  action_type_id?: string | null;
  function_rid?: string | null;
  input_summary: Record<string, string>;
  http_status: number | null;
  parsed_outputs: Record<string, unknown>;
  status: WebhookInvocationStatus;
  error: string | null;
  retry_attempts: number;
  request: WebhookInvocationRedactedMetadata;
  response: WebhookInvocationRedactedMetadata;
  retained_until: string | null;
}

export interface WebhookRetryPolicy {
  max_attempts: number;
  initial_backoff_ms: number;
  max_backoff_ms: number;
}

export interface WebhookHeader {
  name: string;
  value: string;
  secret_reference_id?: string | null;
}

export interface WebhookQueryParam {
  name: string;
  value: string;
}

export interface WebhookDefinition {
  id: string;
  source_id: string;
  name: string;
  method: WebhookHttpMethod;
  relative_path: string;
  query_params: WebhookQueryParam[];
  headers: WebhookHeader[];
  body_template: string | null;
  authorization_reference_id?: string | null;
  input_parameters?: WebhookParameterMetadata[];
  output_parameters?: WebhookOutputParameterMetadata[];
  timeout_ms: number;
  retry: WebhookRetryPolicy;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookRequest {
  name: string;
  method: WebhookHttpMethod;
  relative_path: string;
  query_params: WebhookQueryParam[];
  headers: WebhookHeader[];
  body_template?: string | null;
  authorization_reference_id?: string | null;
  input_parameters?: WebhookParameterMetadata[];
  output_parameters?: WebhookOutputParameterMetadata[];
  timeout_ms: number;
  retry: WebhookRetryPolicy;
}

// ---------------------------------------------------------------------------
// Media-set syncs (Foundry "Set up a media set sync" — S3 / ABFS)
//
// Mirrors `services/connector-management-service/src/handlers/media_set_syncs.rs`.
// Two flavours are supported:
//   * `MEDIA_SET_SYNC` copies bytes into Foundry storage.
//   * `VIRTUAL_MEDIA_SET_SYNC` only registers metadata (bytes stay
//     in the source). Per Foundry "Virtual media sets.md".
// ---------------------------------------------------------------------------

export type MediaSetSyncKind = 'MEDIA_SET_SYNC' | 'VIRTUAL_MEDIA_SET_SYNC';

export interface MediaSetSyncFilters {
  exclude_already_synced: boolean;
  path_glob: string | null;
  /** Bytes — `null` means "no limit". */
  file_size_limit: number | null;
  ignore_unmatched_schema: boolean;
}

export interface MediaSetSyncDef {
  id: string;
  source_id: string;
  kind: MediaSetSyncKind;
  target_media_set_rid: string;
  subfolder: string;
  filters: MediaSetSyncFilters;
  schedule_cron: string | null;
  created_at: string;
}

export interface CreateMediaSetSyncRequest {
  kind: MediaSetSyncKind;
  target_media_set_rid: string;
  subfolder?: string;
  filters?: Partial<MediaSetSyncFilters>;
  schedule_cron?: string | null;
}

// SDC.41 — Media sync handoff history, usage, and connector gating.
export type MediaSetSyncRunStatus = 'running' | 'succeeded' | 'failed' | 'partially_succeeded';

export interface MediaSetSyncRun {
  id: string;
  sync_def_id: string;
  status: MediaSetSyncRunStatus;
  started_at: string;
  finished_at?: string | null;
  accepted_files: number;
  skipped_files: number;
  schema_mismatched: number;
  dispatched_files: number;
  dispatch_errors: number;
  bytes_accepted: number;
  selected_paths: string[];
  schema_mismatches: string[];
  error_message?: string | null;
  triggered_by?: string | null;
}

export interface MediaSetSyncUsageSummary {
  sync_def_id: string;
  run_count: number;
  last_run_at?: string | null;
  last_status?: MediaSetSyncRunStatus | null;
  last_error_message?: string | null;
  total_accepted_files: number;
  total_bytes_accepted: number;
  total_dispatch_errors: number;
  total_schema_mismatch: number;
}

export interface MediaSetSyncWithUsage extends MediaSetSyncDef {
  usage?: MediaSetSyncUsageSummary | null;
}

export interface MediaSetSyncHandoffDelegation {
  schema: string;
  conversion: string;
  transformations: string;
  transaction_policy: string;
  media_reference: string;
}

export const MEDIA_SYNC_SUPPORTED_CONNECTORS = ['s3', 'onelake', 'abfs'] as const;

export function connectorSupportsMediaSync(connectorType: string | null | undefined): boolean {
  if (!connectorType) return false;
  const normalized = connectorType.trim().toLowerCase();
  return (MEDIA_SYNC_SUPPORTED_CONNECTORS as readonly string[]).includes(normalized);
}

export function mediaSetSyncRunStatusLabel(status: MediaSetSyncRunStatus): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Succeeded';
    case 'partially_succeeded':
      return 'Partially succeeded';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function formatMediaSetSyncBytes(bytes: number | null | undefined): string {
  const value = bytes ?? 0;
  if (value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[unit]}`;
}

// SDC.42 — Virtual media handoff (blocked) descriptor and helpers. Mirrors the
// backend `VirtualMediaHandoff` / `VirtualMediaHandoffDescriptor` shapes; the
// status stays `blocked` until the Media Sets surface defines virtual item
// semantics and the platform agrees on an object storage authorization
// primitive (MS.18–MS.20).
export type VirtualMediaHandoffMode = 'media_set_sync_virtual' | 'external_transform' | 'rest_api';

export interface VirtualMediaHandoff {
  id: string;
  title: string;
  summary: string;
  handoff_mode: VirtualMediaHandoffMode;
  connector_type: string;
  status: 'blocked' | 'available' | string;
  blockers: string[];
  readiness_checks: string[];
  required_contracts: string[];
  source_rid?: string;
  media_set_contract: string;
  object_storage_contract: string;
  authorization_contract: string;
  registration_sketch: string;
  docs_url: string;
}

export interface VirtualMediaHandoffDescriptor {
  source_id?: string;
  source_rid?: string;
  connector_type: string;
  status: 'blocked' | 'available' | 'not_supported' | string;
  blocked_reason?: string;
  supported_connectors: string[];
  handoffs: VirtualMediaHandoff[];
  delegation: MediaSetSyncHandoffDelegation;
}

export function virtualMediaHandoffsAreBlocked(handoffs: VirtualMediaHandoff[]): boolean {
  if (!handoffs || handoffs.length === 0) return false;
  return handoffs.every((handoff) => handoff.status === 'blocked');
}

export function virtualMediaHandoffBlockers(handoffs: VirtualMediaHandoff[]): string[] {
  const seen = new Set<string>();
  for (const handoff of handoffs) {
    for (const blocker of handoff.blockers ?? []) {
      if (blocker) seen.add(blocker);
    }
  }
  return Array.from(seen).sort();
}

export function virtualMediaHandoffCoverage(handoffs: VirtualMediaHandoff[]): string[] {
  const seen = new Set<string>();
  for (const handoff of handoffs) {
    if (handoff.handoff_mode) seen.add(handoff.handoff_mode);
  }
  return Array.from(seen).sort();
}

export function virtualMediaHandoffModeLabel(mode: VirtualMediaHandoffMode | string): string {
  switch (mode) {
    case 'media_set_sync_virtual':
      return 'VIRTUAL_MEDIA_SET_SYNC dispatch';
    case 'external_transform':
      return 'External transform registration';
    case 'rest_api':
      return 'REST API registration';
    default:
      return mode;
  }
}

// SDC.43 — Listener-style inbound ingestion descriptor and helpers.
//
// Mirrors the backend `ListenerInboundDescriptor` / `ListenerInboundCapability`
// shapes. The aggregate `status` stays `blocked` until product policy pins the
// schema mapping, auth strategy, replay/idempotency, and dead-letter semantics
// for inbound webhook/listener flows. The descriptor still exposes the HMAC
// webhook surface that is wired today so users can pick the right ingestion
// path for the call site.
export type ListenerInboundFacet =
  | 'schema_mapping'
  | 'auth_strategy'
  | 'replay_idempotency'
  | 'dead_letter';

export type ListenerInboundStatus = 'available' | 'partial' | 'blocked';

export interface ListenerInboundCapability {
  id: string;
  title: string;
  summary: string;
  facet: ListenerInboundFacet;
  status: ListenerInboundStatus | string;
  existing_surface: string;
  blockers: string[];
  readiness_checks: string[];
  required_contracts: string[];
  configuration_sketch: string;
  docs_url: string;
}

export interface ListenerInboundDescriptor {
  source_id?: string;
  source_rid?: string;
  connector_type: string;
  status: ListenerInboundStatus | string;
  blocked_reason?: string;
  available_surfaces: string[];
  supported_auth_modes: string[];
  blocked_auth_modes: string[];
  idempotency_key_headers: string[];
  max_payload_bytes: number;
  capabilities: ListenerInboundCapability[];
  recommendation: StreamIngestionRecommendation;
}

export function listenerInboundCapabilitiesAreBlocked(caps: ListenerInboundCapability[]): boolean {
  if (!caps || caps.length === 0) return false;
  return caps.every((c) => c.status === 'blocked');
}

export function listenerInboundBlockers(caps: ListenerInboundCapability[]): string[] {
  const seen = new Set<string>();
  for (const c of caps) {
    for (const blocker of c.blockers ?? []) {
      if (blocker) seen.add(blocker);
    }
  }
  return Array.from(seen).sort();
}

export function listenerInboundCoverage(caps: ListenerInboundCapability[]): ListenerInboundFacet[] {
  const seen = new Set<ListenerInboundFacet>();
  for (const c of caps) {
    if (c.facet) seen.add(c.facet);
  }
  return Array.from(seen).sort();
}

export function listenerInboundFacetLabel(facet: ListenerInboundFacet | string): string {
  switch (facet) {
    case 'schema_mapping':
      return 'Schema mapping';
    case 'auth_strategy':
      return 'Auth strategy';
    case 'replay_idempotency':
      return 'Replay & idempotency';
    case 'dead_letter':
      return 'Dead-letter handling';
    default:
      return facet;
  }
}

export function aggregateListenerInboundStatus(caps: ListenerInboundCapability[]): ListenerInboundStatus {
  if (!caps || caps.length === 0) return 'blocked';
  let hasBlocked = false;
  let hasPartial = false;
  for (const c of caps) {
    if (c.status === 'blocked') hasBlocked = true;
    else if (c.status === 'partial') hasPartial = true;
  }
  if (hasBlocked) return 'blocked';
  if (hasPartial) return 'partial';
  return 'available';
}

// SDC.44 — Connector-specific capability packs (declarative manifests per
// connector family). Mirrors the backend `ConnectorCapabilityPack` shape so
// the UI can render typed capability chips alongside per-capability
// validation rules without having to special-case each connector.
export type ConnectorCapabilityFamily =
  | 'relational_database'
  | 'data_warehouse'
  | 'object_store'
  | 'file_transfer'
  | 'event_stream'
  | 'message_queue'
  | 'rest_api'
  | 'foundry_to_foundry';

export interface ConnectorCapabilityFlags {
  batch_sync: boolean;
  file_sync: boolean;
  table_sync: boolean;
  streaming_sync: boolean;
  cdc_sync: boolean;
  media_sync: boolean;
  file_export: boolean;
  table_export: boolean;
  streaming_export: boolean;
  virtual_table: boolean;
  webhook: boolean;
  exploration: boolean;
}

export interface ConnectorCapabilityValidationRule {
  id: string;
  capability: string;
  severity: 'required' | 'recommended' | 'informational' | string;
  description: string;
}

export interface ConnectorCapabilityPack {
  connector_type: string;
  display_name: string;
  family: ConnectorCapabilityFamily;
  capabilities: ConnectorCapabilityFlags;
  worker_overrides?: Record<string, ConnectorCapabilityFlags>;
  cdc_input_kind?: string;
  validation_rules: ConnectorCapabilityValidationRule[];
  notes?: string[];
  docs_url: string;
}

const CAPABILITY_ORDER: Array<keyof ConnectorCapabilityFlags> = [
  'batch_sync',
  'file_sync',
  'table_sync',
  'streaming_sync',
  'cdc_sync',
  'media_sync',
  'file_export',
  'table_export',
  'streaming_export',
  'virtual_table',
  'webhook',
  'exploration',
];

export function connectorCapabilityPackEffectiveFlags(
  pack: ConnectorCapabilityPack,
  worker: SourceWorker | string | null | undefined,
): ConnectorCapabilityFlags {
  if (!worker) return pack.capabilities;
  const override = pack.worker_overrides?.[String(worker).toLowerCase().trim()];
  return override ?? pack.capabilities;
}

export function connectorCapabilityPackChips(flags: ConnectorCapabilityFlags): Array<keyof ConnectorCapabilityFlags> {
  return CAPABILITY_ORDER.filter((capability) => flags[capability]);
}

export function connectorCapabilityPackValidationRulesFor(
  pack: ConnectorCapabilityPack,
  capability: string,
): ConnectorCapabilityValidationRule[] {
  if (!pack || !capability) return [];
  return pack.validation_rules.filter((rule) => rule.capability === capability);
}

// SDC.45 — Stream lag and throughput metrics. Mirrors the backend
// `StreamMetricsSnapshot` shape; helpers run client-side against the existing
// `DataConnectionStreamResource` so the Streams tab can render rates, lag, and
// breakdowns without waiting for a round-trip when the snapshot can be
// computed locally.
export type StreamMetricsWindow = '1m' | '5m' | '1h' | '1d';

export interface StreamThroughputSummary {
  records_per_second: number;
  bytes_per_second: number;
  window_seconds: number;
  window_started_at?: string | null;
}

export interface StreamLagBreakdown {
  stream_lag_records: number;
  hot_buffer_records: number;
  hot_buffer_bytes: number;
  archive_lag_records: number;
  processing_lag_records: number;
}

export interface StreamCheckpointMetrics {
  checkpoint_count: number;
  average_duration_ms: number;
  max_duration_ms: number;
  last_duration_ms: number;
  average_size_bytes: number;
  last_size_bytes: number;
  failure_count: number;
}

export interface StreamRetryMetrics {
  total_retries: number;
  dropped_records: number;
  duplicate_warnings: number;
  recent_failures: number;
}

export interface StreamPartitionMetrics {
  partition_key: string;
  topic?: string;
  lag: number;
  ingestion: StreamThroughputSummary;
  consumption: StreamThroughputSummary;
}

export interface StreamConsumerMetrics {
  consumer_id: string;
  consumer_name?: string;
  consumer_group?: string;
  status?: string;
  lag: number;
  consumption: StreamThroughputSummary;
}

export interface StreamSyncMetrics {
  sync_id: string;
  sync_name?: string;
  last_run_status?: string;
  ingestion: StreamThroughputSummary;
  retries: number;
}

export interface StreamExportMetrics {
  export_id: string;
  export_name?: string;
  last_run_status?: string;
  consumption: StreamThroughputSummary;
  retries: number;
  duplicate_risk: boolean;
  drop_risk: boolean;
  records_exported: number;
}

export interface StreamMetricsSnapshot {
  stream_id: string;
  stream_rid?: string;
  stream_name?: string;
  window: StreamMetricsWindow | string;
  captured_at: string;
  ingestion: StreamThroughputSummary;
  consumption: StreamThroughputSummary;
  lag: StreamLagBreakdown;
  checkpoint: StreamCheckpointMetrics;
  retries: StreamRetryMetrics;
  partitions: StreamPartitionMetrics[];
  consumers: StreamConsumerMetrics[];
  streaming_syncs: StreamSyncMetrics[];
  streaming_exports: StreamExportMetrics[];
  warnings?: string[];
}

export interface StreamMetricsInput {
  stream_id: string;
  stream_rid?: string;
  stream_name?: string;
  window?: StreamMetricsWindow;
  captured_at?: string;
  stream_lag_records?: number;
  hot_buffer_records?: number;
  hot_buffer_bytes?: number;
  archive_lag_records?: number;
  processing_lag_records?: number;
  ingested_records?: number;
  ingested_bytes?: number;
  consumed_records?: number;
  consumed_bytes?: number;
  retries?: number;
  dropped_records?: number;
  duplicate_warnings?: number;
  recent_failures?: number;
  checkpoints?: Array<{ id: string; status: string; duration_ms: number; size_bytes: number; created_at: string }>;
  consumers?: Array<{
    id: string;
    name: string;
    consumer_group?: string;
    status?: string;
    lag: number;
    records_read?: number;
    bytes_read?: number;
  }>;
  partitions?: Array<{
    partition_key: string;
    topic?: string;
    lag: number;
    ingested_records?: number;
    ingested_bytes?: number;
    consumed_records?: number;
    consumed_bytes?: number;
  }>;
  streaming_syncs?: Array<{
    sync_id: string;
    sync_name?: string;
    last_run_status?: string;
    records_ingested?: number;
    bytes_ingested?: number;
    retries?: number;
  }>;
  streaming_exports?: Array<{
    export_id: string;
    export_name?: string;
    last_run_status?: string;
    records_exported?: number;
    bytes_exported?: number;
    retries?: number;
    duplicate_risk?: boolean;
    drop_risk?: boolean;
  }>;
}

export function streamMetricsWindowSeconds(window: StreamMetricsWindow | string | undefined): number {
  switch (window) {
    case '5m':
      return 300;
    case '1h':
      return 3600;
    case '1d':
      return 86400;
    case '1m':
    default:
      return 60;
  }
}

export function formatStreamRate(value: number, unit: 'records' | 'bytes'): string {
  if (!Number.isFinite(value) || value <= 0) return unit === 'records' ? '0 rec/s' : '0 B/s';
  if (unit === 'records') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M rec/s`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)} k rec/s`;
    return `${value.toFixed(value >= 100 ? 0 : 1)} rec/s`;
  }
  // bytes
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let i = 0;
  while (scaled >= 1024 && i < units.length - 1) {
    scaled /= 1024;
    i += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 1)} ${units[i]}/s`;
}

export function streamMetricsHasWarning(snapshot: StreamMetricsSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.warnings && snapshot.warnings.length > 0) return true;
  if (snapshot.retries.dropped_records > 0 || snapshot.retries.duplicate_warnings > 0) return true;
  if (snapshot.lag.stream_lag_records > 0 && snapshot.consumption.records_per_second === 0) return true;
  if (snapshot.checkpoint.failure_count > 0) return true;
  return false;
}

export function streamMetricsInputFromResource(
  stream: DataConnectionStreamResource,
  window: StreamMetricsWindow = '1m',
): StreamMetricsInput {
  const offsets = stream.offsets ?? { earliest_offset: null, latest_offset: null, committed_offset: null, lag: null };
  const consumers = (stream.consumers ?? []).map((consumer) => ({
    id: consumer.id,
    name: consumer.name,
    consumer_group: consumer.consumer_group ?? undefined,
    status: consumer.status,
    lag: consumer.lag ?? 0,
  }));
  const checkpoints = (stream.checkpoints ?? []).map((checkpoint) => ({
    id: checkpoint.id,
    status: String(checkpoint.status),
    duration_ms: checkpoint.duration_ms ?? 0,
    size_bytes: checkpoint.size_bytes ?? 0,
    created_at: checkpoint.created_at,
  }));
  return {
    stream_id: stream.id,
    stream_rid: stream.rid ?? undefined,
    stream_name: stream.name,
    window,
    captured_at: new Date().toISOString(),
    stream_lag_records: offsets.lag ?? 0,
    hot_buffer_records: 0,
    hot_buffer_bytes: stream.hot_buffer?.hot_buffer_bytes ?? 0,
    consumers,
    checkpoints,
  };
}

// SDC.46 — Stream replay controls (safe replay planner). Mirrors the backend
// `StreamReplayPlan` so the Streams tab can render impact severity, missing
// acknowledgements, and the explicit confirmation required before replaying
// streams with active exports.
export type StreamReplayDownstreamKind =
  | 'streaming_export'
  | 'cdc_archive_view'
  | 'object_index'
  | 'duplicate_tolerant_consumer';

export type StreamReplayImpactSeverity = 'block' | 'warn' | 'info';
export type StreamReplayPlanStatus = 'ready' | 'requires_confirmation' | 'blocked';

export interface StreamReplayActiveExportInput {
  export_id: string;
  export_name?: string;
  status: string;
  replay_behavior?: string;
  has_active_consumers?: boolean;
}

export interface StreamReplayCDCViewInput {
  view_id: string;
  view_name?: string;
  ordering_column?: string;
  deletion_column?: string;
}

export interface StreamReplayObjectIndexInput {
  index_id: string;
  object_type?: string;
  key_by_field?: string;
}

export interface StreamReplayConsumerInput {
  consumer_id: string;
  consumer_name?: string;
  consumer_group?: string;
  idempotency_mode?: 'duplicate_tolerant' | 'exactly_once' | 'unknown' | string;
}

export interface StreamReplayPlanRequest {
  stream_id: string;
  stream_rid?: string;
  stream_name?: string;
  from_offset?: number | null;
  to_offset?: number | null;
  earliest_offset?: number | null;
  latest_offset?: number | null;
  reason: string;
  requested_by?: string;
  acknowledgements?: string[];
  exports?: StreamReplayActiveExportInput[];
  cdc_views?: StreamReplayCDCViewInput[];
  object_indices?: StreamReplayObjectIndexInput[];
  consumers?: StreamReplayConsumerInput[];
  computed_at?: string;
}

export interface StreamReplayDownstreamImpact {
  kind: StreamReplayDownstreamKind;
  resource_id: string;
  resource_name?: string;
  severity: StreamReplayImpactSeverity;
  implication: string;
  mitigation?: string;
  warning_id?: string;
}

export interface StreamReplayPlan {
  stream_id: string;
  stream_rid?: string;
  stream_name?: string;
  status: StreamReplayPlanStatus | string;
  reason?: string;
  requested_by?: string;
  from_offset?: number | null;
  to_offset?: number | null;
  estimated_records?: number | null;
  confirmation_required: boolean;
  acknowledgements_required: string[];
  acknowledgements_satisfied: string[];
  acknowledgements_missing: string[];
  preconditions_satisfied: string[];
  preconditions_blocking: string[];
  impacts: StreamReplayDownstreamImpact[];
  computed_at: string;
}

export function streamReplayDownstreamKindLabel(kind: StreamReplayDownstreamKind | string): string {
  switch (kind) {
    case 'streaming_export':
      return 'Streaming export';
    case 'cdc_archive_view':
      return 'CDC archive view';
    case 'object_index':
      return 'Object index';
    case 'duplicate_tolerant_consumer':
      return 'Consumer';
    default:
      return kind;
  }
}

export function streamReplayImpactSeverityLabel(severity: StreamReplayImpactSeverity | string): string {
  switch (severity) {
    case 'block':
      return 'Block';
    case 'warn':
      return 'Warn';
    case 'info':
      return 'Info';
    default:
      return severity;
  }
}

export function streamReplayPlanRequiresAcknowledgement(plan: StreamReplayPlan | null | undefined, warningId: string): boolean {
  if (!plan) return false;
  return plan.acknowledgements_missing.includes(warningId);
}

// SDC.47 — Dead-letter sinks and quarantine handling. Mirrors the backend
// shapes; helpers classify failures, validate sink configuration, summarize
// quarantine state by category, and build the replay plan client-side so the
// UI can preview before submitting.
export type QuarantineFailureCategory =
  | 'schema_validation'
  | 'serialization'
  | 'permission_check'
  | 'destination_write'
  | 'unknown';

export type DeadLetterSinkKind = 'dataset' | 'stream';

export interface DeadLetterRedactionRule {
  field: string;
  replacement: string;
  hash_sha256?: boolean;
  description?: string;
}

export interface DeadLetterSink {
  sync_def_id: string;
  kind: DeadLetterSinkKind | string;
  target_rid: string;
  retention_days: number;
  redaction_rules: DeadLetterRedactionRule[];
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateDeadLetterSinkRequest {
  kind: DeadLetterSinkKind;
  target_rid: string;
  retention_days: number;
  redaction_rules: DeadLetterRedactionRule[];
}

export interface QuarantinedRecord {
  id: string;
  sync_def_id: string;
  run_id?: string | null;
  failure_category: QuarantineFailureCategory | string;
  error_message: string;
  record_key?: string | null;
  redacted_payload: Record<string, unknown>;
  redacted_headers: Record<string, unknown>;
  recorded_at: string;
  expires_at: string;
  replay_requested_at?: string | null;
  replay_requested_by?: string | null;
}

export interface QuarantineSummary {
  sync_def_id: string;
  total: number;
  by_category: Partial<Record<QuarantineFailureCategory, number>>;
  earliest?: string | null;
  latest?: string | null;
  next_expiry?: string | null;
  records: QuarantinedRecord[];
}

export interface RecordQuarantineRequest {
  run_id?: string;
  failure_category?: QuarantineFailureCategory;
  error_message: string;
  record_key?: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

export interface QuarantineReplayRequest {
  record_ids: string[];
  reason?: string;
}

export interface QuarantineReplayPlan {
  sync_def_id: string;
  records_matched: number;
  records_expired: number;
  record_ids: string[];
  expired_ids: string[];
  requires_fix: boolean;
  blocking_reasons?: string[];
  computed_at: string;
}

export function classifyQuarantineFailure(errorMessage: string | null | undefined): QuarantineFailureCategory {
  const msg = (errorMessage ?? '').toLowerCase().trim();
  if (!msg) return 'unknown';
  if (['schema', 'validation', 'missing field', 'invalid type', 'schema mismatch'].some((m) => msg.includes(m))) {
    return 'schema_validation';
  }
  if (['serializ', 'deserializ', 'parse', 'json', 'malformed', 'decode error'].some((m) => msg.includes(m))) {
    return 'serialization';
  }
  if (['permission denied', 'forbidden', 'unauthorized', 'marking', 'policy', 'acl'].some((m) => msg.includes(m))) {
    return 'permission_check';
  }
  if (['destination', 'write conflict', 'constraint', 'duplicate key', 'dataset', 'sink'].some((m) => msg.includes(m))) {
    return 'destination_write';
  }
  return 'unknown';
}

export function quarantineFailureCategoryLabel(category: QuarantineFailureCategory | string): string {
  switch (category) {
    case 'schema_validation':
      return 'Schema validation';
    case 'serialization':
      return 'Serialization';
    case 'permission_check':
      return 'Permission check';
    case 'destination_write':
      return 'Destination write';
    case 'unknown':
      return 'Unknown';
    default:
      return category;
  }
}

export function validateDeadLetterSink(req: UpdateDeadLetterSinkRequest): string[] {
  const errs: string[] = [];
  if (req.kind !== 'dataset' && req.kind !== 'stream') {
    errs.push('kind must be dataset or stream');
  }
  const target = req.target_rid?.trim() ?? '';
  if (!target) {
    errs.push('target_rid is required');
  } else if (!target.startsWith('ri.')) {
    errs.push('target_rid must start with ri.');
  }
  if (!Number.isFinite(req.retention_days) || req.retention_days < 1 || req.retention_days > 365) {
    errs.push('retention_days must be between 1 and 365');
  }
  (req.redaction_rules ?? []).forEach((rule, index) => {
    if (!rule.field || !rule.field.trim()) errs.push(`redaction_rules[${index}].field is required`);
    if (rule.hash_sha256 && rule.replacement && rule.replacement.trim() !== '') {
      errs.push(`redaction_rules[${index}]: hash_sha256 and replacement are mutually exclusive`);
    }
  });
  return errs;
}

export function quarantineExpiresWithin(record: QuarantinedRecord, now: Date = new Date()): { expired: boolean; daysLeft: number } {
  const expiresAt = new Date(record.expires_at);
  const diffMs = expiresAt.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return { expired: diffMs < 0, daysLeft };
}

export function buildQuarantineReplayPlanLocal(
  syncDefID: string,
  records: QuarantinedRecord[],
  recordIDs: string[],
  now: Date = new Date(),
): QuarantineReplayPlan {
  const plan: QuarantineReplayPlan = {
    sync_def_id: syncDefID,
    records_matched: 0,
    records_expired: 0,
    record_ids: [],
    expired_ids: [],
    requires_fix: false,
    blocking_reasons: [],
    computed_at: now.toISOString(),
  };
  if (!recordIDs || recordIDs.length === 0) {
    plan.blocking_reasons!.push('quarantine_replay_no_records');
    plan.requires_fix = true;
    return plan;
  }
  const wanted = new Set(recordIDs);
  for (const record of records) {
    if (!wanted.has(record.id)) continue;
    if (new Date(record.expires_at).getTime() < now.getTime()) {
      plan.records_expired += 1;
      plan.expired_ids.push(record.id);
    } else {
      plan.records_matched += 1;
      plan.record_ids.push(record.id);
    }
  }
  plan.record_ids.sort();
  plan.expired_ids.sort();
  if (plan.records_expired > 0) {
    plan.requires_fix = true;
    plan.blocking_reasons!.push('quarantine_replay_expired_records');
  }
  if (plan.records_matched === 0) {
    plan.blocking_reasons!.push('quarantine_replay_no_eligible_records');
    plan.requires_fix = true;
  }
  return plan;
}

export function sortStreamReplayImpactsBySeverity(impacts: StreamReplayDownstreamImpact[]): StreamReplayDownstreamImpact[] {
  const rank = (sev: StreamReplayImpactSeverity | string): number => {
    if (sev === 'block') return 0;
    if (sev === 'warn') return 1;
    return 2;
  };
  return [...impacts].sort((a, b) => rank(a.severity) - rank(b.severity));
}

export function streamMetricsWindowLabel(window: StreamMetricsWindow | string | undefined): string {
  switch (window) {
    case '1m':
      return 'Last 1 minute';
    case '5m':
      return 'Last 5 minutes';
    case '1h':
      return 'Last hour';
    case '1d':
      return 'Last day';
    default:
      return String(window ?? '');
  }
}

export function connectorCapabilityFamilyLabel(family: ConnectorCapabilityFamily | string): string {
  switch (family) {
    case 'relational_database':
      return 'Relational database';
    case 'data_warehouse':
      return 'Data warehouse';
    case 'object_store':
      return 'Object store';
    case 'file_transfer':
      return 'File transfer';
    case 'event_stream':
      return 'Event stream';
    case 'message_queue':
      return 'Message queue';
    case 'rest_api':
      return 'REST API';
    case 'foundry_to_foundry':
      return 'Foundry-to-Foundry';
    default:
      return family;
  }
}

export function summarizeMediaSetSyncUsage(usage: MediaSetSyncUsageSummary | null | undefined): string {
  if (!usage || usage.run_count === 0) return 'No runs recorded yet';
  const parts = [`${usage.run_count} run${usage.run_count === 1 ? '' : 's'}`];
  parts.push(`${usage.total_accepted_files.toLocaleString()} files`);
  parts.push(formatMediaSetSyncBytes(usage.total_bytes_accepted));
  if (usage.total_dispatch_errors > 0) {
    parts.push(`${usage.total_dispatch_errors} dispatch error${usage.total_dispatch_errors === 1 ? '' : 's'}`);
  }
  if (usage.total_schema_mismatch > 0) {
    parts.push(`${usage.total_schema_mismatch} schema mismatch${usage.total_schema_mismatch === 1 ? '' : 'es'}`);
  }
  return parts.join(' · ');
}

// Registrations / discovery payloads ----------------------------------------

export type RegistrationMode = 'sync' | 'zero_copy';

export type ExplorationNodeKind = 'folder' | 'file' | 'database' | 'schema' | 'table' | 'topic' | 'queue' | 'stream' | 'entity' | 'sample';
export type ExplorationSessionStatus = 'active' | 'completed' | 'expired' | 'failed';

export interface ExplorationSchemaField {
  name: string;
  source_type: string;
  foundry_type?: string | null;
  nullable?: boolean | null;
}

export interface ExplorationNode {
  selector: string;
  display_name: string;
  kind: ExplorationNodeKind | string;
  path?: string | null;
  has_children?: boolean;
  supports_sync?: boolean;
  supports_zero_copy?: boolean;
  source_signature?: string | null;
  schema?: ExplorationSchemaField[] | null;
  sample_rows?: Array<Record<string, unknown>> | null;
  sample_redacted?: boolean;
  unauthorized_sample_count?: number;
  metadata?: Record<string, unknown> | null;
}

export interface ExplorationSession {
  id: string;
  source_id: string;
  status: ExplorationSessionStatus;
  root_selector: string | null;
  selectors_examined: number;
  sample_rows_stored: 0;
  secrets_persisted: false;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  audit_event_id?: string | null;
}

export interface ExploreSourceRequest {
  selector?: string;
  cursor?: string;
  include_sample?: boolean;
  sample_limit?: number;
}

export interface ExploreSourceResponse {
  session: ExplorationSession;
  nodes: ExplorationNode[];
  next_cursor?: string | null;
}

export interface DiscoveredSource {
  selector: string;
  display_name?: string | null;
  source_kind?: string | null;
  supports_sync?: boolean;
  supports_zero_copy?: boolean;
  source_signature?: string | null;
  schema?: ExplorationSchemaField[] | null;
  sample_rows?: Array<Record<string, unknown>> | null;
  sample_redacted?: boolean;
  unauthorized_sample_count?: number;
  metadata?: Record<string, unknown> | null;
}

export interface BulkRegistrationItem {
  selector: string;
  display_name?: string;
  source_kind?: string;
  registration_mode?: RegistrationMode | null;
  auto_sync?: boolean;
  update_detection?: boolean;
  target_dataset_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectionRegistration {
  id: string;
  connection_id: string;
  selector: string;
  display_name: string;
  source_kind: string | null;
  registration_mode: RegistrationMode | string | null;
  auto_sync: boolean;
  update_detection: boolean;
  target_dataset_id: string | null;
  last_source_signature: string | null;
  last_dataset_version: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// REST surface
// ---------------------------------------------------------------------------

const BASE = '/data-connection';

interface ApiListEnvelope<T> {
  data?: T[];
  items?: T[];
}

function listItems<T>(payload: ApiListEnvelope<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload.data ?? payload.items ?? [];
}

export const dataConnection = {
  // Catalog ----------------------------------------------------------------
  getCatalog(): Promise<ConnectorCatalog> {
    return api.get(`${BASE}/catalog`);
  },
  listStreamingSourceContracts(): Promise<StreamingSourceContractResponse> {
    return api.get(`${BASE}/streaming-sources`);
  },

  // Sources ----------------------------------------------------------------
  listSources(params: { page?: number; per_page?: number } = {}): Promise<SourceListResponse> {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.per_page) search.set('per_page', String(params.per_page));
    const query = search.toString();
    return api.get(`${BASE}/sources${query ? `?${query}` : ''}`);
  },
  getSource(id: string): Promise<Source> {
    return api.get(`${BASE}/sources/${id}`);
  },
  createSource(body: CreateSourceRequest): Promise<Source> {
    return api.post(`${BASE}/sources`, body);
  },
  updateSource(id: string, body: UpdateSourceRequest): Promise<Source> {
    return api.patch(`${BASE}/sources/${id}`, body);
  },
  archiveSource(id: string, body: ArchiveSourceRequest = {}): Promise<Source> {
    return api.post(`${BASE}/sources/${id}/archive`, body);
  },
  duplicateSource(id: string, body: DuplicateSourceRequest): Promise<Source> {
    return api.post(`${BASE}/sources/${id}/duplicate`, body);
  },
  deleteSource(id: string): Promise<void> {
    return api.delete(`${BASE}/sources/${id}`);
  },
  testConnection(id: string): Promise<TestConnectionResult> {
    return api.post(`${BASE}/sources/${id}/test-connection`, {});
  },
  getSourceGovernance(id: string): Promise<SourceGovernance> {
    return api.get(`${BASE}/sources/${id}/permissions`);
  },
  updateSourceGovernance(id: string, body: UpdateSourceGovernanceRequest): Promise<SourceGovernance> {
    return api.patch(`${BASE}/sources/${id}/permissions`, body);
  },
  async listSourceGovernanceAudit(id: string, limit = 100): Promise<SourceGovernanceAuditEvent[]> {
    const response = await api.get<ApiListEnvelope<SourceGovernanceAuditEvent> | SourceGovernanceAuditEvent[]>(
      `${BASE}/sources/${id}/audit?limit=${encodeURIComponent(String(limit))}`,
    );
    return listItems(response);
  },
  getSourceHealth(id: string): Promise<DataConnectionHealthSummary> {
    return api.get(`${BASE}/sources/${id}/health`);
  },
  getSourceRetryPolicy(id: string): Promise<SourceRetryPolicy> {
    return api.get(`${BASE}/sources/${id}/retry-policy`);
  },
  updateSourceRetryPolicy(id: string, body: UpdateSourceRetryPolicyRequest): Promise<SourceRetryPolicy> {
    return api.put(`${BASE}/sources/${id}/retry-policy`, body);
  },
  getSourceRetryRecovery(id: string): Promise<RetryRecoverySummary> {
    return api.get(`${BASE}/sources/${id}/retry-recovery`);
  },

  // Registrations / discovery (Tarea 10 — wizard step 3) ----------------
  discoverSources(sourceId: string): Promise<{ sources: DiscoveredSource[] }> {
    return api.post(`${BASE}/sources/${sourceId}/registrations/discover`, {});
  },
  startExplorationSession(sourceId: string, body: ExploreSourceRequest = {}): Promise<ExploreSourceResponse> {
    return api.post(`${BASE}/sources/${sourceId}/exploration-sessions`, body);
  },
  exploreSource(sourceId: string, body: ExploreSourceRequest = {}): Promise<ExploreSourceResponse> {
    return api.post(`${BASE}/sources/${sourceId}/explore`, body);
  },
  getExplorationSession(sourceId: string, sessionId: string): Promise<ExplorationSession> {
    return api.get(`${BASE}/sources/${sourceId}/exploration-sessions/${sessionId}`);
  },
  async listRegistrations(sourceId: string): Promise<ConnectionRegistration[]> {
    const response = await api.get<{ registrations: ConnectionRegistration[] }>(
      `${BASE}/sources/${sourceId}/registrations`,
    );
    return response.registrations;
  },
  bulkRegister(
    sourceId: string,
    registrations: BulkRegistrationItem[],
  ): Promise<{ created: ConnectionRegistration[]; errors?: { selector: string; error: string }[] }> {
    return api.post(`${BASE}/sources/${sourceId}/registrations/bulk`, { registrations });
  },
  deleteRegistration(sourceId: string, registrationId: string): Promise<void> {
    return api.delete(`${BASE}/sources/${sourceId}/registrations/${registrationId}`);
  },

  // Credentials ------------------------------------------------------------
  setCredential(sourceId: string, body: SetCredentialRequest): Promise<Credential> {
    return api.post(`${BASE}/sources/${sourceId}/credentials`, body);
  },
  listCredentials(sourceId: string): Promise<Credential[]> {
    return api.get(`${BASE}/sources/${sourceId}/credentials`);
  },
  rotateCredential(sourceId: string, credentialId: string, body: RotateCredentialRequest): Promise<Credential> {
    return api.post(`${BASE}/sources/${sourceId}/credentials/${credentialId}/rotate`, body);
  },
  testCredential(sourceId: string, credentialId: string): Promise<TestCredentialResult> {
    return api.post(`${BASE}/sources/${sourceId}/credentials/${credentialId}/test`, {});
  },

  // Connector agents --------------------------------------------------------
  async listConnectorAgents(): Promise<ConnectorAgent[]> {
    const res = await api.get<ApiListEnvelope<ConnectorAgent> | ConnectorAgent[]>(`${BASE}/agents`);
    return listItems(res);
  },
  registerConnectorAgent(body: RegisterConnectorAgentRequest): Promise<ConnectorAgent> {
    return api.post(`${BASE}/agents`, {
      ...body,
      version: body.version ?? '',
      environment: body.environment ?? '',
      host: body.host ?? '',
      capabilities: body.capabilities ?? {},
      metadata: body.metadata ?? {},
      connected_sources: body.connected_sources ?? [],
      supported_connector_capabilities: body.supported_connector_capabilities ?? [],
      assigned_proxy_policies: body.assigned_proxy_policies ?? [],
      connection_failures: body.connection_failures ?? [],
    });
  },
  heartbeatConnectorAgent(id: string, body: ConnectorAgentHeartbeatRequest = {}): Promise<ConnectorAgent> {
    return api.post(`${BASE}/agents/${id}/heartbeat`, {
      version: body.version ?? '',
      environment: body.environment ?? '',
      host: body.host ?? '',
      capabilities: body.capabilities ?? {},
      metadata: body.metadata ?? {},
      connected_sources: body.connected_sources,
      supported_connector_capabilities: body.supported_connector_capabilities,
      assigned_proxy_policies: body.assigned_proxy_policies,
      connection_failures: body.connection_failures,
    });
  },
  deleteConnectorAgent(id: string): Promise<void> {
    return api.delete(`${BASE}/agents/${id}`);
  },

  async listSourceAgents(sourceId: string): Promise<ConnectorAgent[]> {
    const res = await api.get<ApiListEnvelope<ConnectorAgent> | ConnectorAgent[]>(
      `${BASE}/sources/${encodeURIComponent(sourceId)}/agents`,
    );
    return listItems(res);
  },
  assignAgentToSource(sourceId: string, agentId: string): Promise<ConnectorAgent> {
    return api.post(`${BASE}/sources/${encodeURIComponent(sourceId)}/agents`, {
      agent_id: agentId,
    });
  },
  unassignAgentFromSource(sourceId: string, agentId: string): Promise<void> {
    return api.delete(
      `${BASE}/sources/${encodeURIComponent(sourceId)}/agents/${encodeURIComponent(agentId)}`,
    );
  },

  // Egress policy bindings -------------------------------------------------
  listSourcePolicies(sourceId: string): Promise<NetworkEgressPolicy[]> {
    return api.get(`${BASE}/sources/${sourceId}/egress-policies`);
  },
  attachPolicy(sourceId: string, policyId: string, kind: EgressPolicyKind = 'direct'): Promise<SourcePolicyBinding> {
    return api.post(`${BASE}/sources/${sourceId}/egress-policies`, { policy_id: policyId, kind });
  },
  detachPolicy(sourceId: string, policyId: string): Promise<void> {
    return api.delete(`${BASE}/sources/${sourceId}/egress-policies/${policyId}`);
  },
  getSourceCodeImport(sourceId: string): Promise<SourceCodeImport> {
    return api.get(`${BASE}/sources/${sourceId}/code-imports`);
  },
  updateSourceCodeImport(sourceId: string, body: UpdateSourceCodeImportRequest): Promise<SourceCodeImport> {
    return api.patch(`${BASE}/sources/${sourceId}/code-imports`, body);
  },
  resolveSourceCodeImportBuildStart(
    sourceId: string,
    body: ResolveSourceCodeImportBuildRequest = {},
  ): Promise<SourceCodeImportBuildResolution> {
    return api.post(`${BASE}/sources/${sourceId}/code-imports:resolve-build-start`, body);
  },

  // Egress policies (global) -----------------------------------------------
  listEgressPolicies(): Promise<NetworkEgressPolicy[]> {
    return api.get(`${BASE}/egress-policies`);
  },
  listEgressApprovals(status = 'pending'): Promise<EgressApprovalTask[]> {
    return api.get(`${BASE}/egress-policies/approvals?status=${encodeURIComponent(status)}`);
  },
  createEgressPolicy(body: CreateEgressPolicyRequest): Promise<NetworkEgressPolicy> {
    return api.post(`${BASE}/egress-policies`, body);
  },
  decideEgressApproval(taskId: string, body: DecideEgressApprovalRequest): Promise<DecideEgressApprovalResponse> {
    return api.post(`${BASE}/egress-policies/approvals/${taskId}/decision`, body);
  },
  updateEgressPolicyState(id: string, body: UpdateEgressPolicyStateRequest): Promise<NetworkEgressPolicy> {
    return api.patch(`${BASE}/egress-policies/${id}/state`, body);
  },
  updateEgressPolicySharing(id: string, body: UpdateEgressPolicySharingRequest): Promise<NetworkEgressPolicy> {
    return api.patch(`${BASE}/egress-policies/${id}/sharing`, body);
  },
  revokeEgressPolicy(id: string, reason = 'Revoked from Data Connection egress policy page'): Promise<NetworkEgressPolicy> {
    return api.patch(`${BASE}/egress-policies/${id}/state`, { state: 'revoked', reason });
  },

  // Batch syncs ------------------------------------------------------------
  listSyncs(sourceId: string): Promise<BatchSyncDef[]> {
    return api.get(`${BASE}/sources/${sourceId}/syncs`);
  },
  createSync(body: CreateBatchSyncRequest): Promise<BatchSyncDef> {
    return api.post(`${BASE}/syncs`, body);
  },
  createStreamingSync(body: CreateStreamingSyncRequest): Promise<StreamingSyncSetup> {
    return api.post(`${BASE}/streaming-syncs`, body);
  },
  startStreamingSync(syncId: string): Promise<StreamingSyncSetup> {
    return api.post(`${BASE}/streaming-syncs/${syncId}/start`, {});
  },
  stopStreamingSync(syncId: string): Promise<StreamingSyncSetup> {
    return api.post(`${BASE}/streaming-syncs/${syncId}/stop`, {});
  },
  runSync(syncId: string): Promise<SyncRun> {
    return api.post(`${BASE}/syncs/${syncId}/run`, {});
  },
  listRuns(syncId: string): Promise<SyncRun[]> {
    return api.get(`${BASE}/syncs/${syncId}/runs`);
  },

  // Exports ---------------------------------------------------------------
  listExports(sourceId: string): Promise<DataExport[]> {
    return api.get(`${BASE}/sources/${sourceId}/exports`);
  },
  createExport(sourceId: string, body: CreateDataExportRequest): Promise<DataExport> {
    return api.post(`${BASE}/sources/${sourceId}/exports`, body);
  },
  getExport(exportId: string): Promise<DataExport> {
    return api.get(`${BASE}/exports/${exportId}`);
  },
  updateExport(exportId: string, body: UpdateDataExportRequest): Promise<DataExport> {
    return api.patch(`${BASE}/exports/${exportId}`, body);
  },
  runExport(exportId: string): Promise<DataExport> {
    return api.post(`${BASE}/exports/${exportId}/run`, {});
  },
  startExport(exportId: string): Promise<DataExport> {
    return api.post(`${BASE}/exports/${exportId}/start`, {});
  },
  stopExport(exportId: string): Promise<DataExport> {
    return api.post(`${BASE}/exports/${exportId}/stop`, {});
  },

  // Streams ---------------------------------------------------------------
  listStreams(): Promise<DataConnectionStreamResource[]> {
    return api.get(`${BASE}/streams`);
  },
  listSourceStreams(sourceId: string): Promise<DataConnectionStreamResource[]> {
    return api.get(`${BASE}/sources/${sourceId}/streams`);
  },
  getStreamResource(streamId: string): Promise<DataConnectionStreamResource> {
    return api.get(`${BASE}/streams/${streamId}`);
  },
  readStreamHybrid(streamId: string, params: { from_offset?: number; to_offset?: number; limit?: number } = {}): Promise<StreamHybridReadResponse> {
    const search = new URLSearchParams();
    if (params.from_offset !== undefined) search.set('from_offset', String(params.from_offset));
    if (params.to_offset !== undefined) search.set('to_offset', String(params.to_offset));
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    const query = search.toString();
    return api.get(`${BASE}/streams/${streamId}/hybrid-read${query ? `?${query}` : ''}`);
  },
  getPushStreamEndpoint(streamId: string, params: { dataset_rid: string; branch: string; auth_mode?: PushStreamAuthMode }): Promise<PushStreamEndpointDescriptor> {
    const search = new URLSearchParams();
    search.set('dataset_rid', params.dataset_rid);
    search.set('branch', params.branch);
    if (params.auth_mode) search.set('auth_mode', params.auth_mode);
    return api.get(`${BASE}/streams/${streamId}/push-endpoint?${search.toString()}`);
  },
  pushStreamRecords(streamId: string, body: PushStreamRecordsRequest): Promise<PushStreamRecordsResponse> {
    return api.post(`${BASE}/streams/${streamId}/records`, body);
  },

  // REST API sources and webhooks -----------------------------------------
  createRestApiSource(body: RestApiSourceSetupRequest): Promise<Source> {
    return api.post(`${BASE}/rest-api-sources`, body);
  },
  listWebhooks(sourceId: string): Promise<WebhookDefinition[]> {
    return api.get(`${BASE}/sources/${sourceId}/webhooks`);
  },
  createWebhook(sourceId: string, body: CreateWebhookRequest): Promise<WebhookDefinition> {
    return api.post(`${BASE}/sources/${sourceId}/webhooks`, body);
  },
  listWebhookInvocations(sourceId: string, webhookId: string): Promise<WebhookInvocationRecord[]> {
    return api.get(`${BASE}/sources/${sourceId}/webhooks/${webhookId}/invocations`);
  },

  // Media-set syncs (P1.4 + SDC.41 handoff history) ----------------------
  listMediaSetSyncs(sourceId: string): Promise<MediaSetSyncWithUsage[]> {
    return api.get(`${BASE}/sources/${sourceId}/media-set-syncs`);
  },
  createMediaSetSync(
    sourceId: string,
    body: CreateMediaSetSyncRequest
  ): Promise<MediaSetSyncDef> {
    return api.post(`${BASE}/sources/${sourceId}/media-set-syncs`, body);
  },
  async listMediaSetSyncRuns(syncId: string, limit = 100): Promise<MediaSetSyncRun[]> {
    const response = await api.get<ApiListEnvelope<MediaSetSyncRun> | MediaSetSyncRun[]>(
      `${BASE}/media-set-syncs/${syncId}/runs?limit=${encodeURIComponent(String(limit))}`,
    );
    return listItems(response);
  },
  getMediaSetSyncHandoffDelegation(): Promise<MediaSetSyncHandoffDelegation> {
    return api.get(`${BASE}/media-set-syncs/handoff-delegation`);
  },
  getVirtualMediaHandoff(sourceId: string): Promise<VirtualMediaHandoffDescriptor> {
    return api.get(`${BASE}/sources/${sourceId}/virtual-media-handoff`);
  },
  getListenerInboundDescriptor(sourceId: string): Promise<ListenerInboundDescriptor> {
    return api.get(`${BASE}/sources/${sourceId}/listener-descriptor`);
  },
  async listConnectorCapabilityPacks(): Promise<ConnectorCapabilityPack[]> {
    const response = await api.get<ApiListEnvelope<ConnectorCapabilityPack> | ConnectorCapabilityPack[]>(
      `${BASE}/capability-packs`,
    );
    return listItems(response);
  },
  getConnectorCapabilityPack(connectorType: string): Promise<ConnectorCapabilityPack> {
    return api.get(`${BASE}/capability-packs/${encodeURIComponent(connectorType)}`);
  },
  computeStreamMetricsSnapshot(input: StreamMetricsInput): Promise<StreamMetricsSnapshot> {
    return api.post(`${BASE}/streams/metrics:compute`, input);
  },
  computeStreamReplayPlan(input: StreamReplayPlanRequest): Promise<StreamReplayPlan> {
    return api.post(`${BASE}/streams/replay-plan:compute`, input);
  },
  getDeadLetterSink(syncId: string): Promise<DeadLetterSink> {
    return api.get(`${BASE}/syncs/${syncId}/dead-letter`);
  },
  updateDeadLetterSink(syncId: string, body: UpdateDeadLetterSinkRequest): Promise<DeadLetterSink> {
    return api.put(`${BASE}/syncs/${syncId}/dead-letter`, body);
  },
  listQuarantinedRecords(syncId: string, category?: QuarantineFailureCategory, limit = 100): Promise<QuarantineSummary> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return api.get(`${BASE}/syncs/${syncId}/quarantine${query ? `?${query}` : ''}`);
  },
  recordQuarantinedRecord(syncId: string, body: RecordQuarantineRequest): Promise<QuarantinedRecord> {
    return api.post(`${BASE}/syncs/${syncId}/quarantine`, body);
  },
  replayQuarantinedRecords(syncId: string, body: QuarantineReplayRequest): Promise<QuarantineReplayPlan> {
    return api.post(`${BASE}/syncs/${syncId}/quarantine:replay`, body);
  },
};

// ---------------------------------------------------------------------------
// Static catalog used as a fallback when the backend is not yet wired.
// Keeping it client-side makes the gallery render even before the
// connector-management-service exposes /catalog. The list covers the SDC.2 source-type registry categories with real MVP
// connectors plus explicit advertised "coming soon" entries.
// ---------------------------------------------------------------------------

const DOC_BASE = 'https://www.palantir.com/docs/foundry';

const NO_SECRET_CREDENTIALS: ConnectorCredentialField[] = [
  {
    key: 'cloud_identity',
    label: 'Cloud identity / OIDC',
    kind: 'cloud_identity',
    required: false,
    secret: false,
    description: 'Use platform-managed identity when configured; no secret value is stored in the source.',
  },
];

function capabilityFlags(capabilities: ConnectorCapability[]): ConnectorFeatureFlags {
  return {
    supportsDiscovery: capabilities.includes('exploration') || capabilities.includes('virtual_table'),
    supportsConnectionTest: true,
    supportsIncrementalSync: capabilities.includes('cdc_sync') || capabilities.includes('streaming_sync'),
    supportsStreaming: capabilities.includes('streaming_sync') || capabilities.includes('streaming_export'),
    supportsVirtualTables: capabilities.includes('virtual_table'),
    supportsExports: capabilities.some((capability) => ['file_export', 'table_export', 'streaming_export'].includes(capability)),
    supportsWebhooks: capabilities.includes('webhook'),
    supportsMedia: capabilities.includes('media_sync') || capabilities.includes('virtual_media'),
  };
}

function network(
  modes: ConnectorNetworkMode[],
  defaultPorts: number[],
  notes: string,
  privateNetworkSupported = true,
): ConnectorNetworkRequirement {
  return { modes, defaultPorts, privateNetworkSupported, notes };
}

function connector(entry: Omit<ConnectorCatalogEntry, 'featureFlags'> & { featureFlags?: Partial<ConnectorFeatureFlags> }): ConnectorCatalogEntry {
  return {
    ...entry,
    featureFlags: {
      ...capabilityFlags(entry.capabilities),
      ...entry.featureFlags,
    },
  };
}

export const FALLBACK_CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  connector({
    type: 'postgresql',
    name: 'PostgreSQL',
    description: 'Relational database table batch syncs, CDC handoff, exports, and schema exploration.',
    capabilities: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
      agent: ['batch_sync', 'cdc_sync', 'exploration'],
    },
    available: true,
    category: 'databases',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
      { key: 'certificate', label: 'TLS certificate', kind: 'certificate_key', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [5432], 'Requires host:port reachability to the database listener.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/postgresql/`,
    family: 'RDBMS',
  }),
  connector({
    type: 'mssql',
    name: 'Microsoft SQL Server',
    description: 'SQL Server source for table syncs, CDC handoff, incremental reads, and table exports.',
    capabilities: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
      agent: ['batch_sync', 'cdc_sync', 'exploration'],
    },
    available: false,
    category: 'databases',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [1433], 'Requires SQL Server port access from the selected worker.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/microsoft-sql-server/`,
    family: 'RDBMS',
  }),
  connector({
    type: 'oracle',
    name: 'Oracle Database',
    description: 'Oracle relational source for batch table syncs, CDC changelog streams, exports, and schema exploration.',
    capabilities: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
      agent: ['batch_sync', 'cdc_sync', 'exploration'],
    },
    available: false,
    category: 'databases',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [1521, 2484], 'Requires Oracle listener access and CDC log access privileges.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/oracle-database/`,
    family: 'RDBMS',
  }),
  connector({
    type: 'db2',
    name: 'IBM Db2',
    description: 'Db2 relational source for batch table syncs, CDC changelog streams, exports, and schema exploration.',
    capabilities: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'cdc_sync', 'table_export', 'exploration'],
      agent: ['batch_sync', 'cdc_sync', 'exploration'],
    },
    available: false,
    category: 'databases',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [50000], 'Requires Db2 listener access and configured log retention for CDC.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/db2/`,
    family: 'RDBMS',
  }),
  connector({
    type: 's3',
    name: 'Amazon S3',
    description: 'Sync and export files from an S3 bucket with optional prefix-based exploration.',
    capabilities: ['batch_sync', 'file_export', 'exploration', 'media_sync'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'file_export', 'exploration', 'media_sync'],
      agent: ['batch_sync', 'exploration', 'media_sync'],
    },
    available: true,
    category: 'filesystems_blob_stores',
    credentialFields: [
      { key: 'cloud_identity', label: 'AWS role / cloud identity', kind: 'cloud_identity', required: false, secret: false },
      { key: 'access_key', label: 'Access key', kind: 'api_key', required: false, secret: true },
      { key: 'secret_key', label: 'Secret key', kind: 'api_key', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy'], [443], 'Uses HTTPS to S3 or an S3-compatible endpoint.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/amazon-s3/`,
    family: 'Storage',
  }),
  connector({
    type: 'gcs',
    name: 'Google Cloud Storage',
    description: 'Sync parquet, CSV, JSON, or media objects directly from a GCS bucket.',
    capabilities: ['batch_sync', 'virtual_table', 'exploration', 'file_export', 'media_sync'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'virtual_table', 'exploration', 'file_export', 'media_sync'],
      agent: ['batch_sync', 'exploration', 'media_sync'],
    },
    available: true,
    category: 'filesystems_blob_stores',
    credentialFields: [
      { key: 'cloud_identity', label: 'GCP cloud identity', kind: 'cloud_identity', required: false, secret: false },
      { key: 'service_account_json', label: 'Service account JSON', kind: 'service_account_json', required: false, secret: true },
      { key: 'access_token', label: 'Access token', kind: 'bearer_token', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy'], [443], 'Uses HTTPS to Google Cloud Storage APIs.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/google-cloud-storage/`,
    family: 'Storage',
  }),
  connector({
    type: 'onelake',
    name: 'Microsoft OneLake / ABFS',
    description: 'ABFS-compatible source for Microsoft Fabric lakehouses and Azure Data Lake paths.',
    capabilities: ['batch_sync', 'virtual_table', 'exploration', 'file_export'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'virtual_table', 'exploration', 'file_export'],
      agent: ['batch_sync', 'exploration'],
    },
    available: true,
    category: 'filesystems_blob_stores',
    credentialFields: [
      { key: 'cloud_identity', label: 'Azure managed identity', kind: 'cloud_identity', required: false, secret: false },
      { key: 'client_secret', label: 'Client secret', kind: 'oauth_client', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy'], [443], 'Uses HTTPS to OneLake or ABFS endpoints.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/onelake-azure-blob-filesystem/`,
    family: 'Storage',
  }),
  connector({
    type: 'sftp',
    name: 'SFTP',
    description: 'File syncs and exports over SSH File Transfer Protocol.',
    capabilities: ['batch_sync', 'file_export', 'exploration'],
    workers: ['foundry', 'agent'],
    available: false,
    category: 'filesystems_blob_stores',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: false, secret: true },
      { key: 'private_key', label: 'Private key', kind: 'certificate_key', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [22], 'Requires SSH/SFTP port access.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/sftp/`,
    family: 'Storage',
  }),
  connector({
    type: 'kafka',
    name: 'Apache Kafka',
    description: 'Subscribe to Kafka topics through the streaming bridge, including changelog-shaped CDC inputs, and export records to topics.',
    capabilities: ['streaming_sync', 'cdc_sync', 'streaming_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['streaming_sync', 'cdc_sync', 'streaming_export', 'exploration'],
      agent: ['streaming_sync', 'cdc_sync', 'exploration'],
    },
    available: true,
    category: 'event_streams',
    credentialFields: [
      { key: 'sasl_username', label: 'SASL username', kind: 'username_password', required: false, secret: false },
      { key: 'sasl_password', label: 'SASL password', kind: 'username_password', required: false, secret: true },
      { key: 'client_certificate', label: 'Client certificate/key', kind: 'certificate_key', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [9092, 9093], 'Requires broker bootstrap reachability and matching TLS/SASL settings.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/kafka/`,
    family: 'Streaming',
  }),
  connector({
    type: 'kinesis',
    name: 'Amazon Kinesis',
    description: 'Stream records from a Kinesis Data Stream via shard iterators, checkpoints, and changelog-shaped CDC inputs.',
    capabilities: ['streaming_sync', 'cdc_sync'],
    workers: ['foundry', 'agent'],
    available: true,
    category: 'event_streams',
    credentialFields: NO_SECRET_CREDENTIALS,
    network: network(['direct_egress', 'agent_proxy'], [443], 'Uses HTTPS to AWS Kinesis APIs.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/amazon-kinesis/`,
    family: 'Streaming',
  }),
  connector({
    type: 'sqs',
    name: 'Amazon SQS',
    description: 'Long-poll SQS queues and acknowledge records after stream ingestion.',
    capabilities: ['streaming_sync'],
    workers: ['foundry', 'agent'],
    available: false,
    category: 'message_queues',
    credentialFields: NO_SECRET_CREDENTIALS,
    network: network(['direct_egress', 'agent_proxy'], [443], 'Uses HTTPS to AWS SQS APIs.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/other-source-types/`,
    family: 'Streaming',
  }),
  connector({
    type: 'rabbitmq',
    name: 'RabbitMQ',
    description: 'Consume AMQP queues for streaming ingestion through an agent or reachable broker.',
    capabilities: ['streaming_sync'],
    workers: ['agent'],
    available: false,
    category: 'message_queues',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
    ],
    network: network(['agent_worker', 'agent_proxy'], [5671, 5672], 'Usually private-network AMQP broker access through an agent.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/other-source-types/`,
    family: 'Streaming',
  }),
  connector({
    type: 'rest_api',
    name: 'REST API',
    description: 'Generic REST endpoint with configurable authentication, pagination, webhooks, and code use.',
    capabilities: ['batch_sync', 'webhook', 'use_in_code', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['batch_sync', 'webhook', 'use_in_code', 'exploration'],
      agent: ['batch_sync', 'use_in_code', 'exploration'],
    },
    available: true,
    category: 'rest_apis',
    credentialFields: [
      { key: 'api_key', label: 'API key', kind: 'api_key', required: false, secret: true },
      { key: 'authorization_header', label: 'Authorization header', kind: 'bearer_token', required: false, secret: true },
      { key: 'client_secret', label: 'OAuth client secret', kind: 'oauth_client', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [443, 80], 'Requires HTTP(S) reachability to the target API.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/rest-apis/`,
    family: 'API',
  }),
  connector({
    type: 'github',
    name: 'GitHub',
    description: 'Productivity-tool source for repositories, issues, pull requests, and organization metadata.',
    capabilities: ['batch_sync', 'webhook', 'use_in_code'],
    workers: ['foundry'],
    available: false,
    category: 'productivity_tools',
    credentialFields: [
      { key: 'token', label: 'Personal access token or GitHub App token', kind: 'api_key', required: true, secret: true },
    ],
    network: network(['direct_egress'], [443], 'Uses HTTPS to GitHub APIs and webhook endpoints.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/github/`,
    family: 'SaaS',
  }),
  connector({
    type: 'slack',
    name: 'Slack',
    description: 'Productivity-tool source for channels, messages, users, and listener-style events.',
    capabilities: ['batch_sync', 'webhook'],
    workers: ['foundry'],
    available: false,
    category: 'productivity_tools',
    credentialFields: [
      { key: 'bot_token', label: 'Bot token', kind: 'api_key', required: true, secret: true },
      { key: 'signing_secret', label: 'Signing secret', kind: 'connector_specific', required: false, secret: true },
    ],
    network: network(['direct_egress', 'listener'], [443], 'Uses HTTPS to Slack APIs; webhooks/listeners require inbound listener configuration.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/slack/`,
    family: 'SaaS',
  }),
  connector({
    type: 'salesforce',
    name: 'Salesforce',
    description: 'Pull SOQL queries from a Salesforce org with cursor pagination and table exports.',
    capabilities: ['batch_sync', 'virtual_table', 'table_export', 'webhook'],
    workers: ['foundry'],
    available: true,
    category: 'saas_applications',
    credentialFields: [
      { key: 'client_id', label: 'OAuth client id', kind: 'oauth_client', required: true, secret: false },
      { key: 'client_secret', label: 'OAuth client secret', kind: 'oauth_client', required: true, secret: true },
      { key: 'refresh_token', label: 'Refresh token', kind: 'bearer_token', required: false, secret: true },
    ],
    network: network(['direct_egress'], [443], 'Uses HTTPS to Salesforce APIs.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/salesforce/`,
    family: 'SaaS',
  }),
  connector({
    type: 'snowflake',
    name: 'Snowflake',
    description: 'Run statements and register virtual tables with keypair JWT or OAuth authentication.',
    capabilities: ['virtual_table', 'batch_sync', 'table_export', 'exploration'],
    workers: ['foundry', 'agent'],
    workerCapabilities: {
      foundry: ['virtual_table', 'batch_sync', 'table_export', 'exploration'],
      agent: ['batch_sync', 'exploration'],
    },
    available: true,
    category: 'saas_applications',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'private_key', label: 'Private key', kind: 'certificate_key', required: false, secret: true },
      { key: 'oauth_token', label: 'OAuth token', kind: 'bearer_token', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [443], 'Uses HTTPS to the Snowflake account endpoint.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/snowflake/`,
    family: 'SaaS',
  }),
  connector({
    type: 'bigquery',
    name: 'Google BigQuery',
    description: 'Execute jobs.query against a project using service account, token, or cloud identity auth.',
    capabilities: ['virtual_table', 'batch_sync', 'table_export', 'exploration'],
    workers: ['foundry'],
    available: true,
    category: 'saas_applications',
    credentialFields: [
      { key: 'cloud_identity', label: 'GCP cloud identity', kind: 'cloud_identity', required: false, secret: false },
      { key: 'service_account_json', label: 'Service account JSON', kind: 'service_account_json', required: false, secret: true },
      { key: 'access_token', label: 'Access token', kind: 'bearer_token', required: false, secret: true },
    ],
    network: network(['direct_egress'], [443], 'Uses HTTPS to BigQuery APIs.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/bigquery/`,
    family: 'SaaS',
  }),
  connector({
    type: 'wfs',
    name: 'Web Feature Service (WFS)',
    description: 'Geospatial feature source for WFS layers and spatial object metadata.',
    capabilities: ['batch_sync', 'exploration', 'virtual_table'],
    workers: ['foundry', 'agent'],
    available: false,
    category: 'geospatial_systems',
    credentialFields: [
      { key: 'api_key', label: 'API key', kind: 'api_key', required: false, secret: true },
      { key: 'username', label: 'Username', kind: 'username_password', required: false, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [443, 80], 'Requires HTTP(S) reachability to the geospatial service.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/web-feature-service-wfs/`,
    family: 'API',
  }),
  connector({
    type: 'dicom_media',
    name: 'DICOM media source',
    description: 'Media-source registry entry for medical imaging or unstructured media handoffs.',
    capabilities: ['media_sync', 'virtual_media', 'exploration'],
    workers: ['foundry', 'agent'],
    available: false,
    category: 'media_sources',
    credentialFields: [
      { key: 'api_key', label: 'API key', kind: 'api_key', required: false, secret: true },
      { key: 'client_certificate', label: 'Client certificate/key', kind: 'certificate_key', required: false, secret: true },
    ],
    network: network(['direct_egress', 'agent_proxy', 'agent_worker'], [443, 104], 'Supports HTTPS media APIs or private DICOM endpoints through an agent.'),
    setupDocsUrl: `${DOC_BASE}/data-integration/media-sets/`,
    family: 'Storage',
  }),
  connector({
    type: 'generic_connector',
    name: 'Generic connector',
    description: 'Fallback source type for systems without a dedicated connector, paired with code-based access.',
    capabilities: ['use_in_code', 'batch_sync', 'webhook', 'exploration'],
    workers: ['agent'],
    available: false,
    category: 'generic_connectors',
    credentialFields: [
      { key: 'connector_specific_secret', label: 'Connector-specific secret', kind: 'connector_specific', required: false, secret: true },
    ],
    network: network(['agent_worker', 'agent_proxy'], [], 'Network requirements are supplied by the custom connector implementation.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/generic-connector/`,
    family: 'API',
  }),
  connector({
    type: 'iot',
    name: 'MQTT / IoT Broker',
    description: 'Subscribe to MQTT topics on a broker to ingest IoT telemetry.',
    capabilities: ['streaming_sync'],
    workers: ['agent', 'foundry'],
    available: true,
    category: 'event_streams',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: false, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: false, secret: true },
      { key: 'client_certificate', label: 'Client certificate/key', kind: 'certificate_key', required: false, secret: true },
    ],
    network: network(['agent_worker', 'agent_proxy', 'direct_egress'], [1883, 8883], 'MQTT brokers are often private and agent-mediated; TLS typically uses 8883.'),
    setupDocsUrl: `${DOC_BASE}/available-connectors/other-source-types/`,
    family: 'Streaming',
  }),
  connector({
    type: 'sap',
    name: 'SAP',
    description: 'ERP source family for SAP extraction and HyperAuto-style pipelines.',
    capabilities: ['hyperauto', 'batch_sync'],
    workers: ['foundry', 'agent'],
    available: false,
    category: 'saas_applications',
    credentialFields: [
      { key: 'username', label: 'Username', kind: 'username_password', required: true, secret: false },
      { key: 'password', label: 'Password', kind: 'username_password', required: true, secret: true },
    ],
    network: network(['agent_worker', 'agent_proxy'], [443, 3200, 3300], 'Often deployed through a private-network SAP agent or proxy path.'),
    setupDocsUrl: `${DOC_BASE}/data-connection/sap-overview/`,
    family: 'SaaS',
  }),
];

function categoryFromFamily(family?: ConnectorFamily): ConnectorCategory {
  switch (family) {
    case 'RDBMS':
      return 'databases';
    case 'Storage':
      return 'filesystems_blob_stores';
    case 'Streaming':
      return 'event_streams';
    case 'API':
      return 'rest_apis';
    case 'SaaS':
      return 'saas_applications';
    default:
      return 'generic_connectors';
  }
}

export function connectorCategoryLabel(category: ConnectorCategory): string {
  switch (category) {
    case 'databases':
      return 'Databases';
    case 'filesystems_blob_stores':
      return 'Filesystems & blob stores';
    case 'event_streams':
      return 'Event streams';
    case 'message_queues':
      return 'Message queues';
    case 'rest_apis':
      return 'REST APIs';
    case 'productivity_tools':
      return 'Productivity tools';
    case 'saas_applications':
      return 'SaaS applications';
    case 'geospatial_systems':
      return 'Geospatial systems';
    case 'media_sources':
      return 'Media sources';
    case 'generic_connectors':
      return 'Generic connectors';
  }
}

export function connectorCategoryDescription(category: ConnectorCategory): string {
  switch (category) {
    case 'databases':
      return 'JDBC and warehouse-style systems with table syncs, CDC, exploration, and exports.';
    case 'filesystems_blob_stores':
      return 'Object stores, folders, and file protocols that back file, media, and virtual-table workflows.';
    case 'event_streams':
      return 'Append-oriented topics and streams used by long-running streaming syncs.';
    case 'message_queues':
      return 'Queue systems where messages are consumed, acknowledged, and checkpointed.';
    case 'rest_apis':
      return 'HTTP APIs and webhooks for systems without a table or file protocol.';
    case 'productivity_tools':
      return 'Collaboration and work-management tools such as GitHub, Slack, Jira, and Asana.';
    case 'saas_applications':
      return 'Business applications and cloud warehouses with dedicated connector semantics.';
    case 'geospatial_systems':
      return 'Spatial systems and map services that expose feature layers or geospatial tables.';
    case 'media_sources':
      return 'Unstructured media and binary-object systems that map to media set handoffs.';
    case 'generic_connectors':
      return 'Custom or code-based connectors for systems without a dedicated source type.';
  }
}

export function getConnectorRegistryEntry(entry: ConnectorCatalogEntry): ConnectorCatalogEntry {
  const fallback = FALLBACK_CONNECTOR_CATALOG.find((candidate) => candidate.type === entry.type);
  const capabilities = entry.capabilities ?? fallback?.capabilities ?? [];
  const workers = entry.workers ?? fallback?.workers ?? ['foundry'];
  const workerCapabilities = {
    ...(fallback?.workerCapabilities ?? {}),
    ...(entry.workerCapabilities ?? {}),
  };
  return {
    ...entry,
    capabilities,
    workers,
    workerCapabilities,
    available: entry.available ?? fallback?.available ?? false,
    category: entry.category ?? fallback?.category ?? categoryFromFamily(entry.family ?? fallback?.family),
    credentialFields: entry.credentialFields ?? fallback?.credentialFields ?? [],
    network: entry.network ?? fallback?.network ?? network(['direct_egress'], [443], 'No connector-specific network requirements are registered yet.'),
    setupDocsUrl: entry.setupDocsUrl ?? fallback?.setupDocsUrl ?? `${DOC_BASE}/foundry/data-connection/set-up-source`,
    featureFlags: {
      ...capabilityFlags(capabilities),
      ...(fallback?.featureFlags ?? {}),
      ...(entry.featureFlags ?? {}),
    },
    family: entry.family ?? fallback?.family,
  };
}

export function workerLabel(worker: SourceWorker): string {
  return worker === 'foundry' ? 'OpenFoundry worker' : 'Agent worker';
}

export function capabilitiesForWorker(entry: ConnectorCatalogEntry, worker: SourceWorker): ConnectorCapability[] {
  const registered = getConnectorRegistryEntry(entry);
  if (!registered.workers.includes(worker)) return [];
  return registered.workerCapabilities?.[worker] ?? registered.capabilities;
}

export function unavailableCapabilitiesForWorker(entry: ConnectorCatalogEntry, worker: SourceWorker): ConnectorCapability[] {
  const allowed = new Set(capabilitiesForWorker(entry, worker));
  return getConnectorRegistryEntry(entry).capabilities.filter((capability) => !allowed.has(capability));
}

export interface WorkerCompatibilityResult {
  valid: boolean;
  worker: SourceWorker;
  allowedCapabilities: ConnectorCapability[];
  unavailableCapabilities: ConnectorCapability[];
  reason: string | null;
}

export function validateConnectorWorker(
  entry: ConnectorCatalogEntry,
  worker: SourceWorker,
  capability?: ConnectorCapability,
): WorkerCompatibilityResult {
  const registered = getConnectorRegistryEntry(entry);
  const allowedCapabilities = capabilitiesForWorker(registered, worker);
  const unavailableCapabilities = unavailableCapabilitiesForWorker(registered, worker);
  const supportsWorker = registered.workers.includes(worker);
  const supportsCapability = capability ? allowedCapabilities.includes(capability) : true;
  let reason: string | null = null;
  if (!supportsWorker) {
    reason = `${workerLabel(worker)} is not allowed for ${registered.name}.`;
  } else if (!supportsCapability && capability) {
    reason = `${workerLabel(worker)} cannot configure ${capabilityLabel(capability)} for ${registered.name}.`;
  }
  return { valid: supportsWorker && supportsCapability, worker, allowedCapabilities, unavailableCapabilities, reason };
}








function recordMatchesField(record: Record<string, unknown>, field: SyncResourceSchemaField): boolean {
  const value = record[field.name];
  if (value === undefined || value === null) return field.nullable;
  const type = field.foundry_type.toLowerCase();
  if (type.includes('string') || type.includes('timestamp') || type.includes('date')) return typeof value === 'string';
  if (type.includes('double') || type.includes('float') || type.includes('decimal') || type.includes('integer') || type.includes('long')) return typeof value === 'number' && Number.isFinite(value);
  if (type.includes('boolean')) return typeof value === 'boolean';
  return true;
}

export function validatePushStreamRecords(options: PushStreamValidationOptions): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (!options.datasetRid.trim()) {
    warnings.push({ code: 'missing-stream-dataset-rid', severity: 'error', message: 'Provide the dataset resource identifier for the target stream.' });
  }
  if (!options.branch.trim()) {
    warnings.push({ code: 'missing-stream-branch', severity: 'error', message: 'Provide the stream branch to push into.' });
  }
  if (!options.tokenReferenceId.trim()) {
    warnings.push({ code: 'missing-push-token', severity: 'error', message: 'Provide a token reference for authenticating the push request.' });
  }
  if (options.records.length === 0) {
    warnings.push({ code: 'empty-push-records', severity: 'error', message: 'Push ingestion requires at least one record.' });
  }
  const maxRecords = options.maxRecordsPerRequest ?? 500;
  if (options.records.length > maxRecords) {
    warnings.push({ code: 'too-many-push-records', severity: 'error', message: `Push at most ${maxRecords} records per request.` });
  }
  if (options.rateLimitRemaining !== null && options.rateLimitRemaining !== undefined && options.records.length > options.rateLimitRemaining) {
    warnings.push({ code: 'push-rate-limit-exceeded', severity: 'error', message: 'Record count exceeds the remaining push-ingestion rate limit.' });
  }
  if (options.records.length > 1 && !options.idempotencyKey?.trim()) {
    warnings.push({ code: 'missing-idempotency-key', severity: 'warning', message: 'Provide an idempotency key for retry-safe multi-record push requests when supported.' });
  }
  for (const [index, record] of options.records.entries()) {
    for (const field of options.schema ?? []) {
      if (!recordMatchesField(record, field)) {
        warnings.push({ code: 'record-schema-mismatch', severity: 'error', message: `Record ${index + 1} does not match schema field ${field.name} (${field.foundry_type}).` });
        break;
      }
    }
  }
  return warnings;
}

export function recommendStreamIngestion(options: StreamIngestionRecommendationOptions): StreamIngestionRecommendation {
  if (options.sourceConnectorExists) {
    return { kind: 'streaming_sync', message: 'A source connector exists; prefer a managed streaming sync for offsets, checkpointing, and operations.' };
  }
  if (!options.inboundSystemCanAuthenticate || !options.inboundSystemConformsToSchema) {
    return { kind: 'listener', message: 'Use listeners when inbound systems cannot authenticate to the push API or conform to the target stream schema.' };
  }
  return { kind: 'push_api', message: 'Use authenticated push-based ingestion for event producers that can call REST endpoints with schema-conformant records.' };
}

export function pushStreamEndpointUrl(datasetRid: string, branch: string): string {
  const rid = encodeURIComponent(datasetRid.trim());
  const encodedBranch = encodeURIComponent(branch.trim() || 'master');
  return `${BASE}/streams/by-dataset/${rid}/branches/${encodedBranch}/records`;
}

export function validateRestApiSourceSetup(input: RestApiSourceSetupRequest): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (!input.name.trim()) warnings.push({ code: 'missing-rest-source-name', severity: 'error', message: 'REST API sources require a name.' });
  try {
    const url = new URL(input.base_domain);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    if (url.pathname && url.pathname !== '/') warnings.push({ code: 'base-domain-has-path', severity: 'warning', message: 'REST API source base domains should not include a request path; configure paths on webhooks.' });
  } catch {
    warnings.push({ code: 'invalid-rest-base-domain', severity: 'error', message: 'Provide a valid HTTP(S) base domain for the REST API source.' });
  }
  if (input.auth.kind !== 'none' && !input.auth.credential_reference_id?.trim()) {
    warnings.push({ code: 'missing-rest-auth-reference', severity: 'error', message: 'Select a credential reference for the configured REST API authentication mode.' });
  }
  if (input.auth.kind === 'api_key' && !input.auth.header_name?.trim() && !input.auth.query_param_name?.trim()) {
    warnings.push({ code: 'missing-api-key-location', severity: 'error', message: 'API key auth requires a header name or query parameter name.' });
  }
  return warnings;
}


function valueAtPath(value: unknown, path: Array<string | number> = []): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function jsonPathSegments(path: string): Array<string | number> {
  return path.replace(/^\$?\.?/, '').split(/[./]/).filter(Boolean).map((segment) => /^\d+$/.test(segment) ? Number(segment) : segment);
}

function webhookValueMatchesType(value: unknown, parameter: WebhookParameterMetadata): boolean {
  if (value === undefined || value === null) return !parameter.required || parameter.type === 'optional';
  switch (parameter.type) {
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
    case 'long': return typeof value === 'number' && Number.isInteger(value);
    case 'double': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string' && (!parameter.allowed_values?.length || parameter.allowed_values.includes(value));
    case 'date': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'timestamp': return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'attachment': return typeof value === 'object';
    case 'list': return Array.isArray(value) && value.every((item) => !parameter.item_type || webhookValueMatchesType(item, { ...parameter.item_type, required: true }));
    case 'record': return typeof value === 'object' && !Array.isArray(value) && (parameter.fields ?? []).every((field) => webhookValueMatchesType((value as Record<string, unknown>)[field.name], field));
    case 'optional': return !parameter.inner_type || webhookValueMatchesType(value, { ...parameter.inner_type, required: false });
  }
}

export function validateWebhookParameters(input: Pick<CreateWebhookRequest, 'input_parameters' | 'output_parameters'>, options: { worker?: SourceWorker } = {}): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  const names = new Set<string>();
  for (const parameter of input.input_parameters ?? []) {
    if (!parameter.name.trim()) warnings.push({ code: 'missing-webhook-input-name', severity: 'error', message: 'Webhook input parameters require a name.' });
    if (names.has(parameter.name)) warnings.push({ code: 'duplicate-webhook-input-name', severity: 'error', message: `Input parameter ${parameter.name} is duplicated.` });
    names.add(parameter.name);
    if (parameter.type === 'attachment' && options.worker === 'agent') warnings.push({ code: 'agent-attachment-input', severity: 'error', message: 'Attachment webhook inputs are not supported for agent worker sources.' });
    if (parameter.type === 'list' && !parameter.item_type) warnings.push({ code: 'missing-list-item-type', severity: 'error', message: `List input ${parameter.name} requires item type metadata.` });
    if (parameter.type === 'record' && !(parameter.fields?.length)) warnings.push({ code: 'missing-record-fields', severity: 'warning', message: `Record input ${parameter.name} should define expected field metadata.` });
    if (parameter.type === 'optional' && !parameter.inner_type) warnings.push({ code: 'missing-optional-inner-type', severity: 'error', message: `Optional input ${parameter.name} requires inner type metadata.` });
  }
  const outputNames = new Set<string>();
  for (const output of input.output_parameters ?? []) {
    if (!output.name.trim()) warnings.push({ code: 'missing-webhook-output-name', severity: 'error', message: 'Webhook output parameters require a name.' });
    if (outputNames.has(output.name)) warnings.push({ code: 'duplicate-webhook-output-name', severity: 'error', message: `Output parameter ${output.name} is duplicated.` });
    outputNames.add(output.name);
    if (output.extractor.kind === 'key_path' && !(output.extractor.key_path?.length)) warnings.push({ code: 'missing-output-key-path', severity: 'error', message: `Output ${output.name} requires a key path.` });
    if (output.extractor.kind === 'array_index' && !(output.extractor.array_index_path?.length)) warnings.push({ code: 'missing-output-array-index', severity: 'error', message: `Output ${output.name} requires an array index path.` });
    if (output.extractor.kind === 'json_path' && !output.extractor.json_path?.trim()) warnings.push({ code: 'missing-output-json-path', severity: 'error', message: `Output ${output.name} requires a JSON path.` });
  }
  return warnings;
}

export function mapWebhookInputs(parameters: WebhookParameterMetadata[], mappings: WebhookInputParameterMapping[], actionOrFunctionParams: Record<string, unknown>): WebhookInputMappingResult {
  const inputs: Record<string, unknown> = {};
  for (const parameter of parameters) {
    const mapping = mappings.find((candidate) => candidate.parameter_name === parameter.name);
    const value = mapping?.source === 'literal'
      ? mapping.value
      : valueAtPath(actionOrFunctionParams, mapping?.source_path ?? [parameter.name]);
    if (value === undefined && mapping?.skip_when_undefined) {
      return { should_invoke: false, inputs: {}, skipped_reason: `Mapping for ${parameter.name} returned undefined.` };
    }
    if (!webhookValueMatchesType(value, parameter)) {
      return { should_invoke: false, inputs: {}, skipped_reason: `Input ${parameter.name} does not match ${parameter.type} metadata.` };
    }
    if (value !== undefined) inputs[parameter.name] = value;
  }
  return { should_invoke: true, inputs, skipped_reason: null };
}

export function extractWebhookOutputs(parameters: WebhookOutputParameterMetadata[], response: WebhookResponseForExtraction): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  const text = response.text ?? (typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
  for (const parameter of parameters) {
    switch (parameter.extractor.kind) {
      case 'whole_response':
      case 'full_response_string':
        outputs[parameter.name] = text;
        break;
      case 'http_status':
        outputs[parameter.name] = response.status;
        break;
      case 'key_path':
        outputs[parameter.name] = valueAtPath(response.body, parameter.extractor.key_path ?? []);
        break;
      case 'array_index':
        outputs[parameter.name] = valueAtPath(response.body, parameter.extractor.array_index_path ?? []);
        break;
      case 'json_path':
        outputs[parameter.name] = valueAtPath(response.body, jsonPathSegments(parameter.extractor.json_path ?? ''));
        break;
    }
  }
  return outputs;
}

export function redactWebhookMetadata(metadata: WebhookInvocationRedactedMetadata, limitBytes = 4096): WebhookInvocationRedactedMetadata {
  const secretPattern = /authorization|token|secret|api[-_]?key|password|cookie/i;
  const headers = Object.fromEntries(Object.entries(metadata.headers ?? {}).map(([key, value]) => [key, secretPattern.test(key) ? '[REDACTED]' : value]));
  const query_params = Object.fromEntries(Object.entries(metadata.query_params ?? {}).map(([key, value]) => [key, secretPattern.test(key) ? '[REDACTED]' : value]));
  const body = metadata.body_preview ?? null;
  const body_bytes = body ? new TextEncoder().encode(body).length : metadata.body_bytes;
  const truncated = Boolean(body && body_bytes !== undefined && body_bytes > limitBytes);
  return {
    ...metadata,
    headers,
    query_params,
    body_preview: body && truncated ? `${body.slice(0, limitBytes)}…` : body,
    body_bytes,
    truncated: metadata.truncated || truncated,
  };
}

export function retainWebhookInvocations(records: WebhookInvocationRecord[], nowIso: string, retentionDays = 183): WebhookInvocationRecord[] {
  const now = Date.parse(nowIso);
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return records.filter((record) => now - Date.parse(record.invoked_at) <= retentionMs).map((record) => ({
    ...record,
    request: redactWebhookMetadata(record.request),
    response: redactWebhookMetadata(record.response),
    retained_until: record.retained_until ?? new Date(Date.parse(record.invoked_at) + retentionMs).toISOString(),
  }));
}

export function validateWebhookSetup(input: CreateWebhookRequest): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (!input.name.trim()) warnings.push({ code: 'missing-webhook-name', severity: 'error', message: 'Webhooks require a name.' });
  if (!input.relative_path.trim().startsWith('/')) warnings.push({ code: 'invalid-webhook-path', severity: 'error', message: 'Webhook relative paths must start with /.' });
  if (input.timeout_ms < 1000 || input.timeout_ms > 120000) warnings.push({ code: 'invalid-webhook-timeout', severity: 'error', message: 'Webhook timeout must be between 1,000 and 120,000 ms.' });
  if (input.retry.max_attempts < 1 || input.retry.max_attempts > 10) warnings.push({ code: 'invalid-webhook-retries', severity: 'error', message: 'Webhook retry attempts must be between 1 and 10.' });
  const seenHeaders = new Set<string>();
  for (const header of input.headers) {
    const key = header.name.trim().toLowerCase();
    if (!key) warnings.push({ code: 'missing-webhook-header-name', severity: 'error', message: 'Webhook header names cannot be blank.' });
    if (seenHeaders.has(key)) warnings.push({ code: 'duplicate-webhook-header', severity: 'warning', message: `Header ${header.name} is configured more than once.` });
    seenHeaders.add(key);
  }
  if ((input.method === 'GET' || input.method === 'DELETE') && input.body_template?.trim()) {
    warnings.push({ code: 'body-on-read-webhook', severity: 'warning', message: 'GET/DELETE webhooks usually should not include a body template.' });
  }
  warnings.push(...validateWebhookParameters(input));
  return warnings;
}

export function latestCompletedCheckpoint(checkpoints: StreamCheckpointSummary[]): StreamCheckpointSummary | null {
  const completed = checkpoints.filter((checkpoint) => checkpoint.status === 'completed');
  completed.sort((a, b) => Date.parse(b.completed_at ?? b.created_at) - Date.parse(a.completed_at ?? a.created_at));
  return completed[0] ?? null;
}

export function restartPlanForStream(stream: Pick<DataConnectionStreamResource, 'checkpoints'>): StreamRestartPlan {
  const checkpoint = latestCompletedCheckpoint(stream.checkpoints);
  if (!checkpoint) {
    return { can_restart: false, latest_completed_checkpoint_id: null, restart_from_source_location: null, reason: 'No completed checkpoint is available.' };
  }
  return {
    can_restart: true,
    latest_completed_checkpoint_id: checkpoint.id,
    restart_from_source_location: checkpoint.last_processed_source_location ?? null,
    reason: null,
  };
}

export function evaluateStreamingConsistency(options: {
  requested: 'AT_LEAST_ONCE' | 'EXACTLY_ONCE';
  runtime: StreamingRuntimeKind;
  sourceSupportsExactlyOnce: boolean;
  sinkSupportsExactlyOnce: boolean;
}): StreamConsistencySupport {
  const canExactlyOnce = options.runtime !== 'agent_runtime' && options.sourceSupportsExactlyOnce && options.sinkSupportsExactlyOnce;
  if (options.requested === 'EXACTLY_ONCE' && !canExactlyOnce) {
    return {
      requested: options.requested,
      effective: 'AT_LEAST_ONCE',
      runtime: options.runtime,
      source_supports_exactly_once: options.sourceSupportsExactlyOnce,
      sink_supports_exactly_once: options.sinkSupportsExactlyOnce,
      downgraded: true,
      duplicate_tolerant_consumers_required: true,
      reason: 'Exactly-once was downgraded because the selected runtime/source/sink combination cannot guarantee it.',
    };
  }
  return {
    requested: options.requested,
    effective: options.requested,
    runtime: options.runtime,
    source_supports_exactly_once: options.sourceSupportsExactlyOnce,
    sink_supports_exactly_once: options.sinkSupportsExactlyOnce,
    downgraded: false,
    duplicate_tolerant_consumers_required: options.requested === 'AT_LEAST_ONCE',
    reason: options.requested === 'AT_LEAST_ONCE' ? 'Consumers must tolerate duplicate records in at-least-once mode.' : null,
  };
}

export function streamingSyncCanStart(status: StreamingSyncStatus): boolean {
  return ['draft', 'stopped', 'failed'].includes(status);
}

export function streamingSyncCanStop(status: StreamingSyncStatus): boolean {
  return ['starting', 'running'].includes(status);
}

export function validateStreamingSyncSetup(input: CreateStreamingSyncRequest): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (!input.source_topic.trim()) {
    warnings.push({ code: 'missing-streaming-topic', severity: 'error', message: 'Source topic, queue, or stream is required.' });
  }
  if (!input.output_stream_location.trim() && !input.output_stream_id?.trim()) {
    warnings.push({ code: 'missing-output-stream', severity: 'error', message: 'Output stream location or stream id is required.' });
  }
  if (input.checkpoint_interval_ms < 1000) {
    warnings.push({ code: 'checkpoint-too-frequent', severity: 'warning', message: 'Checkpoint intervals below one second can overwhelm stream storage.' });
  }
  if (input.consistency_guarantee === 'EXACTLY_ONCE' && (input.key_fields ?? []).length === 0) {
    warnings.push({ code: 'exactly-once-without-key', severity: 'warning', message: 'Exactly-once streaming syncs should define key fields for deterministic deduplication.' });
  }
  if (input.consistency_guarantee === 'AT_LEAST_ONCE') {
    warnings.push({ code: 'at-least-once-duplicates', severity: 'warning', message: 'At-least-once mode requires duplicate-tolerant consumers.' });
  }
  return warnings;
}

export function streamArchivePolicyLabel(policy?: StreamArchivePolicy | null): string {
  if (!policy?.enabled) return 'Archiving disabled';
  const cadence = policy.cadence_ms === null ? 'manual cadence' : `${policy.cadence_ms}ms cadence`;
  return `${cadence} → ${policy.archive_dataset_id ?? 'archive dataset pending'}`;
}

export function streamHybridReadLabel(read?: StreamHybridReadMetadata | null): string {
  if (!read) return 'Hybrid reads not configured';
  return `${read.hot_rows} hot + ${read.cold_rows} cold rows (${read.from_offset ?? 'earliest'} → ${read.to_offset ?? 'latest'})`;
}

export function syncRunStatusLabel(status: SyncRunStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'aborted':
      return 'Aborted';
    case 'retrying':
      return 'Retrying';
    case 'ignored':
      return 'Ignored';
    case 'partially_succeeded':
      return 'Partially succeeded';
  }
}

export function syncRunIsTerminal(status: SyncRunStatus): boolean {
  return ['succeeded', 'failed', 'cancelled', 'aborted', 'ignored', 'partially_succeeded'].includes(status);
}

export function syncRunDurationMs(run: Pick<SyncRun, 'started_at' | 'finished_at' | 'duration_ms'>): number | null {
  if (run.duration_ms !== undefined && run.duration_ms !== null) return run.duration_ms;
  if (!run.started_at || !run.finished_at) return null;
  const started = Date.parse(run.started_at);
  const finished = Date.parse(run.finished_at);
  return Number.isFinite(started) && Number.isFinite(finished) && finished >= started ? finished - started : null;
}

export function buildHistoryHref(build?: SyncRunBuildLink | null): string | null {
  if (!build?.build_id) return null;
  return build.build_url ?? `/builds/${encodeURIComponent(build.build_id)}${build.job_id ? `/jobs/${encodeURIComponent(build.job_id)}` : ''}`;
}

export function streamStorageLabel(source: StreamStorageSource): string {
  switch (source) {
    case 'hot':
      return 'Hot buffer';
    case 'cold':
      return 'Cold/archive dataset';
    case 'hybrid':
      return 'Hybrid hot+cold';
  }
}

export function streamReplayRangeLabel(replay: StreamReplayMetadata | null): string {
  if (!replay || replay.status === 'disabled') return 'Replay disabled';
  const start = replay.from_offset ?? 'earliest';
  const end = replay.to_offset ?? 'latest';
  return `${replay.status}: ${start} → ${end}`;
}

function cdcPayloadValue(row: StreamLiveRow, column: string): unknown {
  return row.payload?.[column];
}

function cdcValueKey(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function cdcOrderingNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
    const timestamp = Date.parse(value.trim());
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function compareCdcOrderingValues(left: unknown, right: unknown): number {
  const leftNumber = cdcOrderingNumber(left);
  const rightNumber = cdcOrderingNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  return cdcValueKey(left).localeCompare(cdcValueKey(right), undefined, { numeric: true });
}

function cdcDeleteMarkerIsTrue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', 't', '1', 'yes', 'y', 'deleted', 'delete'].includes(value.trim().toLowerCase());
  return false;
}

export function cdcPrimaryKeyForRow(row: StreamLiveRow, primaryKeyColumns: string[]): string {
  return primaryKeyColumns.map((column) => `${column}=${cdcValueKey(cdcPayloadValue(row, column))}`).join('|');
}

export function cdcSchemaFieldResolutionRole(fieldName: string, metadata?: CdcSyncSettings | null): string | null {
  if (!metadata) return null;
  const normalized = fieldName.trim().toLowerCase();
  const roles: string[] = [];
  if (metadata.primary_key_columns.some((column) => column.trim().toLowerCase() === normalized)) roles.push('primary key');
  if (metadata.ordering_column.trim().toLowerCase() === normalized) roles.push('ordering column');
  if ((metadata.deletion_column ?? '').trim().toLowerCase() === normalized) roles.push('deletion marker');
  return roles.length > 0 ? roles.join(', ') : null;
}

export function cdcResolutionStrategyLabel(metadata?: CdcSyncSettings | null): string {
  if (!metadata) return 'No CDC primary key resolution strategy';
  const primaryKeys = metadata.primary_key_columns.length > 0 ? metadata.primary_key_columns.join(', ') : 'unconfigured primary key';
  const ordering = metadata.ordering_column || 'unconfigured ordering column';
  const deletion = metadata.deletion_column ? `; remove rows where ${metadata.deletion_column} is true` : '; no deletion marker configured';
  return `Group by ${primaryKeys}; choose the largest ${ordering}${deletion}.`;
}

export function cdcRequiredMetadataColumns(metadata: CdcSyncSettings): string[] {
  return Array.from(new Set([
    ...metadata.primary_key_columns,
    metadata.ordering_column,
    metadata.deletion_column ?? '',
  ].map((column) => column.trim()).filter(Boolean)));
}

export function cdcOrderingSemanticsWarning(metadata: CdcSyncSettings): SyncValidationWarning | null {
  const props = metadata.connector_metadata?.properties ?? {};
  const hasManualBackfillFlag = ['manual_backfill', 'manually_backfilled', 'backfill', 'custom_changelog', 'custom_stream', 'requires_reorder']
    .some((key) => props[key] === true || props[key] === 'true' || props[key] === 'yes');
  const isCustomOrBackfilled = metadata.input_kind === 'streaming_middleware_changelog'
    || metadata.start_position !== 'initial_snapshot'
    || hasManualBackfillFlag;
  if (!isCustomOrBackfilled) return null;
  return {
    code: 'cdc-ordering-preservation-before-object-indexing',
    severity: 'warning',
    message: 'Custom or manually backfilled CDC streams must preserve ordering semantics before object indexing; reorder or replay records so arrival order matches the configured ordering column.',
  };
}

function cdcSurfaceLabel(surface: CdcDownstreamSurface): string {
  switch (surface) {
    case 'pipeline_builder':
      return 'Pipeline Builder';
    case 'ontology_indexing':
      return 'Ontology indexing';
    case 'stream_processing':
      return 'Stream processing';
    case 'archive_view':
      return 'Archive view';
    case 'data_health':
      return 'Data Health';
  }
}

function cdcDataHealthChecks(metadata: CdcSyncSettings): CdcDataHealthCheckDefinition[] {
  const primaryKeys = metadata.primary_key_columns;
  const required = cdcRequiredMetadataColumns(metadata);
  const checks: CdcDataHealthCheckDefinition[] = [
    { code: 'cdc-required-metadata-present', label: 'Required CDC metadata columns are present', severity: 'critical', columns: required },
    { code: 'cdc-primary-key-not-null', label: 'Primary key columns are not null', severity: 'critical', columns: primaryKeys },
    { code: 'cdc-ordering-not-null', label: 'Ordering column is not null and comparable', severity: 'critical', columns: [metadata.ordering_column] },
    { code: 'cdc-archive-resolution-fresh', label: 'Archive/current-state resolution remains fresh', severity: 'warning', columns: required },
  ];
  if (metadata.deletion_column) {
    checks.push({ code: 'cdc-deletion-marker-boolean', label: 'Deletion marker is boolean-shaped', severity: 'warning', columns: [metadata.deletion_column] });
  }
  return checks;
}

function cdcRequiredColumnsMissing(stream: Pick<DataConnectionStreamResource, 'schema'>, metadata: CdcSyncSettings): string[] {
  const schemaNames = new Set(stream.schema.map((field) => field.name.trim().toLowerCase()).filter(Boolean));
  return cdcRequiredMetadataColumns(metadata).filter((column) => !schemaNames.has(column.trim().toLowerCase()));
}

export function cdcDownstreamIntegrationMetadata(
  stream: Pick<DataConnectionStreamResource, 'id' | 'name' | 'schema' | 'cdc_metadata' | 'live_view' | 'archive_view'>,
): CdcDownstreamIntegrationMetadata | null {
  const metadata = stream.cdc_metadata ?? null;
  if (!metadata) return null;
  const requiredColumns = cdcRequiredMetadataColumns(metadata);
  const missingColumns = cdcRequiredColumnsMissing(stream, metadata);
  const missingColumnWarnings = missingColumns.map((column): SyncValidationWarning => ({
    code: 'cdc-required-column-missing',
    severity: 'error',
    message: `CDC metadata column ${column} is missing from the stream schema.`,
  }));
  const orderingWarning = cdcOrderingSemanticsWarning(metadata);
  const baseWarnings = [...missingColumnWarnings, ...(orderingWarning ? [orderingWarning] : [])];
  const archiveResolution = resolveCdcArchiveView(stream);
  const source = metadata.source_table || metadata.source_topic || metadata.connector_metadata.source_table || metadata.connector_metadata.upstream_topic || 'CDC stream';
  const outputStreamID = metadata.output_stream_id ?? metadata.connector_metadata.output_stream_id ?? null;
  const columnStatus: CdcDownstreamIntegrationStatus = missingColumns.length > 0 ? 'blocked' : 'ready';
  const ontologyStatus: CdcDownstreamIntegrationStatus = missingColumns.length > 0 ? 'blocked' : orderingWarning ? 'warning' : 'ready';
  const targets: CdcDownstreamIntegrationTarget[] = [
    {
      surface: 'pipeline_builder',
      label: cdcSurfaceLabel('pipeline_builder'),
      status: columnStatus,
      required_columns: requiredColumns,
      metadata: {
        key_by: {
          primary_key_columns: metadata.primary_key_columns,
          ordering_column: metadata.ordering_column,
          deletion_column: metadata.deletion_column ?? null,
        },
        propagation_rule: 'Preserve primary key, ordering, and deletion columns unchanged to propagate CDC metadata to outputs.',
        input_stream_id: outputStreamID,
      },
      warnings: missingColumnWarnings,
    },
    {
      surface: 'ontology_indexing',
      label: cdcSurfaceLabel('ontology_indexing'),
      status: ontologyStatus,
      required_columns: requiredColumns,
      metadata: {
        object_storage_resolution: 'arrival_order',
        configured_archive_resolution: 'ordering_column',
        ordering_column: metadata.ordering_column,
        primary_key_columns: metadata.primary_key_columns,
      },
      warnings: [...missingColumnWarnings, ...(orderingWarning ? [orderingWarning] : [])],
    },
    {
      surface: 'stream_processing',
      label: cdcSurfaceLabel('stream_processing'),
      status: columnStatus,
      required_columns: requiredColumns,
      metadata: {
        state_key_columns: metadata.primary_key_columns,
        ordering_column: metadata.ordering_column,
        deletion_column: metadata.deletion_column ?? null,
        source_start_position: metadata.start_position,
      },
      warnings: missingColumnWarnings,
    },
    {
      surface: 'archive_view',
      label: cdcSurfaceLabel('archive_view'),
      status: columnStatus,
      required_columns: requiredColumns,
      metadata: {
        resolution_strategy: cdcResolutionStrategyLabel(metadata),
        current_state_rows: archiveResolution.archive_rows.length,
        deleted_latest_rows: archiveResolution.deleted_rows.length,
        uses_backend_archive_view: archiveResolution.used_backend_archive,
      },
      warnings: [...missingColumnWarnings, ...archiveResolution.warnings],
    },
    {
      surface: 'data_health',
      label: cdcSurfaceLabel('data_health'),
      status: missingColumns.length > 0 ? 'blocked' : 'warning',
      required_columns: requiredColumns,
      metadata: {
        monitored_columns: requiredColumns,
        output_stream_id: outputStreamID,
      },
      warnings: baseWarnings,
      recommended_checks: cdcDataHealthChecks(metadata),
    },
  ];
  return {
    stream_id: stream.id,
    stream_name: stream.name,
    source,
    output_stream_id: outputStreamID,
    primary_key_columns: metadata.primary_key_columns,
    ordering_column: metadata.ordering_column,
    deletion_column: metadata.deletion_column ?? null,
    required_metadata_columns: requiredColumns,
    propagated_metadata_columns: requiredColumns,
    resolution_strategy: cdcResolutionStrategyLabel(metadata),
    targets,
    warnings: baseWarnings,
  };
}

export function resolveCdcArchiveView(stream: Pick<DataConnectionStreamResource, 'cdc_metadata' | 'live_view' | 'archive_view'>): CdcResolvedArchiveView {
  const metadata = stream.cdc_metadata ?? null;
  const liveRows = [...(stream.live_view ?? [])].sort((left, right) => left.offset - right.offset);
  const backendArchiveRows = [...(stream.archive_view ?? [])].sort((left, right) => left.offset - right.offset);
  const warnings: SyncValidationWarning[] = [];
  if (!metadata) {
    return {
      live_rows: liveRows,
      archive_rows: backendArchiveRows,
      deleted_rows: [],
      primary_key_columns: [],
      ordering_column: null,
      deletion_column: null,
      resolution_strategy: cdcResolutionStrategyLabel(null),
      used_backend_archive: backendArchiveRows.length > 0,
      warnings,
    };
  }
  if (liveRows.length === 0 && backendArchiveRows.length > 0) {
    warnings.push({ code: 'cdc-archive-backend-view', severity: 'warning', message: 'Live changelog rows are not loaded, so the backend-provided archive view is displayed.' });
    return {
      live_rows: liveRows,
      archive_rows: backendArchiveRows,
      deleted_rows: [],
      primary_key_columns: metadata.primary_key_columns,
      ordering_column: metadata.ordering_column,
      deletion_column: metadata.deletion_column ?? null,
      resolution_strategy: cdcResolutionStrategyLabel(metadata),
      used_backend_archive: true,
      warnings,
    };
  }

  const latestByPrimaryKey = new Map<string, StreamLiveRow>();
  for (const row of liveRows) {
    const key = cdcPrimaryKeyForRow(row, metadata.primary_key_columns);
    const current = latestByPrimaryKey.get(key);
    if (!current) {
      latestByPrimaryKey.set(key, row);
      continue;
    }
    const orderingComparison = compareCdcOrderingValues(cdcPayloadValue(row, metadata.ordering_column), cdcPayloadValue(current, metadata.ordering_column));
    if (orderingComparison > 0 || (orderingComparison === 0 && row.offset > current.offset)) {
      latestByPrimaryKey.set(key, row);
    }
  }

  const sortedLatest = [...latestByPrimaryKey.values()].sort((left, right) =>
    cdcPrimaryKeyForRow(left, metadata.primary_key_columns).localeCompare(cdcPrimaryKeyForRow(right, metadata.primary_key_columns), undefined, { numeric: true }),
  );
  const deletedRows = metadata.deletion_column
    ? sortedLatest.filter((row) => cdcDeleteMarkerIsTrue(cdcPayloadValue(row, metadata.deletion_column ?? '')))
    : [];
  const deletedOffsets = new Set(deletedRows.map((row) => row.offset));

  return {
    live_rows: liveRows,
    archive_rows: sortedLatest.filter((row) => !deletedOffsets.has(row.offset)),
    deleted_rows: deletedRows,
    primary_key_columns: metadata.primary_key_columns,
    ordering_column: metadata.ordering_column,
    deletion_column: metadata.deletion_column ?? null,
    resolution_strategy: cdcResolutionStrategyLabel(metadata),
    used_backend_archive: false,
    warnings,
  };
}

export function datasetTransactionTypeForFileMode(mode: FileSyncMode): DatasetTransactionType {
  switch (mode) {
    case 'snapshot_mirror':
    case 'historical_snapshot_incremental':
      return 'SNAPSHOT';
    case 'incremental_append':
      return 'APPEND';
  }
}

export function datasetTransactionTypeForTableMode(mode: TableBatchSyncMode): DatasetTransactionType {
  return mode === 'full_snapshot' ? 'SNAPSHOT' : 'APPEND';
}

export function fileSyncModeLabel(mode: FileSyncMode): string {
  switch (mode) {
    case 'snapshot_mirror':
      return 'Snapshot mirror';
    case 'incremental_append':
      return 'Incremental append';
    case 'historical_snapshot_incremental':
      return 'Historical snapshot + incremental recent files';
  }
}

export function tableBatchSyncModeLabel(mode: TableBatchSyncMode): string {
  return mode === 'full_snapshot' ? 'Full snapshot' : 'Incremental';
}

export function dataExportTypeLabel(type: DataExportType): string {
  switch (type) {
    case 'file':
      return 'File export';
    case 'table':
      return 'Table export';
    case 'streaming':
      return 'Streaming export';
  }
}

export function dataExportModeLabel(mode: DataExportMode): string {
  switch (mode) {
    case 'snapshot':
      return 'Snapshot';
    case 'incremental':
      return 'Incremental';
    case 'mirror':
      return 'Mirror dataset';
    case 'full_snapshot':
      return 'Full snapshot without truncation';
    case 'full_snapshot_truncate':
      return 'Full snapshot with truncation';
    case 'incremental_truncate':
      return 'Incremental with truncation';
    case 'incremental_append_only':
      return 'Incremental append only';
    case 'continuous':
      return 'Continuous';
  }
}

export function sourceCodeImportRepositoryDisplay(repo: SourceCodeRepositoryImport): string {
  return repo.rendered_display || repo.repository_name || repo.repository_rid || 'Unnamed repository import';
}

export function sourcePermissionRoleLabel(role: SourcePermissionRole): string {
  switch (role) {
    case 'source_view':
      return 'Source view';
    case 'source_edit':
      return 'Source edit';
    case 'source_use':
      return 'Source use';
    case 'source_owner':
      return 'Source owner';
    case 'webhook_execute':
      return 'Webhook execution';
    case 'sync_create':
      return 'Sync creation';
    case 'export_create':
      return 'Export creation';
    case 'code_import':
      return 'Code import';
  }
}

export function sourceGovernanceCan(governance: Pick<SourceGovernance, 'effective_roles' | 'role_definitions'> | null | undefined, role: SourcePermissionRole): boolean {
  if (!governance) return false;
  const granted = new Set<SourcePermissionRole>(governance.effective_roles ?? []);
  if (granted.has(role)) return true;
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of governance.role_definitions ?? []) {
      if (!granted.has(definition.role)) continue;
      for (const implied of definition.implied_roles ?? []) {
        if (!granted.has(implied)) {
          granted.add(implied);
          changed = true;
        }
      }
    }
  }
  return granted.has(role);
}

export function sourceGovernanceVisibilitySummary(governance: Pick<SourceGovernance, 'visibility'> | null | undefined): string[] {
  if (!governance) return [];
  const visibility = governance.visibility;
  return [
    `Source metadata: ${(visibility.source_visibility_roles ?? []).map(sourcePermissionRoleLabel).join(', ') || 'none'}`,
    `Credential metadata: ${(visibility.credential_visibility_roles ?? []).map(sourcePermissionRoleLabel).join(', ') || 'none'}`,
    `External samples: ${(visibility.external_sample_visibility_roles ?? []).map(sourcePermissionRoleLabel).join(', ') || 'none'}`,
    `Output datasets: ${visibility.output_dataset_permissions_enforced ? 'checked separately' : 'not enforced'} via ${visibility.output_dataset_permission_system || 'dataset-service'}`,
    visibility.credential_values_visible ? 'Credential secret values visible' : 'Credential secret values remain write-only',
    visibility.external_samples_persisted ? 'External samples may be persisted' : 'External samples are not persisted by default',
  ];
}

export function sourceGovernanceGrantSummary(grant: SourcePermissionGrant): string {
  const principal = grant.principal_name || grant.principal_id;
  const roles = (grant.roles ?? []).map(sourcePermissionRoleLabel).join(', ') || 'no roles';
  const expiry = grant.expires_at ? ` · expires ${grant.expires_at}` : '';
  return `${principal} (${grant.principal_type}) · ${roles}${expiry}`;
}

export function sourceGovernanceAuditLabel(event: SourceGovernanceAuditEvent): string {
  const actor = event.actor_id ? ` by ${event.actor_id}` : '';
  const target = event.downstream_resource_rid || event.job_rid || event.principal_id || '';
  const targetText = target ? ` · ${target}` : '';
  return `${event.action || event.event_type}${actor}${targetText} · ${event.result}`;
}

export function connectorAgentCapabilitySummary(agent: ConnectorAgent): string[] {
  const explicit = agent.supported_connector_capabilities ?? [];
  if (explicit.length > 0) {
    return explicit.map((entry) => `${entry.connector_type}: ${entry.capabilities.join(', ') || 'registered'}`);
  }
  const connectors = Array.isArray(agent.capabilities?.connectors) ? agent.capabilities.connectors.map(String) : [];
  if (connectors.length > 0) {
    return connectors.map((connector) => `${connector}: registered`);
  }
  return [];
}

export function connectorAgentHealthLabel(agent: ConnectorAgent): string {
  const health = agent.health;
  const bits = [health?.state || agent.status || 'unknown'];
  if (agent.version) bits.push(`v${agent.version}`);
  if (agent.environment) bits.push(agent.environment);
  if (health?.failure_count) bits.push(`${health.failure_count} failure${health.failure_count === 1 ? '' : 's'}`);
  if (health?.stale) bits.push('stale heartbeat');
  return bits.join(' · ');
}

export function connectorAgentsForSource(agents: ConnectorAgent[], sourceId: string, policyIds: string[] = []): ConnectorAgent[] {
  const policySet = new Set(policyIds);
  return agents.filter((agent) => {
    const sourceMatch = (agent.connected_sources ?? []).some((source) => source.source_id === sourceId);
    const policyMatch = (agent.assigned_proxy_policies ?? []).some((policy) => policy.source_id === sourceId || (policy.policy_id && policySet.has(policy.policy_id)));
    return sourceMatch || policyMatch;
  });
}

export function connectorAgentFailuresForSource(agent: ConnectorAgent, sourceId: string, policyIds: string[] = []): AgentConnectionFailure[] {
  const policySet = new Set(policyIds);
  return (agent.connection_failures ?? []).filter((failure) => failure.source_id === sourceId || (failure.policy_id && policySet.has(failure.policy_id)));
}

export function dataConnectionHealthStateLabel(state: DataConnectionHealthState): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'warning':
      return 'Warning';
    case 'critical':
      return 'Critical';
    case 'unknown':
      return 'Unknown';
  }
}

export function dataConnectionHealthSurfaceLabel(surface: DataConnectionHealthSurface): string {
  switch (surface) {
    case 'source':
      return 'Source';
    case 'agent':
      return 'Agent';
    case 'credential':
      return 'Credential';
    case 'network_policy':
      return 'Network policy';
    case 'sync':
      return 'Sync';
    case 'stream':
      return 'Stream';
    case 'export':
      return 'Export';
    case 'webhook':
      return 'Webhook';
    case 'cdc':
      return 'CDC';
    case 'virtual_table':
      return 'Virtual table';
    case 'schedule':
      return 'Schedule';
    case 'retry':
      return 'Retry';
  }
}

function healthStateRank(state: DataConnectionHealthState): number {
  switch (state) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'unknown':
      return 1;
    case 'ok':
      return 0;
  }
}

function healthStateForChecks(checks: DataConnectionHealthCheck[]): DataConnectionHealthState {
  return checks.reduce<DataConnectionHealthState>((state, check) => (
    healthStateRank(check.state) > healthStateRank(state) ? check.state : state
  ), 'ok');
}

export function dataConnectionHealthCounts(checks: DataConnectionHealthCheck[]): DataConnectionHealthCounts {
  return checks.reduce<DataConnectionHealthCounts>((counts, check) => {
    counts[check.state] += 1;
    return counts;
  }, { ok: 0, warning: 0, critical: 0, unknown: 0 });
}

export function dataConnectionActionableHealthChecks(summary: Pick<DataConnectionHealthSummary, 'checks'>): DataConnectionHealthCheck[] {
  return [...summary.checks]
    .filter((check) => check.state !== 'ok')
    .sort((left, right) => healthStateRank(right.state) - healthStateRank(left.state) || left.surface.localeCompare(right.surface) || left.code.localeCompare(right.code));
}

export function dataConnectionStreamHealthChecks(streams: DataConnectionStreamResource[], checkedAt?: string): DataConnectionHealthCheck[] {
  if (streams.length === 0) {
    return [{
      code: 'streams_not_loaded',
      label: 'Stream resources',
      surface: 'stream',
      severity: 'info',
      state: 'ok',
      message: 'No linked streams are loaded for this source.',
      last_observed_at: checkedAt ?? null,
      metadata: { client_generated_stream_check: true },
    }];
  }
  return streams.flatMap((stream) => {
    const checks: DataConnectionHealthCheck[] = [];
    const healthState = stream.health?.state;
    if (healthState && ['error', 'failed'].includes(healthState)) {
      checks.push({
        code: 'stream_health_error',
        label: 'Stream health',
        surface: 'stream',
        severity: 'critical',
        state: 'critical',
        message: stream.health.message || 'Stream health is reporting an error.',
        resource_id: stream.id,
        resource_rid: stream.rid ?? stream.id,
        resource_name: stream.name,
        recommendation: 'Inspect stream offsets, checkpoints, and source sync history before restarting consumers.',
        last_observed_at: stream.health.last_checked_at ?? checkedAt ?? null,
        metadata: { client_generated_stream_check: true, health_state: healthState },
      });
    } else if (healthState && ['warning', 'stale'].includes(healthState)) {
      checks.push({
        code: 'stream_health_warning',
        label: 'Stream health',
        surface: 'stream',
        severity: 'warning',
        state: 'warning',
        message: stream.health.message || 'Stream health is reporting a warning.',
        resource_id: stream.id,
        resource_rid: stream.rid ?? stream.id,
        resource_name: stream.name,
        recommendation: 'Inspect recent checkpoints and consumer lag.',
        last_observed_at: stream.health.last_checked_at ?? checkedAt ?? null,
        metadata: { client_generated_stream_check: true, health_state: healthState },
      });
    }
    const lag = stream.offsets?.lag ?? 0;
    if (lag > 0) {
      checks.push({
        code: 'stream_lag',
        label: 'Stream lag',
        surface: 'stream',
        severity: lag >= 100_000 ? 'critical' : 'warning',
        state: lag >= 100_000 ? 'critical' : 'warning',
        message: `${stream.name} has ${lag} record(s) of stream lag.`,
        resource_id: stream.id,
        resource_rid: stream.rid ?? stream.id,
        resource_name: stream.name,
        recommendation: 'Scale consumers, inspect checkpoints, or replay from the last safe offset.',
        last_observed_at: checkedAt ?? null,
        metadata: { client_generated_stream_check: true, lag },
      });
    }
    const failedCheckpoints = (stream.checkpoints ?? []).filter((checkpoint) => ['failed', 'error'].includes(String(checkpoint.status).toLowerCase()));
    if (failedCheckpoints.length > 0) {
      checks.push({
        code: 'checkpoint_failure',
        label: 'Checkpoint failures',
        surface: 'stream',
        severity: 'critical',
        state: 'critical',
        message: `${stream.name} has ${failedCheckpoints.length} failed checkpoint(s).`,
        resource_id: stream.id,
        resource_rid: stream.rid ?? stream.id,
        resource_name: stream.name,
        recommendation: 'Resume from the last completed checkpoint after fixing source or sink errors.',
        last_observed_at: checkedAt ?? null,
        metadata: { client_generated_stream_check: true, failed_checkpoint_count: failedCheckpoints.length },
      });
    }
    if (checks.length === 0) {
      checks.push({
        code: 'stream_healthy',
        label: 'Stream health',
        surface: 'stream',
        severity: 'info',
        state: 'ok',
        message: `${stream.name} has no client-visible lag or checkpoint failures.`,
        resource_id: stream.id,
        resource_rid: stream.rid ?? stream.id,
        resource_name: stream.name,
        last_observed_at: checkedAt ?? null,
        metadata: { client_generated_stream_check: true },
      });
    }
    return checks;
  });
}

export function dataConnectionHealthSummaryWithStreamChecks(
  summary: DataConnectionHealthSummary,
  streams: DataConnectionStreamResource[],
): DataConnectionHealthSummary {
  const baseChecks = (summary.checks ?? []).filter((check) => !(check.metadata?.client_generated_stream_check === true));
  const checks = [...baseChecks, ...dataConnectionStreamHealthChecks(streams, summary.checked_at)];
  const counts = dataConnectionHealthCounts(checks);
  const surfaces = Array.from(new Set(checks.map((check) => check.surface))).sort();
  return {
    ...summary,
    state: healthStateForChecks(checks),
    counts,
    surfaces,
    checks: checks.sort((left, right) => healthStateRank(right.state) - healthStateRank(left.state) || left.surface.localeCompare(right.surface) || left.code.localeCompare(right.code)),
  };
}

export function sourceCodeImportPatternCoverage(patterns: ExternalTransformPattern[]): string[] {
  return Array.from(new Set(patterns.flatMap((pattern) => pattern.alternative_for))).sort();
}

export function sourceCodeImportExampleKinds(patterns: ExternalTransformPattern[]): string[] {
  return Array.from(new Set(patterns.map((pattern) => pattern.example_kind))).sort();
}

export function computeModuleAlternativeCoverage(alternatives: ComputeModuleAlternative[]): string[] {
  return Array.from(new Set(alternatives.map((alternative) => alternative.alternative_for))).sort();
}

export function computeModuleAlternativeBlockers(alternatives: ComputeModuleAlternative[]): string[] {
  return Array.from(new Set(alternatives.flatMap((alternative) => alternative.blockers))).sort();
}

export function computeModuleAlternativesAreBlocked(alternatives: ComputeModuleAlternative[]): boolean {
  return alternatives.length > 0 && alternatives.every((alternative) => alternative.status === 'blocked');
}

export function sourceCodeImportExportPolicySummary(decision: SourceCodeImportExportPolicyDecision): string[] {
  const parts = [
    `policy ${decision.status}`,
    decision.build_allowed ? 'build allowed' : 'build blocked',
    decision.allow_foundry_inputs ? 'Foundry inputs enabled by source owner' : 'Foundry inputs disabled by source owner',
  ];
  if (decision.uses_foundry_inputs) {
    parts.push(`${decision.foundry_inputs.length} Foundry input${decision.foundry_inputs.length === 1 ? '' : 's'} declared`);
  } else {
    parts.push('no Foundry inputs declared');
  }
  const missingMarkings = decision.missing_markings ?? [];
  const missingOrganizations = decision.missing_organizations ?? [];
  if (missingMarkings.length > 0) {
    parts.push(`blocked markings ${missingMarkings.join(', ')}`);
  }
  if (missingOrganizations.length > 0) {
    parts.push(`blocked organizations ${missingOrganizations.join(', ')}`);
  }
  return parts;
}

export function sourceCodeImportBuildStartSummary(resolution: SourceCodeImportBuildResolution): string[] {
  const parts = [
    `config ${resolution.config_hash}`,
    `${resolution.credential_bindings.length} credential binding${resolution.credential_bindings.length === 1 ? '' : 's'}`,
    `${resolution.egress_policy_bindings.length} egress policy binding${resolution.egress_policy_bindings.length === 1 ? '' : 's'}`,
  ];
  if (resolution.uses_live_configuration) {
    parts.push('live source configuration is resolved at build start');
  }
  if (resolution.no_code_change_required) {
    parts.push('credential, egress, and exportable-marking updates do not require code changes');
  }
  parts.push(...sourceCodeImportExportPolicySummary(resolution.export_policy_decision));
  const markings = resolution.export_controls.allowed_markings;
  const organizations = resolution.export_controls.allowed_organizations;
  if (markings.length > 0 || organizations.length > 0) {
    parts.push(`export controls ${markings.join(', ') || 'no markings'} / ${organizations.join(', ') || 'no organizations'}`);
  } else {
    parts.push('export controls are open');
  }
  return parts;
}

export function defaultExportModeForType(type: DataExportType): DataExportMode {
  switch (type) {
    case 'file':
      return 'incremental';
    case 'table':
      return 'mirror';
    case 'streaming':
      return 'continuous';
  }
}

export function exportCapabilityForType(type: DataExportType): ConnectorCapability {
  switch (type) {
    case 'file':
      return 'file_export';
    case 'table':
      return 'table_export';
    case 'streaming':
      return 'streaming_export';
  }
}

export function sourceSupportsExportType(source: Pick<Source, 'connector_type' | 'supported_capabilities'>, type: DataExportType): boolean {
  const advertised = source.supported_capabilities ?? FALLBACK_CONNECTOR_CATALOG.find((entry) => entry.type === source.connector_type)?.capabilities ?? [];
  return advertised.includes(exportCapabilityForType(type));
}

export function dataExportDestinationLabel(exp: Pick<DataExport, 'export_type' | 'destination_path' | 'destination_table' | 'destination_topic'>): string {
  if (exp.export_type === 'file') return exp.destination_path || 'Destination path missing';
  if (exp.export_type === 'table') return exp.destination_table || 'Destination table missing';
  return exp.destination_topic || 'Destination topic missing';
}

export function dataExportInputLabel(exp: Pick<DataExport, 'export_type' | 'input_dataset_id' | 'input_dataset_rid' | 'input_stream_id'>): string {
  if (exp.export_type === 'streaming') return exp.input_stream_id || 'Input stream missing';
  return exp.input_dataset_rid || exp.input_dataset_id || 'Input dataset missing';
}

export function dataExportCanRun(exp: Pick<DataExport, 'export_type' | 'status'>): boolean {
  return exp.export_type !== 'streaming' && exp.status !== 'running';
}

export function dataExportCanStart(exp: Pick<DataExport, 'export_type' | 'status'>): boolean {
  return exp.export_type === 'streaming' && exp.status !== 'running';
}

export function dataExportCanStop(exp: Pick<DataExport, 'export_type' | 'status'>): boolean {
  return exp.export_type === 'streaming' && exp.status === 'running';
}

export function dataExportScheduleLabel(exp: Pick<DataExport, 'schedule_cron' | 'schedule'>): string {
  if (exp.schedule?.cron) {
    return `${exp.schedule.name} · ${exp.schedule.cron}`;
  }
  return exp.schedule_cron || 'Manual';
}

export function dataExportHistoryHref(entry: Pick<DataExportHistoryEntry, 'build_id' | 'build_report_url'>): string | null {
  if (entry.build_report_url) return entry.build_report_url;
  if (!entry.build_id) return null;
  return `/builds/${encodeURIComponent(entry.build_id)}`;
}

export function dataExportHistoryMetrics(entry: DataExportHistoryEntry): string {
  const parts: string[] = [];
  if (entry.files_written !== undefined || entry.files_skipped !== undefined || entry.bytes_written !== undefined) {
    parts.push(`files ${entry.files_written ?? 0} written / ${entry.files_skipped ?? 0} skipped`);
    if (entry.bytes_written !== undefined) parts.push(`${entry.bytes_written} bytes`);
  }
  if (entry.rows_written !== undefined) parts.push(`rows ${entry.rows_written}`);
  if (entry.records_exported !== undefined || entry.records_skipped !== undefined) {
    parts.push(`records ${entry.records_exported ?? 0} exported / ${entry.records_skipped ?? 0} skipped`);
  }
  if (entry.last_exported_offset) parts.push(`offset ${entry.last_exported_offset}`);
  if (entry.high_watermark_transaction_id) parts.push(`high watermark ${entry.high_watermark_transaction_id}`);
  if (entry.truncate_performed) parts.push('truncated destination');
  if (entry.full_reexport) parts.push('full re-export');
  parts.push(`retries ${entry.retry_attempts ?? 0}`);
  return parts.join(' · ');
}

export function fileExportOverwriteBehaviorLabel(behavior: FileExportOverwriteBehavior): string {
  switch (behavior) {
    case 'overwrite_existing':
      return 'Overwrite existing files';
    case 'fail_if_exists':
      return 'Fail if a file exists';
    case 'skip_existing':
      return 'Skip existing files';
    case 'connector_default':
      return 'Connector default';
  }
}

export function defaultFileExportSettings(input: Partial<FileExportSettings> = {}, mode: DataExportMode = 'incremental', destinationPath = ''): FileExportSettings {
  const settings: FileExportSettings = {
    incremental_policy: input.incremental_policy ?? (mode === 'snapshot' ? 'full_snapshot' : 'modified_since_last_success'),
    overwrite_behavior: input.overwrite_behavior ?? 'overwrite_existing',
    destination_subfolder: input.destination_subfolder?.trim() || null,
    preserve_directory_structure: input.preserve_directory_structure ?? true,
    full_reexport_requested: input.full_reexport_requested ?? false,
    full_reexport_strategy: input.full_reexport_strategy ?? 'create_new_export_or_overwrite_upstream',
    source_files: input.source_files ?? [],
    last_successful_transaction_id: input.last_successful_transaction_id ?? null,
    last_successful_at: input.last_successful_at ?? null,
    destination_subfolder_guidance: input.destination_subfolder_guidance ?? [],
  };
  settings.destination_subfolder_guidance = fileExportDestinationGuidance(destinationPath, settings);
  return settings;
}

export function fileExportDestinationGuidance(destinationPath: string, settings: Pick<FileExportSettings, 'overwrite_behavior' | 'destination_subfolder' | 'full_reexport_requested'>): string[] {
  const guidance = ['File exports copy raw dataset files and default to files modified since the last successful export transaction.'];
  if (settings.full_reexport_requested) {
    guidance.push('For a full re-export, create a new export or overwrite all files upstream; this run is marked to include the whole file manifest once.');
  }
  if (settings.overwrite_behavior === 'overwrite_existing' && !fileExportHasDedicatedSubfolder(destinationPath, settings.destination_subfolder ?? null)) {
    guidance.push('Use a dedicated destination subfolder to avoid overwriting files owned by other systems.');
  }
  return guidance;
}

function fileExportHasDedicatedSubfolder(destinationPath: string, subfolder?: string | null): boolean {
  if (subfolder?.trim()) return true;
  let path = destinationPath.trim();
  const schemeIndex = path.indexOf('://');
  if (schemeIndex >= 0) {
    path = path.slice(schemeIndex + 3);
    const bucketSlash = path.indexOf('/');
    path = bucketSlash >= 0 ? path.slice(bucketSlash + 1) : '';
  }
  path = path.replace(/^\/+|\/+$/g, '');
  return path.includes('/');
}

export function resolveFileExportRunPlan(settingsInput: Partial<FileExportSettings>, destinationPath: string, nowIso: string): FileExportRunPlan {
  const settings = defaultFileExportSettings(settingsInput, settingsInput.incremental_policy === 'full_snapshot' ? 'snapshot' : 'incremental', destinationPath);
  const files = [...(settings.source_files ?? [])].sort((left, right) => {
    const leftTime = left.modified_at ? Date.parse(left.modified_at) : Number.NEGATIVE_INFINITY;
    const rightTime = right.modified_at ? Date.parse(right.modified_at) : Number.NEGATIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.path.localeCompare(right.path);
  });
  const lastSuccessfulAt = settings.last_successful_at ? Date.parse(settings.last_successful_at) : null;
  const fullReexport = settings.full_reexport_requested || settings.incremental_policy === 'full_snapshot';
  const exportedFiles: FileExportSourceFile[] = [];
  const skippedFiles: FileExportSourceFile[] = [];
  let bytesWritten = 0;
  let highWatermark: string | null = settings.last_successful_transaction_id ?? null;
  for (const file of files) {
    const modifiedAt = file.modified_at ? Date.parse(file.modified_at) : null;
    const shouldWrite = fullReexport || lastSuccessfulAt === null || modifiedAt === null || modifiedAt > lastSuccessfulAt;
    if (shouldWrite) {
      exportedFiles.push(file);
      bytesWritten += file.size_bytes;
      highWatermark = file.transaction_id ?? highWatermark;
    } else {
      skippedFiles.push(file);
    }
  }
  void nowIso;
  return {
    incremental_policy: settings.incremental_policy,
    overwrite_behavior: settings.overwrite_behavior,
    destination_path: destinationPath,
    destination_subfolder: settings.destination_subfolder ?? null,
    files_considered: files.length,
    files_written: exportedFiles.length,
    files_skipped: skippedFiles.length,
    bytes_written: bytesWritten,
    full_reexport: fullReexport,
    last_successful_at: settings.last_successful_at ?? null,
    last_exported_transaction_id: highWatermark,
    exported_files: exportedFiles,
    skipped_files: skippedFiles,
    destination_subfolder_advice: fileExportDestinationGuidance(destinationPath, settings),
  };
}

export function tableExportModeRequiresTruncate(mode: DataExportMode): boolean {
  return mode === 'mirror' || mode === 'full_snapshot_truncate' || mode === 'incremental_truncate';
}

export function defaultTableExportSettings(input: Partial<TableExportSettings> = {}, mode: DataExportMode = 'mirror'): TableExportSettings {
  const settings: TableExportSettings = {
    dataset_schema: normalizeTableExportColumns(input.dataset_schema ?? []),
    destination_schema: normalizeTableExportColumns(input.destination_schema ?? []),
    input_parquet_backed: input.input_parquet_backed ?? false,
    destination_table_exists: input.destination_table_exists ?? false,
    truncate_permission: input.truncate_permission ?? false,
    exact_column_match: false,
    row_count_estimate: input.row_count_estimate ?? null,
    last_successful_transaction_id: input.last_successful_transaction_id ?? null,
    last_successful_at: input.last_successful_at ?? null,
    validation_issues: [],
  };
  settings.exact_column_match = tableExportColumnsExactlyMatch(settings.dataset_schema, settings.destination_schema);
  settings.validation_issues = validateTableExportSettings(settings, mode);
  return settings;
}

export function validateTableExportSettings(settingsInput: Partial<TableExportSettings>, mode: DataExportMode = 'mirror'): TableExportValidationIssue[] {
  const settings: TableExportSettings = {
    dataset_schema: normalizeTableExportColumns(settingsInput.dataset_schema ?? []),
    destination_schema: normalizeTableExportColumns(settingsInput.destination_schema ?? []),
    input_parquet_backed: settingsInput.input_parquet_backed ?? false,
    destination_table_exists: settingsInput.destination_table_exists ?? false,
    truncate_permission: settingsInput.truncate_permission ?? false,
    exact_column_match: false,
    row_count_estimate: settingsInput.row_count_estimate ?? null,
    last_successful_transaction_id: settingsInput.last_successful_transaction_id ?? null,
    last_successful_at: settingsInput.last_successful_at ?? null,
    validation_issues: [],
  };
  settings.exact_column_match = tableExportColumnsExactlyMatch(settings.dataset_schema, settings.destination_schema);
  const issues: TableExportValidationIssue[] = [];
  const issue = (code: string, message: string, column?: string) => issues.push({ code, severity: 'error' as const, message, column });

  if (!settings.input_parquet_backed) issue('input_not_parquet', 'table_export.input_parquet_backed must be true because table exports require Parquet-backed dataset files.');
  if (!settings.destination_table_exists) issue('destination_table_missing', 'table_export.destination_table_exists must be true because OpenFoundry does not create external destination tables.');
  if (tableExportModeRequiresTruncate(mode) && !settings.truncate_permission) issue('truncate_permission_missing', 'table_export.truncate_permission must be true for mirror or truncating table export modes.');
  if (settings.dataset_schema.length === 0) issue('dataset_schema_missing', 'table_export.dataset_schema required for table exports.');
  if (settings.destination_schema.length === 0) issue('destination_schema_missing', 'table_export.destination_schema required for table exports.');

  issues.push(...tableExportColumnIssues(settings.dataset_schema, 'dataset_schema'));
  issues.push(...tableExportColumnIssues(settings.destination_schema, 'destination_schema'));
  issues.push(...tableExportSchemaMatchIssues(settings.dataset_schema, settings.destination_schema));
  return issues;
}

export function resolveTableExportRunPlan(settingsInput: Partial<TableExportSettings>, mode: DataExportMode = 'mirror', nowIso = new Date().toISOString()): TableExportRunPlan {
  const settings = defaultTableExportSettings(settingsInput, mode);
  void nowIso;
  const truncateRequired = tableExportModeRequiresTruncate(mode);
  return {
    export_mode: mode,
    resolution_strategy: tableExportResolutionStrategy(mode),
    rows_written: Math.max(0, settings.row_count_estimate ?? 0),
    truncate_required: truncateRequired,
    truncate_performed: truncateRequired,
    input_parquet_backed: settings.input_parquet_backed,
    destination_table_exists: settings.destination_table_exists,
    exact_column_match: settings.exact_column_match,
    last_successful_at: settings.last_successful_at ?? null,
    validation_issues: settings.validation_issues ?? [],
  };
}

function normalizeTableExportColumns(columns: TableExportColumn[]): TableExportColumn[] {
  return columns.map((column) => ({
    name: column.name?.trim() ?? '',
    foundry_type: column.foundry_type?.trim() ?? '',
    external_type: column.external_type?.trim() ?? '',
    nullable: Boolean(column.nullable),
  }));
}

function tableExportColumnIssues(columns: TableExportColumn[], field: 'dataset_schema' | 'destination_schema'): TableExportValidationIssue[] {
  const issues: TableExportValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [index, column] of columns.entries()) {
    if (!column.name) {
      issues.push({ code: `${field}_blank_column`, severity: 'error', message: `table_export.${field}[${index}].name cannot be blank.` });
      continue;
    }
    if (seen.has(column.name)) {
      issues.push({ code: `${field}_duplicate_column`, severity: 'error', message: `table_export.${field} cannot contain duplicate column ${column.name}.`, column: column.name });
    }
    seen.add(column.name);
    if (tableExportTypeIsNested(column.foundry_type) || tableExportTypeIsNested(column.external_type)) {
      issues.push({ code: `${field}_unsupported_nested_type`, severity: 'error', message: `Table exports do not support nested ARRAY, MAP, STRUCT, JSON, or object column types for ${column.name}.`, column: column.name });
    }
    if (!tableExportEffectiveType(column, field === 'dataset_schema')) {
      issues.push({ code: `${field}_missing_type`, severity: 'error', message: `table_export.${field} column ${column.name} must define a type.`, column: column.name });
    }
  }
  return issues;
}

function tableExportSchemaMatchIssues(dataset: TableExportColumn[], destination: TableExportColumn[]): TableExportValidationIssue[] {
  const issues: TableExportValidationIssue[] = [];
  if (dataset.length === 0 || destination.length === 0) return issues;
  if (dataset.length !== destination.length) {
    issues.push({ code: 'schema_column_count_mismatch', severity: 'error', message: 'table_export dataset_schema and destination_schema must contain the same number of columns.' });
  }
  const limit = Math.min(dataset.length, destination.length);
  for (let index = 0; index < limit; index += 1) {
    const left = dataset[index];
    const right = destination[index];
    if (left.name !== right.name) {
      const caseSuffix = left.name.toLowerCase() === right.name.toLowerCase() ? ' including case' : '';
      issues.push({ code: 'schema_column_name_mismatch', severity: 'error', message: `table_export column ${index} name mismatch: dataset "${left.name}" must exactly match destination "${right.name}"${caseSuffix}.`, column: left.name });
    }
    const datasetType = tableExportEffectiveType(left, true);
    const destinationType = tableExportEffectiveType(right, false);
    if (!tableExportTypesCompatible(datasetType, destinationType)) {
      issues.push({ code: 'schema_column_type_mismatch', severity: 'error', message: `table_export column ${left.name} type mismatch: dataset "${datasetType}" must be compatible with destination "${destinationType}".`, column: left.name });
    }
  }
  return issues;
}

function tableExportColumnsExactlyMatch(dataset: TableExportColumn[], destination: TableExportColumn[]): boolean {
  if (dataset.length === 0 || dataset.length !== destination.length) return false;
  return dataset.every((column, index) => column.name !== '' && column.name === destination[index].name && tableExportTypesCompatible(tableExportEffectiveType(column, true), tableExportEffectiveType(destination[index], false)));
}

function tableExportEffectiveType(column: TableExportColumn, dataset: boolean): string {
  if (dataset) return column.foundry_type || column.external_type || '';
  return column.external_type || column.foundry_type || '';
}

function tableExportTypesCompatible(datasetType: string, destinationType: string): boolean {
  const left = tableExportTypeFamily(datasetType);
  const right = tableExportTypeFamily(destinationType);
  return Boolean(left && right && left === right);
}

function tableExportTypeFamily(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (!normalized || tableExportTypeIsNested(normalized)) return '';
  normalized = normalized.replace(/\(.*/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (['string', 'varchar', 'varchar2', 'char', 'character', 'text', 'nvarchar', 'nchar', 'ntext'].includes(normalized)) return 'string';
  if (['boolean', 'bool', 'bit'].includes(normalized)) return 'boolean';
  if (['byte', 'tinyint'].includes(normalized)) return 'tinyint';
  if (['short', 'smallint', 'int2'].includes(normalized)) return 'smallint';
  if (['integer', 'int', 'int4'].includes(normalized)) return 'integer';
  if (['long', 'bigint', 'int8'].includes(normalized)) return 'bigint';
  if (['float', 'float32', 'real'].includes(normalized)) return 'float';
  if (['double', 'float64', 'double precision'].includes(normalized)) return 'double';
  if (['decimal', 'numeric', 'number'].includes(normalized)) return 'decimal';
  if (normalized === 'date') return 'date';
  if (['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'timestamptz', 'datetime'].includes(normalized)) return 'timestamp';
  if (['binary', 'bytes', 'bytea', 'varbinary'].includes(normalized)) return 'binary';
  return normalized;
}

function tableExportTypeIsNested(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ['array', 'map', 'struct', 'list', 'record', 'object', 'json', 'variant'].some((token) => normalized.includes(token));
}

function tableExportResolutionStrategy(mode: DataExportMode): string {
  switch (mode) {
    case 'mirror':
      return 'efficient_mirror';
    case 'full_snapshot':
      return 'full_dataset_without_truncation';
    case 'full_snapshot_truncate':
      return 'full_dataset_with_truncation';
    case 'incremental':
      return 'incremental';
    case 'incremental_truncate':
      return 'incremental_with_truncation';
    case 'incremental_append_only':
      return 'incremental_append_only';
    default:
      return 'table_export';
  }
}

export function streamingExportReplayBehaviorLabel(behavior: StreamingExportReplayBehavior): string {
  switch (behavior) {
    case 'export_replayed_records':
      return 'Export replayed records';
    case 'skip_replayed_records':
      return 'Do not export replayed records';
  }
}

export function defaultStreamingExportSettings(input: Partial<StreamingExportSettings> = {}, scheduleConfigured = false): StreamingExportSettings {
  const settings: StreamingExportSettings = {
    replay_behavior: input.replay_behavior ?? 'export_replayed_records',
    start_offset: input.start_offset ?? 'previous_export_offset',
    start_offset_value: input.start_offset_value?.trim() || null,
    last_exported_offset: input.last_exported_offset?.trim() || null,
    last_checkpoint_id: input.last_checkpoint_id?.trim() || null,
    schedule_restart_enabled: input.schedule_restart_enabled ?? scheduleConfigured,
    restart_from_previous_offset: false,
    records_exported_estimate: input.records_exported_estimate ?? null,
    replayed_records_detected: input.replayed_records_detected ?? false,
    last_started_at: input.last_started_at ?? null,
    last_stopped_at: input.last_stopped_at ?? null,
    warnings: [],
  };
  settings.restart_from_previous_offset = settings.start_offset === 'previous_export_offset';
  settings.warnings = streamingExportWarnings(settings);
  return settings;
}

export function validateStreamingExportSettings(settingsInput: Partial<StreamingExportSettings>): StreamingExportWarning[] {
  const settings = defaultStreamingExportSettings(settingsInput);
  const issues: StreamingExportWarning[] = [];
  if (!['export_replayed_records', 'skip_replayed_records'].includes(settings.replay_behavior)) {
    issues.push({ code: 'invalid_replay_behavior', severity: 'error', message: 'streaming_export.replay_behavior must be export_replayed_records or skip_replayed_records.' });
  }
  if (!['previous_export_offset', 'latest', 'earliest', 'explicit'].includes(settings.start_offset)) {
    issues.push({ code: 'invalid_start_offset', severity: 'error', message: 'streaming_export.start_offset must be previous_export_offset, latest, earliest, or explicit.' });
  }
  if (settings.start_offset === 'explicit' && !settings.start_offset_value) {
    issues.push({ code: 'explicit_offset_missing', severity: 'error', message: 'streaming_export.start_offset_value required when start_offset is explicit.' });
  }
  if (settings.records_exported_estimate !== null && settings.records_exported_estimate !== undefined && settings.records_exported_estimate < 0) {
    issues.push({ code: 'invalid_records_estimate', severity: 'error', message: 'streaming_export.records_exported_estimate must be zero or a positive number.' });
  }
  return [...issues, ...streamingExportWarnings(settings)];
}

export function resolveStreamingExportStartPlan(settingsInput: Partial<StreamingExportSettings>, scheduleTriggered = false, nowIso = new Date().toISOString()): StreamingExportStartPlan {
  const settings = defaultStreamingExportSettings(settingsInput, scheduleTriggered);
  void nowIso;
  return {
    replay_behavior: settings.replay_behavior,
    start_offset: settings.start_offset,
    effective_start_offset: streamingExportEffectiveStartOffset(settings),
    restart_from_previous_offset: settings.restart_from_previous_offset,
    schedule_restart_enabled: settings.schedule_restart_enabled,
    schedule_triggered: scheduleTriggered,
    records_to_export: Math.max(0, settings.records_exported_estimate ?? 0),
    duplicate_risk: settings.replay_behavior === 'export_replayed_records',
    drop_risk: settings.replay_behavior === 'skip_replayed_records',
    warnings: settings.warnings ?? [],
  };
}

export function advanceStreamingExportOffset(settingsInput: Partial<StreamingExportSettings>): string | null {
  const settings = defaultStreamingExportSettings(settingsInput);
  const records = settings.records_exported_estimate ?? 0;
  if (records <= 0) return settings.last_exported_offset ?? null;
  if (!settings.last_exported_offset) return String(records);
  const numeric = Number(settings.last_exported_offset);
  if (Number.isInteger(numeric)) return String(numeric + records);
  return settings.last_exported_offset;
}

function streamingExportWarnings(settings: Pick<StreamingExportSettings, 'replay_behavior'>): StreamingExportWarning[] {
  if (settings.replay_behavior === 'skip_replayed_records') {
    return [{ code: 'replay_drop_risk', severity: 'warning', message: 'Skipping replayed stream records can drop records because offsets are not guaranteed to match across replayed streams.' }];
  }
  return [{ code: 'replay_duplicate_risk', severity: 'warning', message: 'Exporting replayed stream records can duplicate records in the external destination; configure downstream consumers to tolerate duplicates.' }];
}

function streamingExportEffectiveStartOffset(settings: StreamingExportSettings): string | null {
  if (settings.start_offset === 'previous_export_offset') return settings.last_exported_offset || 'latest';
  if (settings.start_offset === 'explicit') return settings.start_offset_value ?? null;
  return settings.start_offset;
}

export function parseGlobList(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

export function validateFileSyncSettings(settings: FileSyncSettings): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (settings.mode === 'snapshot_mirror' && settings.exclude_already_synced) {
    warnings.push({ code: 'snapshot-excludes-synced', severity: 'warning', message: 'Snapshot mirror normally rewrites the destination; excluding already-synced files may leave deleted source files in the output.' });
  }
  if (settings.mode === 'incremental_append' && !settings.exclude_already_synced) {
    warnings.push({ code: 'incremental-without-dedup', severity: 'warning', message: 'Incremental append should exclude already-synced files to avoid duplicate dataset rows.' });
  }
  if (settings.mode === 'historical_snapshot_incremental' && !settings.historical_snapshot_cutoff) {
    warnings.push({ code: 'missing-historical-cutoff', severity: 'warning', message: 'Historical snapshot + incremental mode should define a cutoff so old files snapshot once and recent files append incrementally.' });
  }
  if (settings.file_count_limit !== null && (!Number.isInteger(settings.file_count_limit) || settings.file_count_limit < 1)) {
    warnings.push({ code: 'invalid-file-count-limit', severity: 'error', message: 'File count limit must be a positive integer when provided.' });
  }
  for (const glob of settings.include_globs) {
    if (settings.exclude_globs.includes(glob)) {
      warnings.push({ code: 'contradictory-glob', severity: 'warning', message: `Glob ${glob} is both included and excluded.` });
    }
  }
  if (settings.path_metadata_columns.length > 0 && !settings.include_path_metadata) {
    warnings.push({ code: 'path-columns-disabled', severity: 'warning', message: 'Path metadata columns are configured but path metadata is disabled.' });
  }
  return warnings;
}

export function makeFileSyncSettings(input: Omit<FileSyncSettings, 'transaction_type' | 'warnings'>): FileSyncSettings {
  const settings: FileSyncSettings = {
    ...input,
    transaction_type: datasetTransactionTypeForFileMode(input.mode),
    include_globs: Array.from(new Set(input.include_globs)),
    exclude_globs: Array.from(new Set(input.exclude_globs)),
    path_metadata_columns: Array.from(new Set(input.path_metadata_columns)),
    warnings: [],
  };
  return { ...settings, warnings: validateFileSyncSettings(settings) };
}

export function validateTableBatchSyncSettings(settings: TableBatchSyncSettings): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  if (settings.selected_tables.length === 0) {
    warnings.push({ code: 'no-tables-selected', severity: 'error', message: 'Select at least one source table before creating a table batch sync.' });
  }
  if (settings.mode === 'incremental') {
    for (const table of settings.selected_tables) {
      if (!(table.incremental_column ?? settings.incremental_column)?.trim()) {
        warnings.push({ code: 'missing-incremental-column', severity: 'warning', message: `Table ${table.source_table} is incremental but has no change detection column.` });
      }
    }
  }
  return warnings;
}

export function makeTableBatchSyncSettings(input: Omit<TableBatchSyncSettings, 'warnings'>): TableBatchSyncSettings {
  const settings: TableBatchSyncSettings = {
    ...input,
    transaction_ids: input.transaction_ids ?? [],
    warnings: [],
  };
  return { ...settings, warnings: validateTableBatchSyncSettings(settings) };
}

export const CDC_RELATIONAL_CONNECTORS = new Set(['postgresql', 'postgres', 'mssql', 'sqlserver', 'microsoft_sql_server', 'oracle', 'oracle_database', 'db2', 'ibm_db2']);
export const CDC_CHANGELOG_STREAM_CONNECTORS = new Set(['kafka', 'streaming_kafka', 'kinesis', 'streaming_kinesis', 'pubsub', 'streaming_pubsub', 'google_pubsub', 'iot', 'streaming_external']);

export function cdcInputKindForConnector(connectorType: string): CdcSyncInputKind | null {
  const normalized = connectorType.trim().toLowerCase();
  if (CDC_RELATIONAL_CONNECTORS.has(normalized)) return 'relational_connector';
  if (CDC_CHANGELOG_STREAM_CONNECTORS.has(normalized)) return 'streaming_middleware_changelog';
  return null;
}

export function connectorSupportsCdcSync(connectorType: string): boolean {
  return cdcInputKindForConnector(connectorType) !== null;
}

function hasSchemaField(schema: SyncResourceSchemaField[], column: string): boolean {
  const normalized = column.trim().toLowerCase();
  return schema.some((field) => field.name.trim().toLowerCase() === normalized);
}

export function validateCdcSyncSetup(settings: CdcSyncSettings, connectorType?: string): SyncValidationWarning[] {
  const warnings: SyncValidationWarning[] = [];
  const supportedKind = connectorType ? cdcInputKindForConnector(connectorType) : settings.input_kind;
  if (connectorType && supportedKind === null) {
    warnings.push({ code: 'unsupported-cdc-connector', severity: 'error', message: `Connector ${connectorType} does not support CDC sync setup.` });
  }
  if (connectorType && supportedKind !== null && supportedKind !== settings.input_kind) {
    warnings.push({ code: 'cdc-input-kind-mismatch', severity: 'warning', message: `Connector ${connectorType} is normally configured as ${supportedKind}.` });
  }
  if (settings.input_kind === 'relational_connector') {
    if (!settings.source_table.trim()) {
      warnings.push({ code: 'missing-cdc-source-table', severity: 'error', message: 'Select the source table for the CDC sync.' });
    }
    if (!settings.source_database_cdc_enabled) {
      warnings.push({ code: 'database-cdc-not-enabled', severity: 'error', message: 'Confirm that the source database exposes changelog data before creating the CDC sync.' });
    }
    if (!settings.source_table_cdc_enabled) {
      warnings.push({ code: 'table-cdc-not-enabled', severity: 'error', message: 'Confirm that the selected source table exposes changelog data before creating the CDC sync.' });
    }
  }
  if (settings.input_kind === 'streaming_middleware_changelog') {
    if (!(settings.source_topic ?? '').trim()) {
      warnings.push({ code: 'missing-cdc-source-topic', severity: 'error', message: 'Select the topic, queue, or stream that carries changelog-shaped records.' });
    }
    if (!settings.changelog_input_validated) {
      warnings.push({ code: 'changelog-shape-not-validated', severity: 'error', message: 'Validate that the streaming middleware input carries primary key, ordering, and deletion metadata.' });
    }
  }
  if (settings.primary_key_columns.length === 0) {
    warnings.push({ code: 'missing-cdc-primary-key', severity: 'error', message: 'CDC syncs require at least one primary key column.' });
  }
  if (!settings.ordering_column.trim()) {
    warnings.push({ code: 'missing-cdc-ordering-column', severity: 'error', message: 'CDC syncs require an ordering column for archive/current-state resolution.' });
  }
  if (!settings.output_stream_location.trim() && !(settings.output_stream_id ?? '').trim()) {
    warnings.push({ code: 'missing-cdc-output-stream', severity: 'error', message: 'Choose or create an output stream for changelog records.' });
  }
  if (['timestamp', 'lsn', 'offset'].includes(settings.start_position) && `${settings.start_position_value ?? ''}`.trim() === '') {
    warnings.push({ code: 'missing-cdc-start-position-value', severity: 'error', message: `Start position ${settings.start_position} requires a value.` });
  }
  if (settings.deletion_column && settings.deletion_column.trim() === settings.ordering_column.trim()) {
    warnings.push({ code: 'deletion-column-conflicts-ordering', severity: 'error', message: 'Deletion and ordering columns must be distinct.' });
  }
  const duplicatePrimaryKeys = settings.primary_key_columns.filter((column, index, columns) => columns.indexOf(column) !== index);
  if (duplicatePrimaryKeys.length > 0) {
    warnings.push({ code: 'duplicate-cdc-primary-key', severity: 'warning', message: `Duplicate primary key columns ignored: ${Array.from(new Set(duplicatePrimaryKeys)).join(', ')}.` });
  }
  if (settings.schema.length === 0) {
    warnings.push({ code: 'missing-cdc-schema', severity: 'warning', message: 'The connector should derive and persist the output stream schema before the sync is started.' });
  } else {
    for (const column of settings.primary_key_columns) {
      if (!hasSchemaField(settings.schema, column)) {
        warnings.push({ code: 'cdc-primary-key-not-in-schema', severity: 'error', message: `Primary key column ${column} is not present in the captured schema.` });
      }
    }
    if (settings.ordering_column && !hasSchemaField(settings.schema, settings.ordering_column)) {
      warnings.push({ code: 'cdc-ordering-column-not-in-schema', severity: 'error', message: `Ordering column ${settings.ordering_column} is not present in the captured schema.` });
    }
    if (settings.deletion_column && !hasSchemaField(settings.schema, settings.deletion_column)) {
      warnings.push({ code: 'cdc-deletion-column-not-in-schema', severity: 'error', message: `Deletion column ${settings.deletion_column} is not present in the captured schema.` });
    }
  }
  return warnings;
}

export function makeCdcSyncSettings(input: Omit<CdcSyncSettings, 'primary_key_columns' | 'connector_metadata' | 'warnings'> & {
  primary_key_columns: string[];
  connector_metadata?: Partial<CdcConnectorDerivedMetadata>;
}, connectorType: string): CdcSyncSettings {
  const primaryKeys = Array.from(new Set(input.primary_key_columns.map((column) => column.trim()).filter(Boolean)));
  const settings: CdcSyncSettings = {
    ...input,
    primary_key_columns: primaryKeys,
    source_database: input.source_database?.trim() || null,
    source_schema: input.source_schema?.trim() || null,
    source_table: input.source_table.trim(),
    source_topic: input.source_topic?.trim() || null,
    ordering_column: input.ordering_column.trim(),
    deletion_column: input.deletion_column?.trim() || null,
    output_stream_id: input.output_stream_id?.trim() || null,
    output_stream_location: input.output_stream_location.trim(),
    connector_metadata: {
      connector_type: connectorType,
      source_database: input.source_database?.trim() || null,
      source_schema: input.source_schema?.trim() || null,
      source_table: input.source_table.trim() || null,
      upstream_topic: input.source_topic?.trim() || null,
      output_stream_id: input.output_stream_id?.trim() || null,
      ...input.connector_metadata,
    },
    warnings: [],
  };
  return { ...settings, warnings: validateCdcSyncSetup(settings, connectorType) };
}

export function defaultOutputKindForCapability(capability: SyncCapabilityType): SyncOutputKind {
  switch (capability) {
    case 'streaming_sync':
    case 'cdc_sync':
      return 'stream';
    case 'media_sync':
      return 'media_set';
    case 'batch_sync':
      return 'dataset';
  }
}

export function defaultTransactionModeForCapability(capability: SyncCapabilityType): SyncTransactionMode {
  return capability === 'batch_sync' || capability === 'media_sync' ? 'transactional' : 'external_checkpoint';
}

export function defaultWriteModeForCapability(capability: SyncCapabilityType): SyncWriteMode {
  return capability === 'batch_sync' || capability === 'media_sync' ? 'snapshot' : 'append';
}

export function syncCapabilityLabel(capability: SyncCapabilityType): string {
  switch (capability) {
    case 'batch_sync':
      return 'Batch sync';
    case 'streaming_sync':
      return 'Streaming sync';
    case 'cdc_sync':
      return 'CDC sync';
    case 'media_sync':
      return 'Media sync';
  }
}

export function suggestedOutputDatasetId(source: Pick<Source, 'id' | 'name' | 'default_output_location'>, selector?: string): string {
  const slug = `${source.name}-${selector ?? 'sync'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || source.id;
  return source.default_output_location ? `${source.default_output_location.replace(/\/$/, '')}/${slug}` : `dataset://${slug}`;
}

export const FALLBACK_STREAMING_SOURCE_CONTRACTS: StreamingSourceContract[] = [
  {
    kind: 'streaming_kafka',
    display_name: 'Apache Kafka',
    description: 'Pull records from a Kafka topic via consumer-group offsets.',
    requires_agent: false,
    config_fields: [
      { name: 'bootstrap_servers', kind: 'string', required: true, description: 'Comma-separated host:port list.' },
      { name: 'topic', kind: 'string', required: true, description: 'Topic the sync subscribes to.' },
      { name: 'consumer_group', kind: 'string', required: true, description: 'Kafka consumer group id.' },
      { name: 'auto_offset_reset', kind: 'string', required: false, description: 'earliest / latest.' },
    ],
  },
  {
    kind: 'streaming_kinesis',
    display_name: 'Amazon Kinesis',
    description: 'Pull records from a Kinesis stream shard.',
    requires_agent: false,
    config_fields: [
      { name: 'stream_name', kind: 'string', required: true, description: 'Kinesis stream name.' },
      { name: 'region', kind: 'string', required: true, description: 'AWS region.' },
      { name: 'shard_iterator_type', kind: 'string', required: false, description: 'LATEST / TRIM_HORIZON.' },
      { name: 'max_records_per_shard', kind: 'int', required: false, description: 'Soft cap per pull.' },
    ],
  },
  {
    kind: 'streaming_sqs',
    display_name: 'Amazon SQS',
    description: 'Long-poll an SQS queue with explicit per-message ack.',
    requires_agent: false,
    config_fields: [
      { name: 'queue_url', kind: 'string', required: true, description: 'Full queue URL.' },
      { name: 'region', kind: 'string', required: true, description: 'AWS region.' },
      { name: 'wait_time_seconds', kind: 'int', required: false, description: 'Long-poll seconds (0..=20).' },
      { name: 'visibility_timeout_seconds', kind: 'int', required: false, description: 'Per-message visibility timeout.' },
    ],
  },
  {
    kind: 'streaming_pubsub',
    display_name: 'Google Cloud Pub/Sub',
    description: 'REST-based pull + ack against a subscription.',
    requires_agent: false,
    config_fields: [
      { name: 'project_id', kind: 'string', required: true, description: 'GCP project id.' },
      { name: 'subscription_id', kind: 'string', required: true, description: 'Subscription id.' },
      { name: 'max_messages', kind: 'int', required: false, description: 'Soft cap per pull.' },
      { name: 'ack_deadline_seconds', kind: 'int', required: false, description: 'Per-pull ack-deadline override.' },
    ],
  },
  {
    kind: 'streaming_aveva_pi',
    display_name: 'Aveva PI',
    description: 'Poll the PI Web API for observation deltas.',
    requires_agent: false,
    config_fields: [
      { name: 'base_url', kind: 'string', required: true, description: 'PI Web API base URL.' },
      { name: 'event_stream_web_id', kind: 'string', required: true, description: 'WebID of the event stream.' },
      { name: 'poll_interval_ms', kind: 'int', required: false, description: 'Polling cadence.' },
      { name: 'auth_header', kind: 'secret', required: false, description: 'Authorization header (Bearer / Basic).' },
    ],
  },
  {
    kind: 'streaming_external',
    display_name: 'External transform',
    description: 'Generic webhook hook for sources without a dedicated connector.',
    requires_agent: true,
    config_fields: [
      { name: 'agent_label', kind: 'string', required: true, description: 'Free-form label for the catalogue.' },
      { name: 'agent_token', kind: 'secret', required: true, description: 'Bearer token the agent uses to push records.' },
      { name: 'protocol', kind: 'string', required: true, description: 'activemq | rabbitmq | mqtt | sns | ibm_mq | solace.' },
    ],
  },
];

/**
 * Filter the catalog by free-text query, matching connector name/type or any
 * capability tag (so a search for "virtual" surfaces Snowflake, mirroring the
 * Foundry docs example).
 */
export function filterCatalog(
  catalog: ConnectorCatalogEntry[],
  query: string,
): ConnectorCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter((entry) => {
    const registered = getConnectorRegistryEntry(entry);
    if (registered.type.toLowerCase().includes(q)) return true;
    if (registered.name.toLowerCase().includes(q)) return true;
    if (registered.description.toLowerCase().includes(q)) return true;
    if (connectorCategoryLabel(registered.category).toLowerCase().includes(q)) return true;
    if (registered.capabilities.some((cap) => cap.toLowerCase().includes(q) || capabilityLabel(cap).toLowerCase().includes(q))) return true;
    if (registered.credentialFields.some((field) => field.label.toLowerCase().includes(q) || field.kind.toLowerCase().includes(q))) return true;
    if (registered.network.modes.some((mode) => mode.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Human label for a capability tag. Used for the chips on connector cards
 * and in the source detail capabilities tab.
 */
export function capabilityLabel(capability: ConnectorCapability): string {
  switch (capability) {
    case 'batch_sync':
      return 'Batch sync';
    case 'streaming_sync':
      return 'Streaming sync';
    case 'cdc_sync':
      return 'CDC sync';
    case 'media_sync':
      return 'Media sync';
    case 'hyperauto':
      return 'HyperAuto';
    case 'file_export':
      return 'File export';
    case 'table_export':
      return 'Table export';
    case 'streaming_export':
      return 'Streaming export';
    case 'webhook':
      return 'Webhook';
    case 'virtual_table':
      return 'Virtual table';
    case 'virtual_media':
      return 'Virtual media';
    case 'exploration':
      return 'Exploration';
    case 'use_in_code':
      return 'Use in code';
  }
}

export default dataConnection;
