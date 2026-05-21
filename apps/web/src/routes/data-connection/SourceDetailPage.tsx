import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Tabs } from '@/lib/components/Tabs';
import { ComputeTypePopover } from '@/lib/components/data-connection/ComputeTypePopover';
import { MigrateToFoundryWorkerWizard } from '@/lib/components/data-connection/MigrateToFoundryWorkerWizard';
import { SelectAgentsPanel } from '@/lib/components/data-connection/SelectAgentsPanel';
import { VirtualTablesTab } from '@/lib/components/data-connection/VirtualTablesTab';
import { Breadcrumb } from '@/lib/components/ui/Breadcrumb';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import {
  capabilityLabel,
  connectorCategoryLabel,
  dataConnection,
  FALLBACK_CONNECTOR_CATALOG,
  datasetTransactionTypeForFileMode,
  datasetTransactionTypeForTableMode,
  dataExportCanRun,
  dataExportCanStart,
  dataExportCanStop,
  dataExportDestinationLabel,
  dataExportHistoryHref,
  dataExportHistoryMetrics,
  dataExportInputLabel,
  dataExportModeLabel,
  dataExportScheduleLabel,
  dataExportTypeLabel,
  dataConnectionActionableHealthChecks,
  dataConnectionHealthStateLabel,
  dataConnectionHealthSummaryWithStreamChecks,
  dataConnectionHealthSurfaceLabel,
  defaultOutputKindForCapability,
  defaultExportModeForType,
  defaultFileExportSettings,
  defaultStreamingExportSettings,
  defaultTableExportSettings,
  fileExportOverwriteBehaviorLabel,
  buildHistoryHref,
  defaultTransactionModeForCapability,
  defaultWriteModeForCapability,
  fileSyncModeLabel,
  cdcInputKindForConnector,
  connectorSupportsCdcSync,
  cdcDownstreamIntegrationMetadata,
  cdcPrimaryKeyForRow,
  cdcResolutionStrategyLabel,
  cdcSchemaFieldResolutionRole,
  getConnectorRegistryEntry,
  makeCdcSyncSettings,
  makeFileSyncSettings,
  makeTableBatchSyncSettings,
  parseGlobList,
  evaluateStreamingConsistency,
  pushStreamEndpointUrl,
  recommendStreamIngestion,
  restartPlanForStream,
  streamArchivePolicyLabel,
  streamHybridReadLabel,
  streamingSyncCanStart,
  streamingSyncCanStop,
  validateStreamingSyncSetup,
  validatePushStreamRecords,
  validateWebhookSetup,
  retainWebhookInvocations,
  unavailableCapabilitiesForWorker,
  validateConnectorWorker,
  validateEgressPoliciesForConnectionTest,
  validateCdcSyncSetup,
  resolveCdcArchiveView,
  suggestedOutputDatasetId,
  tableBatchSyncModeLabel,
  streamReplayRangeLabel,
  streamStorageLabel,
  sourceSupportsExportType,
  syncCapabilityLabel,
  syncRunDurationMs,
  syncRunStatusLabel,
  tableExportModeRequiresTruncate,
  streamingExportReplayBehaviorLabel,
  sourceCodeImportBuildStartSummary,
  sourceCodeImportExportPolicySummary,
  sourceCodeImportExampleKinds,
  sourceCodeImportPatternCoverage,
  sourceCodeImportRepositoryDisplay,
  sourceGovernanceAuditLabel,
  sourceGovernanceCan,
  sourceGovernanceGrantSummary,
  sourceGovernanceVisibilitySummary,
  sourcePermissionRoleLabel,
  computeModuleAlternativeBlockers,
  computeModuleAlternativeCoverage,
  computeModuleAlternativesAreBlocked,
  connectorAgentFailuresForSource,
  connectorAgentHealthLabel,
  connectorAgentsForSource,
  validateTableExportSettings,
  validateStreamingExportSettings,
  validateEgressPolicy,
  workerLabel,
  type BatchSyncDef,
  type BulkRegistrationItem,
  type ConnectionRegistration,
  type CreateStreamingSyncRequest,
  type CdcStartPosition,
  type CdcDownstreamIntegrationStatus,
  type CdcSyncInputKind,
  type CreateWebhookRequest,
  type DataConnectionHealthCheck,
  type DataConnectionHealthState,
  type DataConnectionHealthSummary,
  type DataConnectionStreamResource,
  type DataExport,
  type DataExportMode,
  type DataExportType,
  type FileExportOverwriteBehavior,
  type FileExportSourceFile,
  type StreamingExportReplayBehavior,
  type StreamingExportStartOffset,
  type TableExportColumn,
  type ConnectorCatalogEntry,
  type Credential,
  type CredentialKind,
  type DiscoveredSource,
  type ExplorationNode,
  type ExplorationSession,
  type AgentProxyMode,
  type CredentialStorageMode,
  type EgressEndpointKind,
  type EgressPolicyKind,
  type EgressProtocol,
  type EgressPortKind,
  type NetworkEgressPolicy,
  type RegistrationMode,
  type Source,
  type ConnectorAgent,
  type ComputeModuleAlternative,
  type ExternalTransformPattern,
  type SourceCodeImport,
  type SourceCodeImportBuildResolution,
  type SourceCodeRepositoryImport,
  type SourceGovernance,
  type SourceGovernanceAuditEvent,
  type SourcePermissionGrant,
  type SourceWorker,
  type FileSyncMode,
  type SyncCapabilityType,
  type SyncRun,
  type SyncTransactionMode,
  type SyncWriteMode,
  type StreamingStartOffset,
  type StreamingRuntimeKind,
  type StreamingSyncSetup,
  type StreamLiveRow,
  type WebhookDefinition,
  type WebhookHttpMethod,
  type WebhookInvocationRecord,
  type WebhookOutputParameterMetadata,
  type WebhookParameterMetadata,
  type TableBatchSyncMode,
  type TableBatchSyncSelection,
  type TestConnectionResult,
  type RetryBackoffPolicy,
  type RetryFailureCategory,
  type RetryRecoverySummary,
  type SourceRetryPolicy,
  type MediaSetSyncRun,
  type MediaSetSyncWithUsage,
  type MediaSetSyncHandoffDelegation,
  type VirtualMediaHandoffDescriptor,
  type ListenerInboundDescriptor,
  type ConnectorCapabilityPack,
  type ConnectorCapability,
  type StreamMetricsSnapshot,
  type StreamMetricsWindow,
  type StreamReplayPlan,
  type DeadLetterSink,
  type DeadLetterSinkKind,
  type DeadLetterRedactionRule,
  type QuarantineSummary,
  type QuarantineFailureCategory,
  RETRY_FAILURE_CATEGORIES,
  defaultRetryBackoffPolicy,
  retryDecisionActionLabel,
  retryFailureCategoryLabel,
  connectorSupportsMediaSync,
  formatMediaSetSyncBytes,
  mediaSetSyncRunStatusLabel,
  summarizeMediaSetSyncUsage,
  virtualMediaHandoffBlockers,
  virtualMediaHandoffCoverage,
  virtualMediaHandoffsAreBlocked,
  virtualMediaHandoffModeLabel,
  listenerInboundBlockers,
  listenerInboundCapabilitiesAreBlocked,
  listenerInboundCoverage,
  listenerInboundFacetLabel,
  connectorCapabilityFamilyLabel,
  connectorCapabilityPackChips,
  connectorCapabilityPackEffectiveFlags,
  formatStreamRate,
  streamMetricsHasWarning,
  streamMetricsInputFromResource,
  streamMetricsWindowLabel,
  sortStreamReplayImpactsBySeverity,
  streamReplayDownstreamKindLabel,
  streamReplayImpactSeverityLabel,
  quarantineFailureCategoryLabel,
  validateDeadLetterSink,
} from '@/lib/api/data-connection';
import type { VirtualTableProvider } from '@/lib/api/virtual-tables';

type Tab =
  | 'overview' | 'health' | 'retries'
  | 'name-location' | 'configuration' | 'credentials' | 'networking' | 'capabilities' | 'permissions'
  | 'export-config' | 'code-import-config' | 'output-folder'
  | 'explore'
  | 'syncs' | 'streams' | 'exports' | 'webhooks' | 'virtual-tables' | 'code-imports' | 'media-syncs'
  | 'history';

type OuterTab = 'overview' | 'connection-settings' | 'edit-syncs' | 'explore-source' | 'logs';

const OUTER_TABS: { id: OuterTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'connection-settings', label: 'Connection settings' },
  { id: 'edit-syncs', label: 'Edit syncs' },
  { id: 'explore-source', label: 'Explore source' },
  { id: 'logs', label: 'Logs' },
];

const TAB_TO_OUTER: Record<Tab, OuterTab> = {
  overview: 'overview',
  health: 'overview',
  retries: 'overview',
  'name-location': 'connection-settings',
  configuration: 'connection-settings',
  credentials: 'connection-settings',
  networking: 'connection-settings',
  capabilities: 'connection-settings',
  permissions: 'connection-settings',
  'export-config': 'connection-settings',
  'code-import-config': 'connection-settings',
  'output-folder': 'connection-settings',
  syncs: 'edit-syncs',
  streams: 'edit-syncs',
  exports: 'edit-syncs',
  webhooks: 'edit-syncs',
  'virtual-tables': 'edit-syncs',
  'code-imports': 'edit-syncs',
  'media-syncs': 'edit-syncs',
  explore: 'explore-source',
  history: 'logs',
};

const OUTER_DEFAULT_TAB: Record<OuterTab, Tab> = {
  overview: 'overview',
  'connection-settings': 'configuration',
  'edit-syncs': 'syncs',
  'explore-source': 'explore',
  logs: 'history',
};

const OVERVIEW_SUBS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'health', label: 'Health' },
  { id: 'retries', label: 'Retries' },
];

const CONNECTION_SETTINGS_SIDEBAR: { id: Tab; label: string }[] = [
  { id: 'name-location', label: 'Name and location' },
  { id: 'configuration', label: 'Connection details' },
  { id: 'export-config', label: 'Export configuration' },
  { id: 'code-import-config', label: 'Code import configuration' },
  { id: 'output-folder', label: 'Output folder' },
];

const EDIT_SYNCS_SUBS: { id: Tab; label: string }[] = [
  { id: 'syncs', label: 'Syncs' },
  { id: 'streams', label: 'Streams' },
  { id: 'exports', label: 'Exports' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'virtual-tables', label: 'Virtual tables' },
  { id: 'media-syncs', label: 'Media syncs' },
  { id: 'code-imports', label: 'Code imports' },
];

const WORKER_CHOICES: SourceWorker[] = ['foundry', 'agent'];
const CREDENTIAL_KINDS: CredentialKind[] = [
  'username_password',
  'api_key',
  'bearer_token',
  'oauth_client_secret',
  'cloud_identity',
  'certificate_key',
  'connector_specific',
  'service_account_json',
];
const STORAGE_MODES: CredentialStorageMode[] = ['encrypted_secret', 'external_secret_reference', 'cloud_identity_reference'];
const EGRESS_PROTOCOLS: EgressProtocol[] = ['tcp', 'tls', 'http', 'https'];
const PROXY_MODES: AgentProxyMode[] = ['none', 'http_connect', 'socks5', 'mtls_tunnel'];
const SYNC_CAPABILITIES: SyncCapabilityType[] = ['batch_sync', 'streaming_sync', 'cdc_sync', 'media_sync'];
const SYNC_WRITE_MODES: SyncWriteMode[] = ['snapshot', 'append', 'upsert', 'incremental'];
const SYNC_TRANSACTION_MODES: SyncTransactionMode[] = ['transactional', 'external_checkpoint', 'non_transactional'];
const FILE_SYNC_MODES: FileSyncMode[] = ['snapshot_mirror', 'incremental_append', 'historical_snapshot_incremental'];
const TABLE_SYNC_MODES: TableBatchSyncMode[] = ['full_snapshot', 'incremental'];
const STREAMING_START_OFFSETS: StreamingStartOffset[] = ['latest', 'earliest', 'timestamp', 'offset'];
const STREAMING_RUNTIMES: StreamingRuntimeKind[] = ['foundry_streaming', 'flink', 'spark_structured_streaming', 'agent_runtime'];
const CDC_START_POSITIONS: CdcStartPosition[] = ['initial_snapshot', 'latest', 'timestamp', 'lsn', 'offset'];
const DATA_EXPORT_TYPES: DataExportType[] = ['file', 'table', 'streaming'];
const DATA_EXPORT_MODES: Record<DataExportType, DataExportMode[]> = {
  file: ['incremental', 'snapshot'],
  table: ['mirror', 'full_snapshot', 'full_snapshot_truncate', 'incremental', 'incremental_truncate', 'incremental_append_only'],
  streaming: ['continuous'],
};
const FILE_EXPORT_OVERWRITE_BEHAVIORS: FileExportOverwriteBehavior[] = ['overwrite_existing', 'fail_if_exists', 'skip_existing', 'connector_default'];
const STREAMING_EXPORT_REPLAY_BEHAVIORS: StreamingExportReplayBehavior[] = ['export_replayed_records', 'skip_replayed_records'];
const STREAMING_EXPORT_START_OFFSETS: StreamingExportStartOffset[] = ['previous_export_offset', 'latest', 'earliest', 'explicit'];
const DEFAULT_TABLE_EXPORT_SCHEMA_JSON = JSON.stringify([
  { name: 'ORDER_ID', foundry_type: 'BIGINT', external_type: 'BIGINT', nullable: false },
  { name: 'UPDATED_AT', foundry_type: 'TIMESTAMP', external_type: 'TIMESTAMP', nullable: true },
], null, 2);
const WEBHOOK_METHODS: WebhookHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];


const CONNECTOR_PROVIDER: Record<string, VirtualTableProvider> = {
  abfs: 'AZURE_ABFS',
  adls: 'AZURE_ABFS',
  azure_blob: 'AZURE_ABFS',
  bigquery: 'BIGQUERY',
  databricks: 'DATABRICKS',
  foundry_iceberg: 'FOUNDRY_ICEBERG',
  gcs: 'GCS',
  google_cloud_storage: 'GCS',
  iceberg: 'FOUNDRY_ICEBERG',
  onelake: 'AZURE_ABFS',
  open_table_catalog: 'FOUNDRY_ICEBERG',
  s3: 'AMAZON_S3',
  snowflake: 'SNOWFLAKE',
};

function virtualTableProviderFor(connectorType: string): VirtualTableProvider | null {
  return CONNECTOR_PROVIDER[connectorType.toLowerCase()] ?? null;
}

function discoveredLabel(source: DiscoveredSource): string {
  return source.display_name || source.selector;
}

function sourceCapabilities(source: Source, registryEntry: ConnectorCatalogEntry | null) {
  return source.supported_capabilities && source.supported_capabilities.length > 0
    ? source.supported_capabilities
    : registryEntry?.capabilities ?? [];
}

function ownerLabel(source: Source): string {
  return source.owner_name ?? source.owner_id ?? 'Unassigned owner';
}

function sourceHealth(source: Source) {
  return source.health ?? {
    state: source.status,
    last_checked_at: source.updated_at,
    recent_failures: source.status === 'error' || source.status === 'degraded' ? 1 : 0,
    message: source.status === 'healthy' ? 'Source is healthy.' : null,
  };
}

function sourceUsage(source: Source) {
  return source.usage ?? {
    sync_count: 0,
    export_count: 0,
    webhook_count: 0,
    virtual_table_count: 0,
    code_import_count: 0,
    last_used_at: source.last_sync_at,
  };
}

function healthStateStyle(state: DataConnectionHealthState): CSSProperties {
  switch (state) {
    case 'critical':
      return { background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
    case 'warning':
      return { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' };
    case 'unknown':
      return { background: '#e5e7eb', color: '#374151', borderColor: '#d1d5db' };
    case 'ok':
      return { background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' };
  }
}

function healthStateChip(state: DataConnectionHealthState): CSSProperties {
  return {
    ...healthStateStyle(state),
    border: '1px solid',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
  };
}

function healthCheckResourceLabel(check: DataConnectionHealthCheck): string {
  return check.resource_name || check.resource_rid || check.resource_id || dataConnectionHealthSurfaceLabel(check.surface);
}

function sourceAudit(source: Source) {
  return source.audit ?? {
    created_by: null,
    updated_by: null,
    last_event_id: null,
  };
}

function parseCsvLines(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)));
}

function parseNameValueLines(raw: string) {
  return raw.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.includes(':') ? ':' : '=';
    const [name, ...rest] = line.split(separator);
    return { name: name.trim(), value: rest.join(separator).trim() };
  }).filter((item) => item.name);
}

function makeDraftPolicyForValidation({
  kind,
  host,
  port,
  protocol,
  proxyMode,
  agents,
  allowedOrganizations,
}: {
  kind: EgressPolicyKind;
  host: string;
  port: string;
  protocol: EgressProtocol;
  proxyMode: AgentProxyMode;
  agents?: string[];
  allowedOrganizations: string[];
}) {
  return {
    kind,
    address: { kind: 'host' as EgressEndpointKind, value: host },
    port: { kind: 'single' as EgressPortKind, value: port },
    protocol,
    proxy_mode: kind === 'agent_proxy' ? proxyMode : 'none' as AgentProxyMode,
    agents: agents ?? [],
    state: 'pending_approval' as const,
    status: 'pending_approval' as const,
    allowed_organizations: allowedOrganizations,
  };
}

export function SourceDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [outerTab, setOuterTab] = useState<OuterTab>('overview');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [computePopoverOpen, setComputePopoverOpen] = useState(false);
  const [migrateWizardOpen, setMigrateWizardOpen] = useState(false);
  const computePillRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const expected = TAB_TO_OUTER[tab];
    setOuterTab((current) => (current === expected ? current : expected));
  }, [tab]);
  const [source, setSource] = useState<Source | null>(null);
  const [agents, setAgents] = useState<ConnectorAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProjectRid, setEditProjectRid] = useState('');
  const [editFolderRid, setEditFolderRid] = useState('');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editWorker, setEditWorker] = useState<SourceWorker>('foundry');
  const [editOutputLocation, setEditOutputLocation] = useState('');
  const [duplicateName, setDuplicateName] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  // networking
  const [attached, setAttached] = useState<NetworkEgressPolicy[]>([]);
  const [available, setAvailable] = useState<NetworkEgressPolicy[]>([]);
  const [pickPolicyId, setPickPolicyId] = useState('');
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyKind, setNewPolicyKind] = useState<EgressPolicyKind>('direct');
  const [newPolicyHost, setNewPolicyHost] = useState('');
  const [newPolicyPort, setNewPolicyPort] = useState('443');
  const [newPolicyProtocol, setNewPolicyProtocol] = useState<EgressProtocol>('https');
  const [newPolicyProxyMode, setNewPolicyProxyMode] = useState<AgentProxyMode>('none');
  const [newPolicyOrgs, setNewPolicyOrgs] = useState('');

  // credentials
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credKind, setCredKind] = useState<CredentialKind>('api_key');
  const [credValue, setCredValue] = useState('');
  const [credStorageMode, setCredStorageMode] = useState<CredentialStorageMode>('encrypted_secret');
  const [credExternalRef, setCredExternalRef] = useState('');
  const [credCloudIdentityRef, setCredCloudIdentityRef] = useState('');
  const [credVersion, setCredVersion] = useState('v1');

  // test
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [sourceHealthSummary, setSourceHealthSummary] = useState<DataConnectionHealthSummary | null>(null);
  const [retryPolicy, setRetryPolicy] = useState<SourceRetryPolicy | null>(null);
  const [retryRecovery, setRetryRecovery] = useState<RetryRecoverySummary | null>(null);
  const [retryDraft, setRetryDraft] = useState<Partial<Record<RetryFailureCategory, RetryBackoffPolicy>>>({});
  const [retryDirty, setRetryDirty] = useState(false);

  // registrations / discovery
  const [registrations, setRegistrations] = useState<ConnectionRegistration[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSource[]>([]);
  const [selectedSelectors, setSelectedSelectors] = useState<Record<string, boolean>>({});
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('sync');
  const [autoSync, setAutoSync] = useState(false);
  const [updateDetection, setUpdateDetection] = useState(true);
  const [targetDatasetId, setTargetDatasetId] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationErrors, setRegistrationErrors] = useState<Array<{ selector: string; error: string }>>([]);
  const [explorationSession, setExplorationSession] = useState<ExplorationSession | null>(null);
  const [explorationNodes, setExplorationNodes] = useState<ExplorationNode[]>([]);
  const [exploreSelector, setExploreSelector] = useState('');
  const [includeSamples, setIncludeSamples] = useState(false);
  const [nextExploreCursor, setNextExploreCursor] = useState<string | null>(null);

  // syncs / runs
  const [syncs, setSyncs] = useState<BatchSyncDef[]>([]);
  const [runsBySync, setRunsBySync] = useState<Record<string, SyncRun[]>>({});
  const [streams, setStreams] = useState<DataConnectionStreamResource[]>([]);
  const [streamingSyncs, setStreamingSyncs] = useState<StreamingSyncSetup[]>([]);
  const [newSyncCapability, setNewSyncCapability] = useState<SyncCapabilityType>('batch_sync');
  const [newOutputDataset, setNewOutputDataset] = useState('');
  const [createOutputDataset, setCreateOutputDataset] = useState(true);
  const [newSourceSelector, setNewSourceSelector] = useState('');
  const [newFileGlob, setNewFileGlob] = useState('');
  const [newWriteMode, setNewWriteMode] = useState<SyncWriteMode>('snapshot');
  const [newTransactionMode, setNewTransactionMode] = useState<SyncTransactionMode>('transactional');
  const [newBuildIntegration, setNewBuildIntegration] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');
  const [fileSyncMode, setFileSyncMode] = useState<FileSyncMode>('snapshot_mirror');
  const [excludeAlreadySynced, setExcludeAlreadySynced] = useState(false);
  const [fileCountLimit, setFileCountLimit] = useState('');
  const [includeGlobsRaw, setIncludeGlobsRaw] = useState('');
  const [excludeGlobsRaw, setExcludeGlobsRaw] = useState('');
  const [includePathMetadata, setIncludePathMetadata] = useState(true);
  const [pathMetadataColumnsRaw, setPathMetadataColumnsRaw] = useState('source_path,source_filename');
  const [historicalCutoff, setHistoricalCutoff] = useState('');
  const [incrementalRecentWindow, setIncrementalRecentWindow] = useState('P7D');
  const [tableSyncMode, setTableSyncMode] = useState<TableBatchSyncMode>('full_snapshot');
  const [tableNamesRaw, setTableNamesRaw] = useState('');
  const [tableIncrementalColumn, setTableIncrementalColumn] = useState('');
  const [inferTableSchema, setInferTableSchema] = useState(true);
  const [estimatedRowCount, setEstimatedRowCount] = useState('');
  const [cdcInputKind, setCdcInputKind] = useState<CdcSyncInputKind>('relational_connector');
  const [cdcSourceDatabase, setCdcSourceDatabase] = useState('');
  const [cdcSourceSchema, setCdcSourceSchema] = useState('');
  const [cdcSourceTable, setCdcSourceTable] = useState('');
  const [cdcSourceTopic, setCdcSourceTopic] = useState('');
  const [cdcPrimaryKeysRaw, setCdcPrimaryKeysRaw] = useState('id');
  const [cdcOrderingColumn, setCdcOrderingColumn] = useState('updated_at');
  const [cdcDeletionColumn, setCdcDeletionColumn] = useState('is_deleted');
  const [cdcOutputStream, setCdcOutputStream] = useState('');
  const [cdcSchemaJson, setCdcSchemaJson] = useState('[{"name":"id","source_type":"text","foundry_type":"String","nullable":false},{"name":"updated_at","source_type":"timestamp","foundry_type":"Timestamp","nullable":false},{"name":"is_deleted","source_type":"boolean","foundry_type":"Boolean","nullable":false}]');
  const [cdcStartPosition, setCdcStartPosition] = useState<CdcStartPosition>('initial_snapshot');
  const [cdcStartPositionValue, setCdcStartPositionValue] = useState('');
  const [cdcDatabaseEnabled, setCdcDatabaseEnabled] = useState(false);
  const [cdcTableEnabled, setCdcTableEnabled] = useState(false);
  const [cdcChangelogShapeValidated, setCdcChangelogShapeValidated] = useState(false);
  const [cdcMetadataJson, setCdcMetadataJson] = useState('{"snapshot_mode":"initial","properties":{}}');
  const [streamTopic, setStreamTopic] = useState('');
  const [streamConsumerGroup, setStreamConsumerGroup] = useState('');
  const [streamKeyFieldsRaw, setStreamKeyFieldsRaw] = useState('');
  const [streamStartOffset, setStreamStartOffset] = useState<StreamingStartOffset>('latest');
  const [streamStartOffsetValue, setStreamStartOffsetValue] = useState('');
  const [streamConsistency, setStreamConsistency] = useState<'AT_LEAST_ONCE' | 'EXACTLY_ONCE'>('AT_LEAST_ONCE');
  const [streamCheckpointInterval, setStreamCheckpointInterval] = useState('60000');
  const [streamOutputLocation, setStreamOutputLocation] = useState('');
  const [streamRuntime, setStreamRuntime] = useState<StreamingRuntimeKind>('foundry_streaming');
  const [streamSourceExactlyOnce, setStreamSourceExactlyOnce] = useState(true);
  const [streamSinkExactlyOnce, setStreamSinkExactlyOnce] = useState(true);
  const [pushStreamId, setPushStreamId] = useState('');
  const [pushDatasetRid, setPushDatasetRid] = useState('');
  const [pushBranch, setPushBranch] = useState('master');
  const [pushTokenRef, setPushTokenRef] = useState('');
  const [pushIdempotencyKey, setPushIdempotencyKey] = useState('');
  const [pushRecordsJson, setPushRecordsJson] = useState('[{"sensor_id":"sensor-1","temperature":72.5}]');
  const [pushSourceConnectorExists, setPushSourceConnectorExists] = useState(false);
  const [pushCanAuthenticate, setPushCanAuthenticate] = useState(true);
  const [pushConformsToSchema, setPushConformsToSchema] = useState(true);

  // exports
  const [dataExports, setDataExports] = useState<DataExport[]>([]);
  const [newExportType, setNewExportType] = useState<DataExportType>('table');
  const [newExportMode, setNewExportMode] = useState<DataExportMode>('mirror');
  const [newExportName, setNewExportName] = useState('');
  const [exportInputDataset, setExportInputDataset] = useState('');
  const [exportInputStream, setExportInputStream] = useState('');
  const [exportDestination, setExportDestination] = useState('');
  const [exportScheduleCron, setExportScheduleCron] = useState('');
  const [exportAllowedMarkings, setExportAllowedMarkings] = useState('public');
  const [exportAllowedOrganizations, setExportAllowedOrganizations] = useState('');
  const [exportConfigJson, setExportConfigJson] = useState('{}');
  const [fileOverwriteBehavior, setFileOverwriteBehavior] = useState<FileExportOverwriteBehavior>('overwrite_existing');
  const [fileDestinationSubfolder, setFileDestinationSubfolder] = useState('');
  const [filePreserveDirectory, setFilePreserveDirectory] = useState(true);
  const [fileFullReexport, setFileFullReexport] = useState(false);
  const [fileManifestJson, setFileManifestJson] = useState('[{"path":"part-000.parquet","size_bytes":0,"modified_at":"2026-05-13T00:00:00Z","transaction_id":"tx-1"}]');
  const [tableInputParquetBacked, setTableInputParquetBacked] = useState(true);
  const [tableDestinationExists, setTableDestinationExists] = useState(true);
  const [tableTruncatePermission, setTableTruncatePermission] = useState(true);
  const [tableRowCountEstimate, setTableRowCountEstimate] = useState('0');
  const [tableDatasetSchemaJson, setTableDatasetSchemaJson] = useState(DEFAULT_TABLE_EXPORT_SCHEMA_JSON);
  const [tableDestinationSchemaJson, setTableDestinationSchemaJson] = useState(DEFAULT_TABLE_EXPORT_SCHEMA_JSON);
  const [exportStreamingReplayBehavior, setExportStreamingReplayBehavior] = useState<StreamingExportReplayBehavior>('export_replayed_records');
  const [exportStreamingStartOffset, setExportStreamingStartOffset] = useState<StreamingExportStartOffset>('previous_export_offset');
  const [exportStreamingStartOffsetValue, setExportStreamingStartOffsetValue] = useState('');
  const [exportStreamingLastOffset, setExportStreamingLastOffset] = useState('');
  const [exportStreamingScheduleRestart, setExportStreamingScheduleRestart] = useState(true);
  const [exportStreamingRecordsEstimate, setExportStreamingRecordsEstimate] = useState('0');
  const [exportStreamingReplayDetected, setExportStreamingReplayDetected] = useState(false);

  // webhooks
  const [webhooks, setWebhooks] = useState<WebhookDefinition[]>([]);
  const [webhookName, setWebhookName] = useState('');
  const [webhookMethod, setWebhookMethod] = useState<WebhookHttpMethod>('POST');
  const [webhookPath, setWebhookPath] = useState('/');
  const [webhookQueryRaw, setWebhookQueryRaw] = useState('');
  const [webhookHeadersRaw, setWebhookHeadersRaw] = useState('Content-Type: application/json');
  const [webhookBody, setWebhookBody] = useState('{}');
  const [webhookAuthRef, setWebhookAuthRef] = useState('');
  const [webhookTimeoutMs, setWebhookTimeoutMs] = useState('30000');
  const [webhookRetryAttempts, setWebhookRetryAttempts] = useState('3');
  const [webhookInputsJson, setWebhookInputsJson] = useState('[{"name":"request_id","type":"string","required":true}]');
  const [webhookOutputsJson, setWebhookOutputsJson] = useState('[{"name":"status","type":"integer","extractor":{"kind":"http_status"}}]');
  const [webhookInvocations, setWebhookInvocations] = useState<Record<string, WebhookInvocationRecord[]>>({});

  // code imports
  const [sourceCodeImport, setSourceCodeImport] = useState<SourceCodeImport | null>(null);
  const [codeImportEnabled, setCodeImportEnabled] = useState(false);
  const [codeImportFriendlyName, setCodeImportFriendlyName] = useState('');
  const [codeImportPythonIdentifier, setCodeImportPythonIdentifier] = useState('');
  const [codeImportRepositoriesJson, setCodeImportRepositoriesJson] = useState('[]');
  const [codeImportAllowFoundryInputs, setCodeImportAllowFoundryInputs] = useState(false);
  const [codeImportAllowedMarkings, setCodeImportAllowedMarkings] = useState('');
  const [codeImportAllowedOrganizations, setCodeImportAllowedOrganizations] = useState('');
  const [codeImportResolution, setCodeImportResolution] = useState<SourceCodeImportBuildResolution | null>(null);

  // permissions and governance
  const [sourceGovernance, setSourceGovernance] = useState<SourceGovernance | null>(null);
  const [sourceGovernanceAudit, setSourceGovernanceAudit] = useState<SourceGovernanceAuditEvent[]>([]);
  const [permissionGrantsJson, setPermissionGrantsJson] = useState('[]');
  const [permissionReason, setPermissionReason] = useState('');

  // media-syncs
  const [mediaSyncs, setMediaSyncs] = useState<MediaSetSyncWithUsage[]>([]);
  const [mediaSyncHistory, setMediaSyncHistory] = useState<Record<string, MediaSetSyncRun[]>>({});
  const [mediaSyncHandoffDelegation, setMediaSyncHandoffDelegation] = useState<MediaSetSyncHandoffDelegation | null>(null);
  const [openMediaSyncId, setOpenMediaSyncId] = useState<string | null>(null);
  const [virtualMediaHandoff, setVirtualMediaHandoff] = useState<VirtualMediaHandoffDescriptor | null>(null);
  const [listenerInbound, setListenerInbound] = useState<ListenerInboundDescriptor | null>(null);
  const [capabilityPack, setCapabilityPack] = useState<ConnectorCapabilityPack | null>(null);
  const [streamMetrics, setStreamMetrics] = useState<Record<string, StreamMetricsSnapshot>>({});
  const [streamMetricsWindow, setStreamMetricsWindow] = useState<StreamMetricsWindow>('1m');
  const [streamReplayDrafts, setStreamReplayDrafts] = useState<Record<string, { reason: string; fromOffset: string; toOffset: string; acks: Record<string, boolean> }>>({});
  const [streamReplayPlans, setStreamReplayPlans] = useState<Record<string, StreamReplayPlan>>({});
  const [streamReplayBusy, setStreamReplayBusy] = useState<Record<string, boolean>>({});
  const [deadLetterSinks, setDeadLetterSinks] = useState<Record<string, DeadLetterSink>>({});
  const [deadLetterDrafts, setDeadLetterDrafts] = useState<Record<string, { kind: DeadLetterSinkKind; targetRid: string; retentionDays: string; rules: DeadLetterRedactionRule[] }>>({});
  const [quarantineSummaries, setQuarantineSummaries] = useState<Record<string, QuarantineSummary>>({});
  const [quarantineSelection, setQuarantineSelection] = useState<Record<string, Record<string, boolean>>>({});
  const [quarantineBusy, setQuarantineBusy] = useState<Record<string, boolean>>({});
  const [quarantineExpanded, setQuarantineExpanded] = useState<Record<string, boolean>>({});

  const catalogEntry: ConnectorCatalogEntry | undefined = source
    ? FALLBACK_CONNECTOR_CATALOG.find((e) => e.type === source.connector_type)
    : undefined;
  const registryEntry = catalogEntry ? getConnectorRegistryEntry(catalogEntry) : null;
  const virtualTableProvider = source ? virtualTableProviderFor(source.connector_type) : null;
  const selectedDiscovered = discovered.filter((d) => selectedSelectors[d.selector]);

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      const [loaded, loadedAgents] = await Promise.all([
        dataConnection.getSource(id),
        dataConnection.listConnectorAgents().catch(() => [] as ConnectorAgent[]),
      ]);
      setSource(loaded);
      setAgents(loadedAgents);
      setEditName(loaded.name);
      setEditDescription(loaded.description ?? '');
      setEditProjectRid(loaded.project_rid ?? '');
      setEditFolderRid(loaded.folder_rid ?? '');
      setEditOwnerId(loaded.owner_id ?? '');
      setEditWorker(loaded.worker);
      setEditOutputLocation(loaded.default_output_location ?? '');
      setDuplicateName(`${loaded.name} copy`);
      setCdcInputKind(cdcInputKindForConnector(loaded.connector_type) ?? 'relational_connector');
      void dataConnection
        .getConnectorCapabilityPack(loaded.connector_type)
        .then(setCapabilityPack)
        .catch(() => setCapabilityPack(null));
      const preferredExportType = DATA_EXPORT_TYPES.find((type) => sourceSupportsExportType(loaded, type)) ?? 'table';
      setNewExportType(preferredExportType);
      setNewExportMode(defaultExportModeForType(preferredExportType));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load source');
    } finally {
      setLoading(false);
    }
  }

  async function loadNetworking() {
    try {
      const [att, all, loadedAgents] = await Promise.all([
        dataConnection.listSourcePolicies(id),
        dataConnection.listEgressPolicies(),
        dataConnection.listConnectorAgents().catch(() => [] as ConnectorAgent[]),
      ]);
      setAttached(att);
      setAgents(loadedAgents);
      const attachedIds = new Set(att.map((p) => p.id));
      setAvailable(all.filter((p) => !attachedIds.has(p.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load networking');
    }
  }

  async function loadCredentials() {
    try {
      setCredentials(await dataConnection.listCredentials(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load credentials');
    }
  }

  async function loadRegistrations() {
    setRegistrationsLoading(true);
    try {
      setRegistrations(await dataConnection.listRegistrations(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load registrations');
    } finally {
      setRegistrationsLoading(false);
    }
  }

  async function loadSyncs() {
    try {
      const list = await dataConnection.listSyncs(id);
      setSyncs(list);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load syncs');
    }
  }

  async function loadSyncQuarantine(syncId: string) {
    try {
      const [sink, summary] = await Promise.all([
        dataConnection.getDeadLetterSink(syncId).catch(() => null),
        dataConnection.listQuarantinedRecords(syncId).catch(() => null),
      ]);
      if (sink) {
        setDeadLetterSinks((prev) => ({ ...prev, [syncId]: sink }));
        setDeadLetterDrafts((prev) => ({
          ...prev,
          [syncId]: prev[syncId] ?? {
            kind: (sink.kind as DeadLetterSinkKind) || 'dataset',
            targetRid: sink.target_rid,
            retentionDays: String(sink.retention_days),
            rules: sink.redaction_rules ?? [],
          },
        }));
      }
      if (summary) {
        setQuarantineSummaries((prev) => ({ ...prev, [syncId]: summary }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load quarantine');
    }
  }

  function quarantineDraft(syncId: string) {
    return deadLetterDrafts[syncId] ?? { kind: 'dataset' as DeadLetterSinkKind, targetRid: '', retentionDays: '14', rules: [] };
  }

  function updateDeadLetterDraft(syncId: string, patch: Partial<{ kind: DeadLetterSinkKind; targetRid: string; retentionDays: string; rules: DeadLetterRedactionRule[] }>) {
    setDeadLetterDrafts((prev) => ({
      ...prev,
      [syncId]: { ...quarantineDraft(syncId), ...patch },
    }));
  }

  async function saveDeadLetterSink(syncId: string) {
    const draft = quarantineDraft(syncId);
    const body = {
      kind: draft.kind,
      target_rid: draft.targetRid.trim(),
      retention_days: Number(draft.retentionDays) || 14,
      redaction_rules: draft.rules.filter((r) => r.field.trim() !== ''),
    };
    const errs = validateDeadLetterSink(body);
    if (errs.length > 0) {
      setError(errs.join('; '));
      return;
    }
    setQuarantineBusy((prev) => ({ ...prev, [syncId]: true }));
    try {
      const stored = await dataConnection.updateDeadLetterSink(syncId, body);
      setDeadLetterSinks((prev) => ({ ...prev, [syncId]: stored }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save dead-letter sink');
    } finally {
      setQuarantineBusy((prev) => ({ ...prev, [syncId]: false }));
    }
  }

  function toggleQuarantineSelection(syncId: string, recordId: string) {
    setQuarantineSelection((prev) => {
      const current = prev[syncId] ?? {};
      return { ...prev, [syncId]: { ...current, [recordId]: !current[recordId] } };
    });
  }

  async function replayQuarantine(syncId: string) {
    const selected = quarantineSelection[syncId] ?? {};
    const ids = Object.entries(selected).filter(([, on]) => on).map(([id]) => id);
    if (ids.length === 0) {
      setError('Select at least one quarantined record to replay.');
      return;
    }
    setQuarantineBusy((prev) => ({ ...prev, [syncId]: true }));
    try {
      const plan = await dataConnection.replayQuarantinedRecords(syncId, { record_ids: ids });
      if ((plan.blocking_reasons ?? []).length > 0) {
        setError('Replay blocked: ' + plan.blocking_reasons!.join(', '));
      }
      await loadSyncQuarantine(syncId);
      setQuarantineSelection((prev) => ({ ...prev, [syncId]: {} }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to replay quarantine');
    } finally {
      setQuarantineBusy((prev) => ({ ...prev, [syncId]: false }));
    }
  }

  function toggleQuarantineExpanded(syncId: string) {
    setQuarantineExpanded((prev) => {
      const next = !prev[syncId];
      if (next && !quarantineSummaries[syncId]) {
        void loadSyncQuarantine(syncId);
      }
      return { ...prev, [syncId]: next };
    });
  }

  async function loadStreams() {
    try {
      const [list, listenerDescriptor] = await Promise.all([
        dataConnection.listSourceStreams(id),
        listenerInbound
          ? Promise.resolve(listenerInbound)
          : dataConnection.getListenerInboundDescriptor(id).catch(() => null),
      ]);
      setStreams(list);
      if (listenerDescriptor) setListenerInbound(listenerDescriptor);
      if (!pushStreamId && list[0]) {
        setPushStreamId(list[0].id);
        setPushDatasetRid(list[0].rid ?? list[0].id);
        setPushBranch(list[0].branch);
      }
      void loadStreamMetricsForList(list, streamMetricsWindow);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load streams');
    }
  }

  async function loadStreamMetricsForList(list: DataConnectionStreamResource[], window: StreamMetricsWindow) {
    const updates: Record<string, StreamMetricsSnapshot> = {};
    await Promise.all(list.map(async (stream) => {
      try {
        const input = streamMetricsInputFromResource(stream, window);
        const snapshot = await dataConnection.computeStreamMetricsSnapshot(input);
        updates[stream.id] = snapshot;
      } catch (cause) {
        // Surface but never block — metrics are best-effort.
        // eslint-disable-next-line no-console
        console.warn('stream metrics compute failed', stream.id, cause);
      }
    }));
    if (Object.keys(updates).length > 0) {
      setStreamMetrics((prev) => ({ ...prev, ...updates }));
    }
  }

  async function refreshStreamMetrics(window: StreamMetricsWindow) {
    setStreamMetricsWindow(window);
    await loadStreamMetricsForList(streams, window);
  }

  function streamReplayDraft(streamId: string): { reason: string; fromOffset: string; toOffset: string; acks: Record<string, boolean> } {
    return streamReplayDrafts[streamId] ?? { reason: '', fromOffset: '', toOffset: '', acks: {} };
  }

  function updateStreamReplayDraft(streamId: string, patch: Partial<{ reason: string; fromOffset: string; toOffset: string }>) {
    setStreamReplayDrafts((prev) => ({
      ...prev,
      [streamId]: { ...streamReplayDraft(streamId), ...patch },
    }));
  }

  function toggleStreamReplayAck(streamId: string, warningId: string) {
    setStreamReplayDrafts((prev) => {
      const current = prev[streamId] ?? { reason: '', fromOffset: '', toOffset: '', acks: {} };
      const acks = { ...current.acks, [warningId]: !current.acks[warningId] };
      return { ...prev, [streamId]: { ...current, acks } };
    });
  }

  async function evaluateStreamReplayPlan(stream: DataConnectionStreamResource) {
    const draft = streamReplayDraft(stream.id);
    setStreamReplayBusy((prev) => ({ ...prev, [stream.id]: true }));
    try {
      const acknowledgements = Object.entries(draft.acks).filter(([, on]) => on).map(([id]) => id);
      const exports: Array<{ export_id: string; export_name?: string; status: string; replay_behavior?: string; has_active_consumers?: boolean }> = dataExports
        .filter((exp) => exp.export_type === 'streaming' && (exp.input_stream_id === stream.id || exp.input_dataset_rid === stream.rid))
        .map((exp) => ({
          export_id: exp.id,
          export_name: exp.name,
          status: exp.status ?? 'unknown',
          replay_behavior: exp.streaming_export?.replay_behavior,
        }));
      const consumers = (stream.consumers ?? []).map((consumer) => ({
        consumer_id: consumer.id,
        consumer_name: consumer.name,
        consumer_group: consumer.consumer_group ?? undefined,
        idempotency_mode: 'unknown',
      }));
      const cdcViews = stream.cdc_metadata
        ? [{ view_id: stream.id, view_name: stream.name, ordering_column: stream.cdc_metadata.ordering_column, deletion_column: stream.cdc_metadata.deletion_column ?? undefined }]
        : [];
      const plan = await dataConnection.computeStreamReplayPlan({
        stream_id: stream.id,
        stream_rid: stream.rid ?? undefined,
        stream_name: stream.name,
        reason: draft.reason.trim(),
        from_offset: draft.fromOffset === '' ? undefined : Number(draft.fromOffset),
        to_offset: draft.toOffset === '' ? undefined : Number(draft.toOffset),
        earliest_offset: stream.offsets?.earliest_offset ?? undefined,
        latest_offset: stream.offsets?.latest_offset ?? undefined,
        acknowledgements,
        exports,
        cdc_views: cdcViews,
        consumers,
      });
      setStreamReplayPlans((prev) => ({ ...prev, [stream.id]: plan }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to evaluate replay plan');
    } finally {
      setStreamReplayBusy((prev) => ({ ...prev, [stream.id]: false }));
    }
  }

  async function loadHealth() {
    try {
      const [summary, streamList] = await Promise.all([
        dataConnection.getSourceHealth(id),
        dataConnection.listSourceStreams(id).catch(() => streams),
      ]);
      setSourceHealthSummary(summary);
      if (streamList.length > 0) {
        setStreams(streamList);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load health checks');
    }
  }

  async function loadRetryRecovery() {
    try {
      const [policy, recovery] = await Promise.all([
        dataConnection.getSourceRetryPolicy(id),
        dataConnection.getSourceRetryRecovery(id),
      ]);
      setRetryPolicy(policy);
      setRetryRecovery(recovery);
      setRetryDraft({ ...policy.categories });
      setRetryDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load retry policy');
    }
  }

  function getDraftPolicy(category: RetryFailureCategory): RetryBackoffPolicy {
    const existing = retryDraft[category];
    if (existing) return existing;
    const fromServer = retryPolicy?.categories[category];
    return fromServer ?? defaultRetryBackoffPolicy(category);
  }

  function updateRetryDraft(category: RetryFailureCategory, patch: Partial<RetryBackoffPolicy>) {
    setRetryDraft((prev) => ({
      ...prev,
      [category]: { ...getDraftPolicy(category), ...patch },
    }));
    setRetryDirty(true);
  }

  async function saveRetryPolicy() {
    try {
      const updated = await dataConnection.updateSourceRetryPolicy(id, { categories: retryDraft });
      setRetryPolicy(updated);
      setRetryDraft({ ...updated.categories });
      setRetryDirty(false);
      await loadRetryRecovery();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save retry policy');
    }
  }

  async function loadExports() {
    try {
      setDataExports(await dataConnection.listExports(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load exports');
    }
  }

  async function loadRuns(syncId: string) {
    try {
      setRunsBySync((prev) => ({ ...prev, [syncId]: [] }));
      const runs = await dataConnection.listRuns(syncId);
      setRunsBySync((prev) => ({ ...prev, [syncId]: runs }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load runs');
    }
  }

  async function loadWebhooks() {
    try {
      setWebhooks(await dataConnection.listWebhooks(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load webhooks');
    }
  }

  function applySourceCodeImportState(next: SourceCodeImport) {
    setSourceCodeImport(next);
    setCodeImportEnabled(next.enabled);
    setCodeImportFriendlyName(next.friendly_name);
    setCodeImportPythonIdentifier(next.python_identifier);
    setCodeImportRepositoriesJson(JSON.stringify(next.code_repositories ?? [], null, 2));
    setCodeImportAllowFoundryInputs(Boolean(next.export_controls.allow_foundry_inputs));
    setCodeImportAllowedMarkings((next.export_controls.allowed_markings ?? []).join(', '));
    setCodeImportAllowedOrganizations((next.export_controls.allowed_organizations ?? []).join(', '));
    setCodeImportResolution(next.build_start_resolution ?? null);
  }

  async function loadSourceCodeImport() {
    try {
      const loaded = await dataConnection.getSourceCodeImport(id);
      applySourceCodeImportState(loaded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load code imports');
    }
  }

  async function loadSourceGovernance() {
    try {
      const [governance, audit] = await Promise.all([
        dataConnection.getSourceGovernance(id),
        dataConnection.listSourceGovernanceAudit(id, 100).catch(() => [] as SourceGovernanceAuditEvent[]),
      ]);
      setSourceGovernance(governance);
      setSourceGovernanceAudit(audit.length > 0 ? audit : governance.audit_events ?? []);
      setPermissionGrantsJson(JSON.stringify(governance.permission_grants ?? [], null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load source permissions');
    }
  }

  async function saveSourceGovernance() {
    setBusy(true);
    setError('');
    try {
      const parsed = JSON.parse(permissionGrantsJson || '[]') as SourcePermissionGrant[];
      if (!Array.isArray(parsed)) {
        throw new Error('Permission grants must be a JSON array.');
      }
      const updated = await dataConnection.updateSourceGovernance(id, {
        permission_grants: parsed,
        visibility: sourceGovernance?.visibility,
        reason: permissionReason.trim() || undefined,
      });
      setSourceGovernance(updated);
      setSourceGovernanceAudit(updated.audit_events ?? []);
      setPermissionGrantsJson(JSON.stringify(updated.permission_grants ?? [], null, 2));
      setPermissionReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update source permissions');
    } finally {
      setBusy(false);
    }
  }

  async function loadWebhookInvocations(webhookId: string) {
    try {
      const records = await dataConnection.listWebhookInvocations(id, webhookId);
      setWebhookInvocations((prev) => ({ ...prev, [webhookId]: retainWebhookInvocations(records, new Date().toISOString()) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load webhook history');
    }
  }

  async function loadMediaSyncs() {
    try {
      const [list, delegation, virtualHandoff] = await Promise.all([
        dataConnection.listMediaSetSyncs(id),
        mediaSyncHandoffDelegation
          ? Promise.resolve(mediaSyncHandoffDelegation)
          : dataConnection.getMediaSetSyncHandoffDelegation().catch(() => null),
        dataConnection.getVirtualMediaHandoff(id).catch(() => null),
      ]);
      setMediaSyncs(list);
      if (delegation) setMediaSyncHandoffDelegation(delegation);
      setVirtualMediaHandoff(virtualHandoff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load media syncs');
    }
  }

  async function loadMediaSyncHistory(syncId: string) {
    try {
      const runs = await dataConnection.listMediaSetSyncRuns(syncId, 50);
      setMediaSyncHistory((prev) => ({ ...prev, [syncId]: runs }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load media sync history');
    }
  }

  function toggleMediaSync(syncId: string) {
    setOpenMediaSyncId((current) => {
      const next = current === syncId ? null : syncId;
      if (next && !mediaSyncHistory[next]) {
        void loadMediaSyncHistory(next);
      }
      return next;
    });
  }

  useEffect(() => {
    if (id) void loadOverview();
  }, [id]);

  function selectTab(next: Tab) {
    setTab(next);
    if (next === 'health') void loadHealth();
    if (next === 'retries') void loadRetryRecovery();
    if (next === 'networking') void loadNetworking();
    if (next === 'credentials') void loadCredentials();
    if (next === 'explore') void loadRegistrations();
    if (next === 'syncs') void loadSyncs();
    if (next === 'streams') void loadStreams();
    if (next === 'exports') void loadExports();
    if (next === 'webhooks') void loadWebhooks();
    if (next === 'code-imports') void loadSourceCodeImport();
    if (next === 'permissions' || next === 'history') void loadSourceGovernance();
    if (next === 'media-syncs') void loadMediaSyncs();
  }

  async function deleteSource() {
    if (typeof window !== 'undefined' && !window.confirm('Delete source?')) return;
    setBusy(true);
    try {
      await dataConnection.deleteSource(id);
      navigate('/data-connection');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
      setBusy(false);
    }
  }

  async function saveConfiguration() {
    if (registryEntry) {
      const compatibility = validateConnectorWorker(registryEntry, editWorker);
      if (!compatibility.valid) {
        setError(compatibility.reason ?? 'Selected worker is not compatible with this connector.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const updated = await dataConnection.updateSource(id, {
        name: editName.trim() || source?.name,
        description: editDescription.trim() || null,
        project_rid: editProjectRid.trim() || null,
        folder_rid: editFolderRid.trim() || null,
        owner_id: editOwnerId.trim() || null,
        worker: editWorker,
        default_output_location: editOutputLocation.trim() || null,
      });
      setSource(updated);
      setEditOpen(false);
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateSource() {
    if (!duplicateName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const duplicate = await dataConnection.duplicateSource(id, {
        name: duplicateName.trim(),
        description: source?.description ?? undefined,
        project_rid: source?.project_rid ?? undefined,
        folder_rid: source?.folder_rid ?? undefined,
        copy_credentials: true,
        copy_network_policies: true,
      });
      navigate(`/data-connection/sources/${encodeURIComponent(duplicate.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  }

  async function archiveSource() {
    setBusy(true);
    setError('');
    try {
      const archived = await dataConnection.archiveSource(id, { reason: archiveReason.trim() || undefined });
      setSource(archived);
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  }

  async function validateEgressBeforeTest() {
    const expectedKind: EgressPolicyKind = source?.worker === 'agent' ? 'agent_proxy' : 'direct';
    const policies = attached.length > 0 ? attached : await dataConnection.listSourcePolicies(id);
    setAttached(policies);
    const validationIssues = validateEgressPoliciesForConnectionTest(policies, {
      expectedKind,
      organizationId: source?.organization_id,
    }).filter((issue) => issue.severity === 'error');
    if (validationIssues.length > 0) {
      throw new Error(validationIssues.map((issue) => issue.message).join(' '));
    }
  }

  async function testConnection() {
    setBusy(true);
    setError('');
    try {
      await validateEgressBeforeTest();
      setTestResult(await dataConnection.testConnection(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  async function exploreSource(selector = exploreSelector, cursor?: string | null) {
    setBusy(true);
    setError('');
    setRegistrationMessage('');
    try {
      const response = await dataConnection.exploreSource(id, {
        selector: selector.trim() || undefined,
        cursor: cursor ?? undefined,
        include_sample: includeSamples,
        sample_limit: includeSamples ? 10 : 0,
      });
      setExplorationSession(response.session);
      setExplorationNodes(cursor ? [...explorationNodes, ...response.nodes] : response.nodes);
      setNextExploreCursor(response.next_cursor ?? null);
      setRegistrationMessage(`Exploration session ${response.session.id} inspected ${response.nodes.length} node${response.nodes.length === 1 ? '' : 's'} without storing secrets or sample rows.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Explore failed');
    } finally {
      setBusy(false);
    }
  }

  async function discoverRegistrations() {
    setBusy(true);
    setError('');
    setRegistrationMessage('');
    setRegistrationErrors([]);
    try {
      const res = await dataConnection.discoverSources(id);
      const alreadyRegistered = new Set(registrations.map((r) => r.selector));
      const nextSelected: Record<string, boolean> = {};
      for (const item of res.sources) {
        nextSelected[item.selector] = !alreadyRegistered.has(item.selector);
      }
      setDiscovered(res.sources);
      setExplorationNodes(res.sources.map((item) => ({
        selector: item.selector,
        display_name: discoveredLabel(item),
        kind: item.source_kind ?? 'entity',
        supports_sync: item.supports_sync,
        supports_zero_copy: item.supports_zero_copy,
        source_signature: item.source_signature,
        schema: item.schema,
        sample_rows: item.sample_rows,
        sample_redacted: item.sample_redacted ?? true,
        unauthorized_sample_count: item.unauthorized_sample_count ?? 0,
        metadata: item.metadata,
      })));
      setSelectedSelectors(nextSelected);
      setRegistrationMessage(`Discovered ${res.sources.length} registrable source${res.sources.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Discover failed');
    } finally {
      setBusy(false);
    }
  }

  function setAllDiscovered(checked: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of discovered) next[item.selector] = checked;
    setSelectedSelectors(next);
  }

  async function bulkRegisterSelected() {
    if (selectedDiscovered.length === 0) {
      setRegistrationErrors([{ selector: 'selection', error: 'Select at least one discovered source.' }]);
      return;
    }

    const target = targetDatasetId.trim();
    const registrationsBody: BulkRegistrationItem[] = selectedDiscovered.map((item) => ({
      selector: item.selector,
      display_name: discoveredLabel(item),
      source_kind: item.source_kind ?? undefined,
      registration_mode: registrationMode,
      auto_sync: autoSync,
      update_detection: updateDetection,
      target_dataset_id: target || undefined,
      metadata: item.metadata ?? undefined,
    }));

    setBusy(true);
    setRegistrationErrors([]);
    setRegistrationMessage('');
    try {
      const response = await dataConnection.bulkRegister(id, registrationsBody);
      const errors = response.errors ?? [];
      setRegistrationErrors(errors);
      setRegistrationMessage(`Registered ${response.created.length} source${response.created.length === 1 ? '' : 's'}${errors.length ? ` with ${errors.length} error${errors.length === 1 ? '' : 's'}` : ''}.`);
      await loadRegistrations();
      if (errors.length === 0) setBulkDialogOpen(false);
    } catch (cause) {
      setRegistrationErrors([{ selector: 'bulk register', error: cause instanceof Error ? cause.message : 'Register failed' }]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRegistration(registrationId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete registration?')) return;
    setBusy(true);
    setRegistrationMessage('');
    try {
      await dataConnection.deleteRegistration(id, registrationId);
      await loadRegistrations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function attachPolicy() {
    if (!pickPolicyId) return;
    setBusy(true);
    try {
      await dataConnection.attachPolicy(id, pickPolicyId);
      setPickPolicyId('');
      await loadNetworking();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Attach failed');
    } finally {
      setBusy(false);
    }
  }

  async function detachPolicy(policyId: string) {
    setBusy(true);
    try {
      await dataConnection.detachPolicy(id, policyId);
      await loadNetworking();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Detach failed');
    } finally {
      setBusy(false);
    }
  }

  async function setCredential() {
    const needsSecretValue = credStorageMode === 'encrypted_secret';
    if (needsSecretValue && !credValue.trim()) {
      setError('Encrypted credentials require a write-only secret value.');
      return;
    }
    if (credStorageMode === 'external_secret_reference' && !credExternalRef.trim()) {
      setError('External secret credentials require a secret reference.');
      return;
    }
    if (credStorageMode === 'cloud_identity_reference' && !credCloudIdentityRef.trim()) {
      setError('Cloud identity credentials require an identity reference.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await dataConnection.setCredential(id, {
        kind: credKind,
        storage_mode: credStorageMode,
        value: needsSecretValue ? credValue : undefined,
        external_secret_ref: credStorageMode === 'external_secret_reference' ? credExternalRef.trim() : undefined,
        cloud_identity_ref: credStorageMode === 'cloud_identity_reference' ? credCloudIdentityRef.trim() : undefined,
        secret_version: credVersion.trim() || undefined,
      });
      setCredValue('');
      await loadCredentials();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Set credential failed');
    } finally {
      setBusy(false);
    }
  }

  async function createAndAttachPolicy() {
    const host = newPolicyHost.trim();
    const policyAgents = newPolicyKind === 'agent_proxy' ? agents.map((agent) => agent.id) : [];
    if (newPolicyKind === 'agent_proxy' && policyAgents.length === 0) {
      setError('Register at least one connector agent before creating an agent-proxy egress policy.');
      return;
    }
    const allowedOrganizations = parseCsvLines(newPolicyOrgs);
    const validationErrors = validateEgressPolicy(makeDraftPolicyForValidation({
      kind: newPolicyKind,
      host,
      port: newPolicyPort,
      protocol: newPolicyProtocol,
      proxyMode: newPolicyProxyMode,
      agents: policyAgents,
      allowedOrganizations,
    })).filter((issue) => issue.severity === 'error');
    if (validationErrors.length > 0) {
      setError(validationErrors[0].message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await dataConnection.createEgressPolicy({
        name: newPolicyName.trim() || `${source?.name ?? 'source'} ${newPolicyKind} egress`,
        description: `Created from source ${source?.id ?? id}`,
        kind: newPolicyKind,
        address: { kind: 'host' as EgressEndpointKind, value: host },
        port: { kind: 'single' as EgressPortKind, value: String(Number(newPolicyPort)) },
        protocol: newPolicyProtocol,
        proxy_mode: newPolicyKind === 'agent_proxy' ? newPolicyProxyMode : 'none',
        sni_behavior: 'verify',
        agents: policyAgents,
        state: 'pending_approval',
        status: 'pending_approval',
        allowed_organizations: allowedOrganizations,
        is_global: false,
        permissions: [],
        importer_grants: [],
        reason: `Created and attached from source ${source?.id ?? id}`,
      });
      await dataConnection.attachPolicy(id, created.id, created.kind);
      setNewPolicyName('');
      setNewPolicyHost('');
      setNewPolicyPort('443');
      setNewPolicyOrgs('');
      await loadNetworking();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create and attach policy failed');
    } finally {
      setBusy(false);
    }
  }

  async function createSync() {
    const selectedOutputKind = defaultOutputKindForCapability(newSyncCapability);
    const selector = newSourceSelector.trim() || selectedDiscovered[0]?.selector || explorationNodes.find((node) => node.supports_sync !== false)?.selector;
    const outputTarget = newOutputDataset.trim();
    const outputDataset = selectedOutputKind === 'dataset'
      ? (outputTarget || (source ? suggestedOutputDatasetId(source, selector) : ''))
      : outputTarget;
    if (selectedOutputKind === 'dataset' && !outputDataset) {
      setError('Select or create an output dataset for batch syncs.');
      return;
    }
    if (selectedOutputKind !== 'dataset' && !outputDataset) {
      setError('Select or create an output stream/media set for this sync.');
      return;
    }
    const includeGlobs = parseGlobList(includeGlobsRaw);
    const excludeGlobs = parseGlobList(excludeGlobsRaw);
    const pathMetadataColumns = parseGlobList(pathMetadataColumnsRaw);
    const fileLimit = fileCountLimit.trim() ? Number(fileCountLimit) : null;
    const fileSync = makeFileSyncSettings({
      mode: fileSyncMode,
      exclude_already_synced: excludeAlreadySynced,
      file_count_limit: fileLimit,
      include_globs: includeGlobs,
      exclude_globs: excludeGlobs,
      include_path_metadata: includePathMetadata,
      path_metadata_columns: pathMetadataColumns,
      historical_snapshot_cutoff: historicalCutoff.trim() || null,
      incremental_recent_window: incrementalRecentWindow.trim() || null,
      low_level: {
        file_glob: newFileGlob.trim() || null,
        emitted_transaction_type: datasetTransactionTypeForFileMode(fileSyncMode),
      },
    });
    const tableNames = parseGlobList(tableNamesRaw || selector || '');
    const tableSelections: TableBatchSyncSelection[] = tableNames.map((tableName) => ({
      source_table: tableName,
      destination_dataset_id: newOutputDataset.trim() || (source ? suggestedOutputDatasetId(source, tableName) : outputDataset),
      source_schema: null,
      destination_schema: null,
      estimated_row_count: estimatedRowCount.trim() ? Number(estimatedRowCount) : null,
      incremental_column: tableIncrementalColumn.trim() || null,
      last_transaction_id: null,
    }));
    const tableSync = makeTableBatchSyncSettings({
      mode: tableSyncMode,
      selected_tables: tableSelections,
      infer_schema: inferTableSchema,
      incremental_column: tableIncrementalColumn.trim() || null,
      row_count: estimatedRowCount.trim() ? Number(estimatedRowCount) : null,
      transaction_ids: [],
    });
    const warnings = [...fileSync.warnings ?? [], ...tableSync.warnings ?? []];
    if (warnings.some((warning) => warning.severity === 'error')) {
      setError(warnings.filter((warning) => warning.severity === 'error').map((warning) => warning.message).join(' '));
      return;
    }

    setBusy(true);
    setError(warnings.map((warning) => warning.message).join(' '));
    try {
      await dataConnection.createSync({
        source_id: id,
        capability_type: newSyncCapability,
        output_kind: selectedOutputKind,
        output_dataset_id: selectedOutputKind === 'dataset' ? outputDataset : undefined,
        output_stream_id: selectedOutputKind === 'stream' ? outputDataset : undefined,
        output_media_set_id: selectedOutputKind === 'media_set' ? outputDataset : undefined,
        source_selector: selector,
        source_path: selector,
        source_table: tableSelections[0]?.source_table ?? selector,
        source_topic: selector,
        write_mode: tableNames.length > 0 ? (tableSyncMode === 'full_snapshot' ? 'snapshot' : 'incremental') : newWriteMode,
        transaction_mode: newTransactionMode,
        build_integration: newBuildIntegration.trim() || undefined,
        create_output_dataset: createOutputDataset,
        output_folder_rid: source?.folder_rid ?? undefined,
        dataset_transaction_type: tableNames.length > 0 ? datasetTransactionTypeForTableMode(tableSyncMode) : datasetTransactionTypeForFileMode(fileSyncMode),
        file_sync: fileSync,
        table_sync: tableNames.length > 0 ? tableSync : undefined,
        file_glob: newFileGlob || undefined,
        schedule_cron: newScheduleCron || undefined,
      });
      setNewOutputDataset('');
      setNewSourceSelector('');
      setNewFileGlob('');
      setNewBuildIntegration('');
      setNewScheduleCron('');
      await loadSyncs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function createCdcSync() {
    if (!source) return;
    let schema;
    let connectorMetadata;
    try {
      const parsedSchema = JSON.parse(cdcSchemaJson || '[]');
      if (!Array.isArray(parsedSchema)) {
        throw new Error('CDC schema must be a JSON array of fields.');
      }
      schema = parsedSchema;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CDC schema must be valid JSON.');
      return;
    }
    try {
      const parsedMetadata = JSON.parse(cdcMetadataJson || '{}');
      if (!parsedMetadata || typeof parsedMetadata !== 'object' || Array.isArray(parsedMetadata)) {
        throw new Error('CDC connector metadata must be a JSON object.');
      }
      connectorMetadata = parsedMetadata;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CDC connector metadata must be valid JSON.');
      return;
    }
    const sourceSelector = cdcInputKind === 'relational_connector'
      ? [cdcSourceDatabase, cdcSourceSchema, cdcSourceTable].map((part) => part.trim()).filter(Boolean).join('.')
      : cdcSourceTopic.trim();
    const settings = makeCdcSyncSettings({
      input_kind: cdcInputKind,
      source_database: cdcSourceDatabase,
      source_schema: cdcSourceSchema,
      source_table: cdcSourceTable,
      source_topic: cdcSourceTopic,
      primary_key_columns: parseGlobList(cdcPrimaryKeysRaw),
      ordering_column: cdcOrderingColumn,
      deletion_column: cdcDeletionColumn,
      output_stream_id: cdcOutputStream,
      output_stream_location: cdcOutputStream,
      schema,
      start_position: cdcStartPosition,
      start_position_value: cdcStartPositionValue.trim() || null,
      source_database_cdc_enabled: cdcDatabaseEnabled,
      source_table_cdc_enabled: cdcTableEnabled,
      changelog_input_validated: cdcChangelogShapeValidated,
      connector_metadata: connectorMetadata,
    }, source.connector_type);
    const warnings = validateCdcSyncSetup(settings, source.connector_type);
    if (warnings.some((warning) => warning.severity === 'error')) {
      setError(warnings.filter((warning) => warning.severity === 'error').map((warning) => warning.message).join(' '));
      return;
    }
    setBusy(true);
    setError(warnings.map((warning) => warning.message).join(' '));
    try {
      await dataConnection.createSync({
        source_id: id,
        capability_type: 'cdc_sync',
        output_kind: 'stream',
        output_stream_id: cdcOutputStream.trim(),
        source_selector: sourceSelector,
        source_table: cdcInputKind === 'relational_connector' ? cdcSourceTable.trim() : undefined,
        source_topic: cdcInputKind === 'streaming_middleware_changelog' ? cdcSourceTopic.trim() : undefined,
        schema,
        write_mode: 'append',
        transaction_mode: 'external_checkpoint',
        cdc_sync: settings,
      });
      setCdcSourceTable('');
      setCdcSourceTopic('');
      setCdcOutputStream('');
      await loadSyncs();
      await loadStreams();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create CDC sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function createStreamingSync() {
    const body: CreateStreamingSyncRequest = {
      source_id: id,
      source_topic: streamTopic.trim(),
      consumer_group: streamConsumerGroup.trim() || null,
      schema: [],
      key_fields: parseGlobList(streamKeyFieldsRaw),
      start_offset: streamStartOffset,
      start_offset_value: streamStartOffsetValue.trim() || null,
      consistency_guarantee: streamConsistency,
      checkpoint_interval_ms: Number(streamCheckpointInterval) || 60000,
      output_stream_location: streamOutputLocation.trim(),
    };
    const consistency = evaluateStreamingConsistency({
      requested: streamConsistency,
      runtime: streamRuntime,
      sourceSupportsExactlyOnce: streamSourceExactlyOnce,
      sinkSupportsExactlyOnce: streamSinkExactlyOnce,
    });
    const warnings = validateStreamingSyncSetup(body);
    if (consistency.downgraded || consistency.duplicate_tolerant_consumers_required) {
      warnings.push({ code: consistency.downgraded ? 'exactly-once-downgraded' : 'duplicate-tolerant-consumers', severity: 'warning', message: consistency.reason ?? 'Streaming consistency requirements changed.' });
    }
    if (warnings.some((warning) => warning.severity === 'error')) {
      setError(warnings.filter((warning) => warning.severity === 'error').map((warning) => warning.message).join(' '));
      return;
    }
    setBusy(true);
    setError(warnings.map((warning) => warning.message).join(' '));
    try {
      const created = await dataConnection.createStreamingSync(body);
      setStreamingSyncs((prev) => [created, ...prev.filter((sync) => sync.id !== created.id)]);
      setStreamTopic('');
      setStreamConsumerGroup('');
      setStreamKeyFieldsRaw('');
      setStreamStartOffsetValue('');
      await loadStreams();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create streaming sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function pushStreamRecords() {
    let records: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(pushRecordsJson);
      records = Array.isArray(parsed) ? parsed : [parsed];
      if (!records.every((record) => record && typeof record === 'object' && !Array.isArray(record))) {
        throw new Error('Records must be a JSON object or array of objects.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Push records must be valid JSON.');
      return;
    }
    const stream = streams.find((item) => item.id === pushStreamId);
    const warnings = validatePushStreamRecords({
      datasetRid: pushDatasetRid,
      branch: pushBranch,
      tokenReferenceId: pushTokenRef,
      records,
      schema: stream?.schema,
      idempotencyKey: pushIdempotencyKey,
    });
    if (warnings.some((warning) => warning.severity === 'error')) {
      setError(warnings.map((warning) => warning.message).join(' '));
      return;
    }
    setBusy(true);
    setError(warnings.map((warning) => warning.message).join(' '));
    try {
      await dataConnection.pushStreamRecords(pushStreamId, {
        dataset_rid: pushDatasetRid.trim(),
        branch: pushBranch.trim(),
        token_reference_id: pushTokenRef.trim(),
        idempotency_key: pushIdempotencyKey.trim() || null,
        records,
      });
      await loadStreams();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Push ingestion failed');
    } finally {
      setBusy(false);
    }
  }

  async function createExport() {
    if (!source) return;
    if (!sourceSupportsExportType(source, newExportType)) {
      setError(`${dataExportTypeLabel(newExportType)} is not supported by this source.`);
      return;
    }
    let config: Record<string, unknown> = {};
    try {
      const parsed = exportConfigJson.trim() ? JSON.parse(exportConfigJson) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Export config must be a JSON object.');
      config = parsed as Record<string, unknown>;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export config must be valid JSON.');
      return;
    }
    const destination = exportDestination.trim();
    const datasetInput = exportInputDataset.trim();
    const streamInput = exportInputStream.trim();
    let sourceFiles: FileExportSourceFile[] = [];
    if (newExportType === 'file') {
      try {
        const parsed = fileManifestJson.trim() ? JSON.parse(fileManifestJson) : [];
        sourceFiles = Array.isArray(parsed) ? parsed : [];
        if (!Array.isArray(parsed) || !sourceFiles.every((file) => file && typeof file.path === 'string' && typeof file.size_bytes === 'number')) {
          throw new Error('File manifest must be a JSON array of {path, size_bytes, modified_at, transaction_id}.');
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'File manifest must be valid JSON.');
        return;
      }
    }
    let datasetSchema: TableExportColumn[] = [];
    let destinationSchema: TableExportColumn[] = [];
    let tableRows: number | null = null;
    let streamingRecordsEstimate: number | null = null;
    if (newExportType === 'table') {
      try {
        const parsedDatasetSchema = tableDatasetSchemaJson.trim() ? JSON.parse(tableDatasetSchemaJson) : [];
        const parsedDestinationSchema = tableDestinationSchemaJson.trim() ? JSON.parse(tableDestinationSchemaJson) : [];
        if (!Array.isArray(parsedDatasetSchema) || !Array.isArray(parsedDestinationSchema)) {
          throw new Error('Table schemas must be JSON arrays.');
        }
        if (![...parsedDatasetSchema, ...parsedDestinationSchema].every((column) => column && typeof column.name === 'string')) {
          throw new Error('Table schema columns must include name, foundry_type, external_type, and nullable.');
        }
        datasetSchema = parsedDatasetSchema as TableExportColumn[];
        destinationSchema = parsedDestinationSchema as TableExportColumn[];
        const rawRows = tableRowCountEstimate.trim();
        tableRows = rawRows ? Number(rawRows) : null;
        if (tableRows !== null && (!Number.isFinite(tableRows) || tableRows < 0)) {
          throw new Error('Row count estimate must be zero or a positive number.');
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Table export schemas must be valid JSON.');
        return;
      }
      const tableSettings = defaultTableExportSettings({
        input_parquet_backed: tableInputParquetBacked,
        destination_table_exists: tableDestinationExists,
        truncate_permission: tableTruncatePermission,
        row_count_estimate: tableRows,
        dataset_schema: datasetSchema,
        destination_schema: destinationSchema,
      }, newExportMode);
      const issues = validateTableExportSettings(tableSettings, newExportMode).filter((issue) => issue.severity === 'error');
      if (issues.length) {
        setError(issues.map((issue) => issue.message).join(' '));
        return;
      }
    }
    if (newExportType === 'streaming') {
      const rawRecords = exportStreamingRecordsEstimate.trim();
      streamingRecordsEstimate = rawRecords ? Number(rawRecords) : null;
      if (streamingRecordsEstimate !== null && (!Number.isFinite(streamingRecordsEstimate) || streamingRecordsEstimate < 0)) {
        setError('Streaming records estimate must be zero or a positive number.');
        return;
      }
      const streamingSettings = defaultStreamingExportSettings({
        replay_behavior: exportStreamingReplayBehavior,
        start_offset: exportStreamingStartOffset,
        start_offset_value: exportStreamingStartOffsetValue.trim() || null,
        last_exported_offset: exportStreamingLastOffset.trim() || null,
        schedule_restart_enabled: exportStreamingScheduleRestart,
        records_exported_estimate: streamingRecordsEstimate,
        replayed_records_detected: exportStreamingReplayDetected,
      }, Boolean(exportScheduleCron.trim()));
      const issues = validateStreamingExportSettings(streamingSettings).filter((issue) => issue.severity === 'error');
      if (issues.length) {
        setError(issues.map((issue) => issue.message).join(' '));
        return;
      }
    }
    if (newExportType === 'streaming' && (!streamInput || !destination)) {
      setError('Streaming exports require an input stream and destination topic.');
      return;
    }
    if (newExportType !== 'streaming' && (!datasetInput || !destination)) {
      setError('File and table exports require an input dataset and destination.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await dataConnection.createExport(id, {
        name: newExportName.trim() || `${source.name} ${dataExportTypeLabel(newExportType)}`,
        export_type: newExportType,
        export_mode: newExportMode,
        input_dataset_rid: newExportType === 'streaming' ? undefined : datasetInput,
        input_stream_id: newExportType === 'streaming' ? streamInput : undefined,
        destination_path: newExportType === 'file' ? destination : undefined,
        destination_table: newExportType === 'table' ? destination : undefined,
        destination_topic: newExportType === 'streaming' ? destination : undefined,
        schedule_cron: exportScheduleCron.trim() || undefined,
        start_behavior: newExportType === 'streaming' ? 'manual' : 'manual',
        stop_behavior: newExportType === 'streaming' ? 'manual' : 'after_run',
        export_controls: {
          allowed_markings: parseGlobList(exportAllowedMarkings),
          allowed_organizations: parseGlobList(exportAllowedOrganizations),
        },
        config,
        file_export: newExportType === 'file' ? defaultFileExportSettings({
          incremental_policy: newExportMode === 'snapshot' ? 'full_snapshot' : 'modified_since_last_success',
          overwrite_behavior: fileOverwriteBehavior,
          destination_subfolder: fileDestinationSubfolder.trim() || null,
          preserve_directory_structure: filePreserveDirectory,
          full_reexport_requested: fileFullReexport,
          full_reexport_strategy: fileFullReexport ? 'include_all_files_once' : 'create_new_export_or_overwrite_upstream',
          source_files: sourceFiles,
        }, newExportMode, destination) : undefined,
        table_export: newExportType === 'table' ? defaultTableExportSettings({
          input_parquet_backed: tableInputParquetBacked,
          destination_table_exists: tableDestinationExists,
          truncate_permission: tableTruncatePermission,
          row_count_estimate: tableRows,
          dataset_schema: datasetSchema,
          destination_schema: destinationSchema,
        }, newExportMode) : undefined,
        streaming_export: newExportType === 'streaming' ? defaultStreamingExportSettings({
          replay_behavior: exportStreamingReplayBehavior,
          start_offset: exportStreamingStartOffset,
          start_offset_value: exportStreamingStartOffsetValue.trim() || null,
          last_exported_offset: exportStreamingLastOffset.trim() || null,
          schedule_restart_enabled: exportStreamingScheduleRestart,
          records_exported_estimate: streamingRecordsEstimate,
          replayed_records_detected: exportStreamingReplayDetected,
        }, Boolean(exportScheduleCron.trim())) : undefined,
      });
      setDataExports((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setNewExportName('');
      setExportDestination('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create export failed');
    } finally {
      setBusy(false);
    }
  }

  async function createWebhook() {
    let inputParameters: WebhookParameterMetadata[] = [];
    let outputParameters: WebhookOutputParameterMetadata[] = [];
    try {
      inputParameters = webhookInputsJson.trim() ? JSON.parse(webhookInputsJson) : [];
      outputParameters = webhookOutputsJson.trim() ? JSON.parse(webhookOutputsJson) : [];
      if (!Array.isArray(inputParameters) || !Array.isArray(outputParameters)) throw new Error('Webhook parameters must be JSON arrays.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Webhook parameter metadata must be valid JSON arrays.');
      return;
    }
    const body: CreateWebhookRequest = {
      name: webhookName.trim(),
      method: webhookMethod,
      relative_path: webhookPath.trim(),
      query_params: parseNameValueLines(webhookQueryRaw),
      headers: parseNameValueLines(webhookHeadersRaw),
      body_template: webhookBody.trim() || null,
      authorization_reference_id: webhookAuthRef.trim() || null,
      input_parameters: inputParameters,
      output_parameters: outputParameters,
      timeout_ms: Number(webhookTimeoutMs) || 30000,
      retry: {
        max_attempts: Number(webhookRetryAttempts) || 1,
        initial_backoff_ms: 1000,
        max_backoff_ms: 30000,
      },
    };
    const warnings = validateWebhookSetup(body);
    if (warnings.some((warning) => warning.severity === 'error')) {
      setError(warnings.map((warning) => warning.message).join(' '));
      return;
    }
    setBusy(true);
    setError(warnings.map((warning) => warning.message).join(' '));
    try {
      const created = await dataConnection.createWebhook(id, body);
      setWebhooks((prev) => [created, ...prev.filter((webhook) => webhook.id !== created.id)]);
      setWebhookName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create webhook failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveSourceCodeImport() {
    let codeRepositories: SourceCodeRepositoryImport[] = [];
    try {
      const parsed = codeImportRepositoriesJson.trim() ? JSON.parse(codeImportRepositoriesJson) : [];
      if (!Array.isArray(parsed)) throw new Error('Imported repositories must be a JSON array.');
      codeRepositories = parsed as SourceCodeRepositoryImport[];
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Imported repositories must be valid JSON.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await dataConnection.updateSourceCodeImport(id, {
        enabled: codeImportEnabled,
        friendly_name: codeImportFriendlyName.trim(),
        python_identifier: codeImportPythonIdentifier.trim(),
        code_repositories: codeRepositories,
        export_controls: {
          allow_foundry_inputs: codeImportAllowFoundryInputs,
          allowed_markings: parseGlobList(codeImportAllowedMarkings),
          allowed_organizations: parseGlobList(codeImportAllowedOrganizations),
        },
      });
      applySourceCodeImportState(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save code imports failed');
    } finally {
      setBusy(false);
    }
  }

  async function resolveSourceCodeImportBuildStart() {
    setBusy(true);
    setError('');
    try {
      const firstRepository = sourceCodeImport?.code_repositories?.[0]?.repository_rid;
      const resolution = await dataConnection.resolveSourceCodeImportBuildStart(id, {
        repository_rid: firstRepository || undefined,
      });
      setCodeImportResolution(resolution);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Resolve code import build start failed');
    } finally {
      setBusy(false);
    }
  }

  async function startStreamingSync(syncId: string) {
    setBusy(true);
    try {
      const updated = await dataConnection.startStreamingSync(syncId);
      setStreamingSyncs((prev) => prev.map((sync) => sync.id === syncId ? updated : sync));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Start streaming sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function stopStreamingSync(syncId: string) {
    setBusy(true);
    try {
      const updated = await dataConnection.stopStreamingSync(syncId);
      setStreamingSyncs((prev) => prev.map((sync) => sync.id === syncId ? updated : sync));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stop streaming sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSync(syncId: string) {
    setBusy(true);
    try {
      await dataConnection.runSync(syncId);
      await loadRuns(syncId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Run sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function runExport(exportId: string) {
    setBusy(true);
    try {
      const updated = await dataConnection.runExport(exportId);
      setDataExports((prev) => prev.map((item) => item.id === exportId ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Run export failed');
    } finally {
      setBusy(false);
    }
  }

  async function startExport(exportId: string) {
    setBusy(true);
    try {
      const updated = await dataConnection.startExport(exportId);
      setDataExports((prev) => prev.map((item) => item.id === exportId ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Start export failed');
    } finally {
      setBusy(false);
    }
  }

  async function stopExport(exportId: string) {
    setBusy(true);
    try {
      const updated = await dataConnection.stopExport(exportId);
      setDataExports((prev) => prev.map((item) => item.id === exportId ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stop export failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading source…</p>
      </section>
    );
  }

  if (!source) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Sources</Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>{error || 'Source not found'}</p>
      </section>
    );
  }

  const capabilities = sourceCapabilities(source, registryEntry);
  const supportedExportTypes = DATA_EXPORT_TYPES.filter((type) => sourceSupportsExportType(source, type));
  const canCreateCdcSync = connectorSupportsCdcSync(source.connector_type) || capabilities.includes('cdc_sync');
  const health = sourceHealth(source);
  const usage = sourceUsage(source);
  const audit = sourceAudit(source);
  const attachedPolicyIds = attached.map((policy) => policy.id);
  const sourceAgents = connectorAgentsForSource(agents, source.id, attachedPolicyIds);
  const sourceAgentFailures = sourceAgents.flatMap((agent) => connectorAgentFailuresForSource(agent, source.id, attachedPolicyIds));
  const renderedHealthSummary = sourceHealthSummary
    ? dataConnectionHealthSummaryWithStreamChecks(sourceHealthSummary, streams)
    : null;
  const actionableHealthChecks = renderedHealthSummary ? dataConnectionActionableHealthChecks(renderedHealthSummary) : [];
  const editWorkerCompatibility = registryEntry ? validateConnectorWorker(registryEntry, editWorker) : null;
  const unavailableForEditWorker = registryEntry ? unavailableCapabilitiesForWorker(registryEntry, editWorker) : [];
  const editSyncsSubs = connectorSupportsMediaSync(source.connector_type)
    ? EDIT_SYNCS_SUBS
    : EDIT_SYNCS_SUBS.filter((item) => item.id !== 'media-syncs');
  const runningCount = 0;
  const successCount = (usage.sync_count ?? 0) + (usage.export_count ?? 0);
  const failureCount = sourceAgentFailures.length;

  function selectOuter(next: OuterTab) {
    if (outerTab === next) return;
    setOuterTab(next);
    selectTab(OUTER_DEFAULT_TAB[next]);
  }

  return (
    <section className="of-page" style={{ padding: 0, display: 'grid', gap: 0 }}>
      <div style={{ padding: '20px 32px 0' }}>
        <Breadcrumb
          items={[
            { label: 'Data Connection', href: '/data-connection' },
            { label: source.name },
          ]}
        />
      </div>

      <header
        style={{
          padding: '12px 32px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.2 }}>
            {source.name}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {source.id} · {source.connector_type} · worker: {source.worker} · status: {source.status}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusChip icon="run" count={runningCount} tone="info" label="Running runs" />
          <StatusChip icon="check" count={successCount} tone="success" label="Successful runs" />
          <StatusChip icon="x" count={failureCount} tone="danger" label="Failed runs" />
          <button
            type="button"
            className="of-button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            aria-label="Help"
          >
            <Glyph name="help" size={14} tone="currentColor" />
            Help
          </button>
        </div>
      </header>

      <div
        style={{
          padding: '16px 32px 0',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: '1px solid var(--border-subtle)',
          marginTop: 16,
        }}
      >
        <nav
          aria-label="Source tabs"
          style={{ display: 'flex', gap: 4, overflowX: 'auto' }}
        >
          {OUTER_TABS.map((item) => {
            const active = outerTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectOuter(item.id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  padding: '8px 14px',
                  border: 0,
                  background: 'transparent',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  borderBottom: active ? '2px solid var(--status-info)' : '2px solid transparent',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                  font: 'inherit',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 6 }}>
          <ActionLink icon="trash" label="Move to trash" onClick={() => void archiveSource()} disabled={busy} />
          <ActionLink
            icon="lineage"
            label="Explore lineage"
            onClick={() => navigate(`/lineage?source=${encodeURIComponent(source.id)}`)}
          />
          <ActionLink icon="share" label="Share" onClick={() => setEditOpen((open) => !open)} />
        </div>
      </div>

      {error && (
        <div
          className="of-status-danger"
          style={{ margin: '12px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      {testResult && (
        <div
          style={{
            margin: '12px 32px 0',
            padding: 10,
            background: testResult.success ? '#d1fae5' : '#fee2e2',
            borderRadius: 8,
            fontSize: 12,
            display: 'grid',
            gap: 6,
          }}
        >
          <div>
            <strong>{testResult.success ? '✓' : '✗'}</strong> {testResult.message}
            {testResult.latency_ms !== null && ` · ${testResult.latency_ms}ms`}
            {testResult.tested_at ? ` · ${testResult.tested_at}` : ''}
          </div>
          {(testResult.checks ?? []).length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(testResult.checks ?? []).map((check) => (
                <li key={check.name}>
                  {check.status} · {check.name}: {check.message}{check.latency_ms !== null ? ` · ${check.latency_ms}ms` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {/* Legacy hidden tabs nav, kept as fallback selector; rendered offscreen */}
      <div style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }} aria-hidden="true">
        <Tabs
          tabs={[
            'overview', 'health', 'retries', 'configuration', 'credentials', 'networking',
            'explore', { id: 'syncs', label: 'Syncs' }, { id: 'streams', label: 'Streams' },
            'exports', 'webhooks', { id: 'virtual-tables', label: 'Virtual tables' },
            { id: 'code-imports', label: 'Code imports' }, 'permissions', 'history', 'capabilities',
            ...(connectorSupportsMediaSync(source.connector_type) ? [{ id: 'media-syncs' as Tab, label: 'Media syncs' }] : []),
          ]}
          active={tab}
          onChange={selectTab}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: 24,
          alignItems: 'flex-start',
          flex: 1,
          minWidth: 0,
        }}
      >
        {outerTab === 'connection-settings' && (
          <aside
            aria-label="Connection settings sections"
            style={{
              width: 240,
              flexShrink: 0,
              background: 'var(--bg-default)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 8,
            }}
          >
            {CONNECTION_SETTINGS_SIDEBAR.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    margin: '1px 0',
                    border: 0,
                    background: active ? 'var(--bg-hover)' : 'transparent',
                    color: active ? 'var(--text-link)' : 'var(--text-default)',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    borderRadius: 4,
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(outerTab === 'overview' || outerTab === 'edit-syncs') && (
            <nav
              aria-label="Section sub-tabs"
              style={{
                display: 'flex',
                gap: 4,
                borderBottom: '1px solid var(--border-subtle)',
                overflowX: 'auto',
              }}
            >
              {(outerTab === 'overview' ? OVERVIEW_SUBS : editSyncsSubs).map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      padding: '6px 12px',
                      border: 0,
                      background: 'transparent',
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      borderBottom: active ? '2px solid var(--status-info)' : '2px solid transparent',
                      marginBottom: -1,
                      whiteSpace: 'nowrap',
                      font: 'inherit',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

      {editOpen && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow">Edit source</p>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Update source metadata without exposing stored secret values.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <LabeledInput label="Name" value={editName} onChange={setEditName} />
            <LabeledInput label="Description" value={editDescription} onChange={setEditDescription} />
            <LabeledInput label="Project RID" value={editProjectRid} onChange={setEditProjectRid} />
            <LabeledInput label="Folder RID" value={editFolderRid} onChange={setEditFolderRid} />
            <LabeledInput label="Owner ID" value={editOwnerId} onChange={setEditOwnerId} />
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Worker
              <select value={editWorker} onChange={(event) => setEditWorker(event.target.value as SourceWorker)} className="of-input">
                {WORKER_CHOICES.map((item) => {
                  const compatibility = registryEntry ? validateConnectorWorker(registryEntry, item) : null;
                  return (
                    <option key={item} value={item} disabled={compatibility ? !compatibility.valid : false}>
                      {workerLabel(item)}{compatibility && !compatibility.valid ? ' (unavailable)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <LabeledInput label="Default output location" value={editOutputLocation} onChange={setEditOutputLocation} />
            <LabeledInput label="Duplicate name" value={duplicateName} onChange={setDuplicateName} />
            <LabeledInput label="Archive reason" value={archiveReason} onChange={setArchiveReason} />
          </div>
          {editWorkerCompatibility && (
            <WorkerCompatibilityPanel
              valid={editWorkerCompatibility.valid}
              worker={editWorker}
              allowed={editWorkerCompatibility.allowedCapabilities}
              unavailable={unavailableForEditWorker}
              reason={editWorkerCompatibility.reason}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void testConnection()} disabled={busy} className="of-button" style={{ fontSize: 12 }}>Test connection</button>
              <button type="button" onClick={() => void duplicateSource()} disabled={busy || !duplicateName.trim()} className="of-button" style={{ fontSize: 12 }}>Duplicate</button>
              <button type="button" onClick={() => void deleteSource()} disabled={busy} className="of-button" style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}>Delete</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEditOpen(false)} disabled={busy} className="of-button">Cancel</button>
              <button type="button" onClick={() => void saveConfiguration()} disabled={busy || !editName.trim() || (editWorkerCompatibility ? !editWorkerCompatibility.valid : false)} className="of-button of-button--primary">Save changes</button>
            </div>
          </div>
        </section>
      )}

      {tab === 'overview' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div>
            <p className="of-eyebrow">Source overview</p>
            <h2 className="of-section-title" style={{ marginTop: 4 }}>{source.name}</h2>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              {source.description || 'No description yet.'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
            <RegistryField label="Connector type" value={source.connector_type} />
            <RegistryField label="Project / folder" value={`${source.project_rid ?? 'No project'} / ${source.folder_rid ?? 'No folder'}`} />
            <RegistryField label="Owner" value={ownerLabel(source)} />
            <RegistryField label="Worker" value={workerLabel(source.worker)} />
            <RegistryField label="Network policy" value={source.network_policy_id ?? 'No network policy attached'} />
            <RegistryField label="Credential references" value={(source.credential_reference_ids ?? []).length > 0 ? (source.credential_reference_ids ?? []).join(', ') : 'No credential references'} />
            <RegistryField label="Default output" value={source.default_output_location ?? 'No default output location'} />
            <RegistryField label="Health" value={`${health.state}${health.message ? ` · ${health.message}` : ''}`} />
            <RegistryField label="Agent health" value={sourceAgents.length ? sourceAgents.map((agent) => `${agent.name}: ${connectorAgentHealthLabel(agent)}`).join(' | ') : 'No reporting agent'} />
            <RegistryField label="Agent failures" value={sourceAgentFailures.length ? sourceAgentFailures.map((failure) => `${failure.code}: ${failure.message}`).join(' | ') : 'No agent connection failures'} />
            <RegistryField label="Usage" value={`${usage.sync_count} syncs · ${usage.export_count} exports · ${usage.webhook_count} webhooks · ${usage.virtual_table_count} virtual tables`} />
            <RegistryField label="Audit" value={`created by ${audit.created_by ?? 'unknown'} · updated by ${audit.updated_by ?? 'unknown'}${audit.last_event_id ? ` · event ${audit.last_event_id}` : ''}`} />
          </div>
          {sourceAgentFailures.length > 0 ? (
            <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
              {sourceAgentFailures.map((failure) => `${failure.source_name || source.name}: ${failure.message}`).join(' ')}
            </div>
          ) : null}
          <div>
            <span className="of-text-muted" style={{ fontSize: 12 }}>Supported capabilities</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {capabilities.map((capability) => (
                <span key={capability} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 999 }}>
                  {capabilityLabel(capability)}
                </span>
              ))}
              {capabilities.length === 0 ? <span className="of-text-muted" style={{ fontSize: 12 }}>No capabilities registered.</span> : null}
            </div>
          </div>
          {registryEntry ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Connector registry</p>
                <h2 className="of-section-title" style={{ marginTop: 4 }}>{registryEntry.name}</h2>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{registryEntry.description}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
                <RegistryField label="Category" value={connectorCategoryLabel(registryEntry.category)} />
                <RegistryField label="Workers" value={registryEntry.workers.join(', ')} />
                <RegistryField label="Credentials" value={registryEntry.credentialFields.length === 0 ? 'No secret fields' : registryEntry.credentialFields.map((field) => `${field.label}${field.required ? ' *' : ''}`).join(', ')} />
                <RegistryField label="Network" value={`${registryEntry.network.modes.join(', ')}${registryEntry.network.defaultPorts.length > 0 ? ` · ports ${registryEntry.network.defaultPorts.join(', ')}` : ''}`} />
                <RegistryField label="Setup docs" value={registryEntry.setupDocsUrl} href={registryEntry.setupDocsUrl} />
              </div>
              <div>
                <span className="of-text-muted" style={{ fontSize: 12 }}>Capabilities</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {registryEntry.capabilities.map((capability) => (
                    <span key={capability} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 999 }}>
                      {capabilityLabel(capability)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <pre style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 12, overflow: 'auto' }}>
            {JSON.stringify(source, null, 2)}
          </pre>
        </section>
      )}

      {tab === 'health' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p className="of-eyebrow">Data Connection health</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>
                {renderedHealthSummary ? dataConnectionHealthStateLabel(renderedHealthSummary.state) : 'Not loaded'}
              </h2>
              {renderedHealthSummary ? (
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Checked {new Date(renderedHealthSummary.checked_at).toLocaleString()} · {renderedHealthSummary.surfaces.map(dataConnectionHealthSurfaceLabel).join(', ')}
                </p>
              ) : null}
            </div>
            <button type="button" className="of-button" onClick={() => void loadHealth()} disabled={busy}>Refresh health</button>
          </header>
          {!renderedHealthSummary ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>Open refresh to load health checks.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {([
                  ['critical', renderedHealthSummary.counts.critical],
                  ['warning', renderedHealthSummary.counts.warning],
                  ['unknown', renderedHealthSummary.counts.unknown],
                  ['ok', renderedHealthSummary.counts.ok],
                ] as Array<[DataConnectionHealthState, number]>).map(([state, count]) => (
                  <div key={state} className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 4 }}>
                    <span style={healthStateChip(state)}>{dataConnectionHealthStateLabel(state)}</span>
                    <strong style={{ fontSize: 22 }}>{count}</strong>
                  </div>
                ))}
              </div>
              <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong>Actionable checks</strong>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>{actionableHealthChecks.length} active</span>
                </div>
                {actionableHealthChecks.length === 0 ? (
                  <span className="of-text-muted" style={{ fontSize: 12 }}>No active health issues.</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {actionableHealthChecks.slice(0, 12).map((check) => (
                      <li key={`${check.surface}-${check.code}-${check.resource_id ?? check.resource_rid ?? ''}`} style={{ display: 'grid', gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={healthStateChip(check.state)}>{dataConnectionHealthStateLabel(check.state)}</span>
                          <strong>{check.label}</strong>
                          <span className="of-text-muted" style={{ fontSize: 12 }}>{dataConnectionHealthSurfaceLabel(check.surface)} · {healthCheckResourceLabel(check)}</span>
                        </div>
                        <span style={{ fontSize: 12 }}>{check.message}</span>
                        {check.recommendation ? <span className="of-text-muted" style={{ fontSize: 12 }}>{check.recommendation}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>State</th>
                      <th style={tableHeaderStyle}>Surface</th>
                      <th style={tableHeaderStyle}>Resource</th>
                      <th style={tableHeaderStyle}>Check</th>
                      <th style={tableHeaderStyle}>Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderedHealthSummary.checks.map((check) => (
                      <tr key={`${check.surface}-${check.code}-${check.resource_id ?? check.resource_rid ?? check.message}`}>
                        <td style={tableCellStyle}><span style={healthStateChip(check.state)}>{dataConnectionHealthStateLabel(check.state)}</span></td>
                        <td style={tableCellStyle}>{dataConnectionHealthSurfaceLabel(check.surface)}</td>
                        <td style={tableCellStyle}>{healthCheckResourceLabel(check)}</td>
                        <td style={tableCellStyle}>{check.code} · {check.message}</td>
                        <td style={tableCellStyle}>{check.last_observed_at ? new Date(check.last_observed_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'retries' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p className="of-eyebrow">SDC.40 — Retries &amp; recovery</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>Automatic retries and failure recovery</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Configure backoff per failure category. Persistent failures escalate to Data Health and schedule/build history; preserved checkpoints avoid full reruns.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="of-button" onClick={() => void loadRetryRecovery()} disabled={busy}>Refresh</button>
              <button
                type="button"
                className="of-button"
                onClick={() => void saveRetryPolicy()}
                disabled={busy || !retryDirty}
              >
                Save policy
              </button>
            </div>
          </div>

          {retryRecovery && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[
                { label: 'Escalated', value: retryRecovery.escalated_count, tone: '#b91c1c' },
                { label: 'Exhausted', value: retryRecovery.exhausted_count, tone: '#b91c1c' },
                { label: 'Backoff in progress', value: retryRecovery.backoff_in_progress_count, tone: '#92400e' },
                { label: 'Checkpoints preserved', value: retryRecovery.checkpoint_preserved_runs, tone: '#047857' },
              ].map((cell) => (
                <div key={cell.label} className="of-panel-muted" style={{ padding: 12 }}>
                  <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>{cell.label}</p>
                  <strong style={{ fontSize: 18, color: cell.tone }}>{cell.value}</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {RETRY_FAILURE_CATEGORIES.map((category) => {
              const draft = getDraftPolicy(category);
              return (
                <div key={category} className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{retryFailureCategoryLabel(category)} failures</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <label style={{ fontSize: 12 }}>
                      Max attempts
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={draft.max_attempts}
                        onChange={(event) => updateRetryDraft(category, { max_attempts: Number(event.target.value) || 1 })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Initial backoff (s)
                      <input
                        type="number"
                        min={1}
                        value={draft.initial_backoff_seconds}
                        onChange={(event) => updateRetryDraft(category, { initial_backoff_seconds: Number(event.target.value) || 1 })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Max backoff (s)
                      <input
                        type="number"
                        min={1}
                        value={draft.max_backoff_seconds}
                        onChange={(event) => updateRetryDraft(category, { max_backoff_seconds: Number(event.target.value) || draft.initial_backoff_seconds })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Backoff multiplier
                      <input
                        type="number"
                        step="0.1"
                        min={1}
                        max={10}
                        value={draft.backoff_multiplier}
                        onChange={(event) => updateRetryDraft(category, { backoff_multiplier: Number(event.target.value) || 1 })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Escalate after attempts
                      <input
                        type="number"
                        min={1}
                        value={draft.escalate_after_attempts}
                        onChange={(event) => updateRetryDraft(category, { escalate_after_attempts: Number(event.target.value) || 1 })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={draft.preserve_checkpoint}
                        onChange={(event) => updateRetryDraft(category, { preserve_checkpoint: event.target.checked })}
                      />
                      Preserve checkpoint on failure
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <h3 style={{ margin: '8px 0 6px', fontSize: 14 }}>Recent failed runs</h3>
            {!retryRecovery || retryRecovery.recent_runs.length === 0 ? (
              <p className="of-text-muted" style={{ fontSize: 12 }}>No failed runs recorded yet for this source.</p>
            ) : (
              <table className="of-table" style={{ fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Category</th>
                    <th>Attempt</th>
                    <th>Decision</th>
                    <th>Next retry</th>
                    <th>Checkpoint</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {retryRecovery.recent_runs.map((run) => (
                    <tr key={run.run_id}>
                      <td>{run.run_id.slice(0, 8)}</td>
                      <td>{retryFailureCategoryLabel(run.category)}</td>
                      <td>{run.attempt}/{run.max_attempts}</td>
                      <td>{run.decision ? retryDecisionActionLabel(run.decision.action) : '—'}</td>
                      <td>{run.next_retry_at ? new Date(run.next_retry_at).toLocaleString() : '—'}</td>
                      <td>{run.has_checkpoint ? 'preserved' : '—'}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {retryPolicy?.updated_at && (
            <p className="of-text-muted" style={{ fontSize: 11, margin: 0 }}>
              Policy last updated {new Date(retryPolicy.updated_at).toLocaleString()}{retryPolicy.updated_by ? ` by ${retryPolicy.updated_by}` : ''}.
            </p>
          )}
        </section>
      )}

      {tab === 'name-location' && (
        <NameLocationPanel
          source={source}
          name={editName}
          description={editDescription}
          projectRid={editProjectRid}
          folderRid={editFolderRid}
          ownerId={editOwnerId}
          onNameChange={setEditName}
          onDescriptionChange={setEditDescription}
          onProjectRidChange={setEditProjectRid}
          onFolderRidChange={setEditFolderRid}
          onOwnerIdChange={setEditOwnerId}
          onSave={() => void saveConfiguration()}
          busy={busy}
        />
      )}

      {tab === 'export-config' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
          <p className="of-eyebrow">Export configuration</p>
          <h2 className="of-section-title" style={{ marginTop: 4 }}>Source-level export settings</h2>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            Manage default destinations, formats, and scheduling defaults for exports from this source.
            For per-export details, switch to <strong>Edit syncs › Exports</strong>.
          </p>
        </section>
      )}

      {tab === 'code-import-config' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
          <p className="of-eyebrow">Code import configuration</p>
          <h2 className="of-section-title" style={{ marginTop: 4 }}>Source-level code-import settings</h2>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            Configure which language runtimes, virtual-table providers, and destination conventions are
            allowed when this source is imported into transforms or compute modules.
            For per-import management, switch to <strong>Edit syncs › Code imports</strong>.
          </p>
        </section>
      )}

      {tab === 'output-folder' && (
        <OutputFolderPanel
          value={editOutputLocation}
          onChange={setEditOutputLocation}
          onSave={() => void saveConfiguration()}
          busy={busy}
        />
      )}

      {tab === 'configuration' && (
        <>
          <SourceSetupHeader
            worker={source.worker}
            pillRef={computePillRef}
            onComputeClick={() => setComputePopoverOpen((value) => !value)}
          />
          <ComputeTypePopover
            open={computePopoverOpen}
            anchorRef={computePillRef}
            source={source}
            onClose={() => setComputePopoverOpen(false)}
            onSourceUpdated={(next) => {
              setSource(next);
              setComputePopoverOpen(false);
            }}
            onMigrateClick={() => {
              setComputePopoverOpen(false);
              setMigrateWizardOpen(true);
            }}
          />
          <MigrateToFoundryWorkerWizard
            open={migrateWizardOpen}
            source={source}
            onClose={() => setMigrateWizardOpen(false)}
            onMigrated={(updated) => {
              setSource(updated);
              setMigrateWizardOpen(false);
            }}
          />

          <SelectAgentsPanel sourceId={source.id} />

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div>
              <p className="of-eyebrow">Connection settings</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>Server URL, ports, schema</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Secrets remain write-only; this card surfaces the safe configuration fields the API
                returns under <code>connectionConfig</code>.
              </p>
            </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
            <RegistryField label="Name" value={source.name} />
            <RegistryField label="Description" value={source.description ?? 'No description'} />
            <RegistryField label="Connector type" value={source.connector_type} />
            <RegistryField label="Worker" value={source.worker} />
            <RegistryField label="Project RID" value={source.project_rid ?? 'No project'} />
            <RegistryField label="Folder RID" value={source.folder_rid ?? 'No folder'} />
            <RegistryField label="Owner" value={ownerLabel(source)} />
            <RegistryField label="Default output location" value={source.default_output_location ?? 'No default output'} />
          </div>
          <pre style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 12, overflow: 'auto' }}>
            {JSON.stringify({
              id: source.id,
              connector_type: source.connector_type,
              worker: source.worker,
              project_rid: source.project_rid ?? null,
              folder_rid: source.folder_rid ?? null,
              owner_id: source.owner_id ?? null,
              network_policy_id: source.network_policy_id ?? null,
              credential_reference_ids: source.credential_reference_ids ?? [],
              default_output_location: source.default_output_location ?? null,
              supported_capabilities: capabilities,
            }, null, 2)}
          </pre>
          </section>
        </>
      )}

      {tab === 'explore' && (
        <>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Discovery</p>
                <h2 className="of-section-title" style={{ marginTop: 4 }}>Registrable sources</h2>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void discoverRegistrations()} disabled={busy} className="of-button">
                  Discover
                </button>
                <button type="button" onClick={() => setAllDiscovered(true)} disabled={busy || discovered.length === 0} className="of-button">
                  Select all
                </button>
                <button type="button" onClick={() => setAllDiscovered(false)} disabled={busy || discovered.length === 0} className="of-button">
                  Clear
                </button>
                <button type="button" onClick={() => setBulkDialogOpen(true)} disabled={busy || selectedDiscovered.length === 0} className="of-button of-button--primary">
                  Bulk register
                </button>
              </div>
            </header>


            <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div>
                <p className="of-eyebrow">Exploration session</p>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Browse folders, schemas, tables, topics, queues, and redacted samples. Sessions persist selectors and audit metadata, not secrets or unauthorized sample data.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={exploreSelector} onChange={(event) => setExploreSelector(event.target.value)} placeholder="optional selector/path" className="of-input" />
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <input type="checkbox" checked={includeSamples} onChange={(event) => setIncludeSamples(event.target.checked)} />
                  Request redacted sample rows
                </label>
                <button type="button" onClick={() => void exploreSource()} disabled={busy} className="of-button of-button--primary">
                  Explore
                </button>
                {nextExploreCursor ? (
                  <button type="button" onClick={() => void exploreSource(exploreSelector, nextExploreCursor)} disabled={busy} className="of-button">
                    Load more
                  </button>
                ) : null}
              </div>
              {explorationSession ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                  <span className="of-chip">session {explorationSession.id}</span>
                  <span className="of-chip">{explorationSession.status}</span>
                  <span className="of-chip">selectors {explorationSession.selectors_examined}</span>
                  <span className="of-chip">sample rows stored {explorationSession.sample_rows_stored}</span>
                  <span className="of-chip">secrets persisted: {String(explorationSession.secrets_persisted)}</span>
                </div>
              ) : null}
            </section>

            {registrationMessage && (
              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontSize: 12 }}>
                {registrationMessage}
              </div>
            )}

            {registrationErrors.length > 0 && (
              <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {registrationErrors.map((item) => (
                    <li key={`${item.selector}-${item.error}`}>
                      <code>{item.selector}</code>: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {discovered.length === 0 && explorationNodes.length === 0 ? (
              <div className="of-panel-muted" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                No discovery or exploration results loaded.
              </div>
            ) : (
              <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Pick</th>
                      <th style={tableHeaderStyle}>Source</th>
                      <th style={tableHeaderStyle}>Kind</th>
                      <th style={tableHeaderStyle}>Mode</th>
                      <th style={tableHeaderStyle}>Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(discovered.length > 0 ? discovered : explorationNodes.map((node) => ({
                      selector: node.selector,
                      display_name: node.display_name,
                      source_kind: node.kind,
                      supports_sync: node.supports_sync,
                      supports_zero_copy: node.supports_zero_copy,
                      source_signature: node.source_signature,
                      schema: node.schema,
                      sample_rows: node.sample_rows,
                      sample_redacted: node.sample_redacted,
                      unauthorized_sample_count: node.unauthorized_sample_count,
                    }))).map((item) => (
                      <tr key={item.selector}>
                        <td style={tableCellStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedSelectors[item.selector])}
                            onChange={(event) => setSelectedSelectors((prev) => ({ ...prev, [item.selector]: event.target.checked }))}
                            aria-label={`Select ${discoveredLabel(item)}`}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <strong>{discoveredLabel(item)}</strong>
                          <div style={{ marginTop: 2, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.selector}</div>
                        </td>
                        <td style={tableCellStyle}>{item.source_kind ?? '-'}</td>
                        <td style={tableCellStyle}>
                          {item.supports_zero_copy ? <span className="of-chip">zero-copy</span> : null}
                          {item.supports_sync !== false ? <span className="of-chip" style={{ marginLeft: item.supports_zero_copy ? 4 : 0 }}>sync</span> : null}
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {item.source_signature ?? '-'}
                          {(item.schema ?? []).length > 0 ? <div>{(item.schema ?? []).slice(0, 3).map((field) => field.name).join(', ')}</div> : null}
                          {item.sample_rows?.length ? <div>{item.sample_redacted ? 'redacted sample' : 'sample'}: {item.sample_rows.length} row(s)</div> : null}
                          {item.unauthorized_sample_count ? <div>{item.unauthorized_sample_count} unauthorized sample row(s) withheld</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <p className="of-eyebrow">Registered ({registrations.length})</p>
                <h2 className="of-section-title" style={{ marginTop: 4 }}>Current registrations</h2>
              </div>
              <button type="button" onClick={() => void loadRegistrations()} disabled={busy || registrationsLoading} className="of-button">
                Refresh
              </button>
            </header>
            {registrationsLoading ? (
              <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>Loading registrations...</p>
            ) : registrations.length === 0 ? (
              <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>No registrations yet.</p>
            ) : (
              <div style={{ marginTop: 12, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Name</th>
                      <th style={tableHeaderStyle}>Selector</th>
                      <th style={tableHeaderStyle}>Mode</th>
                      <th style={tableHeaderStyle}>Target</th>
                      <th style={tableHeaderStyle}>Automation</th>
                      <th style={tableHeaderStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((registration) => (
                      <tr key={registration.id}>
                        <td style={tableCellStyle}>
                          <strong>{registration.display_name || registration.selector}</strong>
                          <div style={{ color: 'var(--text-muted)' }}>{registration.source_kind ?? '-'}</div>
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{registration.selector}</td>
                        <td style={tableCellStyle}>{registration.registration_mode ?? '-'}</td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{registration.target_dataset_id ?? '-'}</td>
                        <td style={tableCellStyle}>
                          {registration.auto_sync ? <span className="of-chip">auto sync</span> : null}
                          {registration.update_detection ? <span className="of-chip" style={{ marginLeft: registration.auto_sync ? 4 : 0 }}>updates</span> : null}
                          {!registration.auto_sync && !registration.update_detection ? '-' : null}
                        </td>
                        <td style={tableCellStyle}>
                          <button type="button" onClick={() => void deleteRegistration(registration.id)} disabled={busy} className="of-button" style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'networking' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div>
            <p className="of-eyebrow">Attached policies ({attached.length})</p>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Connection tests validate host, port, protocol, proxy mode, policy status, and allowed organizations before contacting external systems.
            </p>
          </div>
          <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6, fontSize: 12 }}>
            <strong>Agent health</strong>
            {sourceAgents.length ? sourceAgents.map((agent) => (
              <div key={`${source.id}-agent-${agent.id}`}>
                {agent.name} · {connectorAgentHealthLabel(agent)}
                {(agent.assigned_proxy_policies ?? []).filter((policy) => policy.source_id === source.id || attachedPolicyIds.includes(policy.policy_id)).length > 0 ? (
                  <span className="of-text-muted"> · proxy policies {(agent.assigned_proxy_policies ?? []).filter((policy) => policy.source_id === source.id || attachedPolicyIds.includes(policy.policy_id)).map((policy) => policy.policy_name || policy.policy_id).join(', ')}</span>
                ) : null}
              </div>
            )) : (
              <span className="of-text-muted">No connector agent has reported this source or its attached proxy policies.</span>
            )}
            {sourceAgentFailures.length ? (
              <div style={{ color: '#b91c1c' }}>{sourceAgentFailures.map((failure) => `${failure.code}: ${failure.message}`).join(' ')}</div>
            ) : null}
          </div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {attached.map((p) => (
              <li key={p.id} style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>
                  <strong>{p.name}</strong> · <code>{p.address.kind}:{p.address.value}:{p.port.kind === 'any' ? 'any' : p.port.value}</code>
                  <span className="of-text-muted" style={{ display: 'block', fontSize: 11 }}>
                    {p.kind} · {p.protocol ?? 'tcp'} · proxy {p.proxy_mode ?? 'none'} · status {p.status ?? 'active'} · orgs {(p.allowed_organizations ?? []).join(', ') || 'any'}
                  </span>
                </span>
                <button type="button" onClick={() => void detachPolicy(p.id)} disabled={busy} className="of-button" style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                  Detach
                </button>
              </li>
            ))}
            {attached.length === 0 && <li className="of-text-muted">No attached policies.</li>}
          </ul>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={pickPolicyId} onChange={(e) => setPickPolicyId(e.target.value)} className="of-input">
              <option value="">— pick existing policy —</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.kind} · {p.status ?? 'active'}</option>
              ))}
            </select>
            <button type="button" onClick={() => void attachPolicy()} disabled={busy || !pickPolicyId} className="of-button of-button--primary">
              Attach existing
            </button>
          </div>
          <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Create and attach source policy</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              <LabeledInput label="Policy name" value={newPolicyName} onChange={setNewPolicyName} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Kind
                <select
                  value={newPolicyKind}
                  onChange={(event) => {
                    const next = event.target.value as EgressPolicyKind;
                    setNewPolicyKind(next);
                    if (next === 'agent_proxy' && newPolicyProxyMode === 'none') setNewPolicyProxyMode('http_connect');
                    if (next === 'direct') setNewPolicyProxyMode('none');
                  }}
                  className="of-input"
                >
                  <option value="direct">Direct egress</option>
                  <option value="agent_proxy">Agent proxy</option>
                </select>
              </label>
              <LabeledInput label="Host" value={newPolicyHost} onChange={setNewPolicyHost} />
              <LabeledInput label="Port" value={newPolicyPort} onChange={setNewPolicyPort} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Protocol
                <select value={newPolicyProtocol} onChange={(event) => setNewPolicyProtocol(event.target.value as EgressProtocol)} className="of-input">
                  {EGRESS_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Proxy mode
                <select value={newPolicyProxyMode} onChange={(event) => setNewPolicyProxyMode(event.target.value as AgentProxyMode)} className="of-input" disabled={newPolicyKind !== 'agent_proxy'}>
                  {PROXY_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
              <LabeledInput label="Allowed orgs" value={newPolicyOrgs} onChange={setNewPolicyOrgs} />
            </div>
            <button type="button" onClick={() => void createAndAttachPolicy()} disabled={busy || !newPolicyHost.trim()} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Create and attach
            </button>
          </section>
        </section>
      )}

      {tab === 'credentials' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div>
            <p className="of-eyebrow">Credentials ({credentials.length})</p>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Secret values are write-only. The UI shows encrypted/external-reference metadata, rotation, test status, usage, and audit events.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {credentials.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                <strong>{c.kind}</strong>
                <span>storage: {c.storage_mode ?? 'encrypted_secret'} · version {c.secret_version ?? 'v1'} · fingerprint <code>{c.fingerprint}</code></span>
                <span>rotated: {c.last_rotated_at ?? c.created_at} · created by {c.created_by ?? 'unknown'} · test {c.test_status ?? 'untested'}{c.last_tested_at ? ` at ${c.last_tested_at}` : ''}</span>
                <span>usage: {c.usage?.source_count ?? 1} source(s) · last used {c.usage?.last_used_at ?? 'never'} · external ref {c.external_secret_ref ?? c.cloud_identity_ref ?? 'none'}</span>
                {(c.audit_events ?? []).length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(c.audit_events ?? []).slice(0, 3).map((event) => (
                      <li key={event.id}>{event.created_at} · {event.event_type} · {event.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {credentials.length === 0 && <p className="of-text-muted" style={{ margin: 0 }}>No credentials stored.</p>}
          </div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ fontSize: 13 }}>Kind
                <select value={credKind} onChange={(e) => setCredKind(e.target.value as CredentialKind)} className="of-input" style={{ marginTop: 4 }}>
                  {CREDENTIAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Storage
                <select value={credStorageMode} onChange={(e) => setCredStorageMode(e.target.value as CredentialStorageMode)} className="of-input" style={{ marginTop: 4 }}>
                  {STORAGE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
              <LabeledInput label="Secret version" value={credVersion} onChange={setCredVersion} />
              <LabeledInput label="External secret ref" value={credExternalRef} onChange={setCredExternalRef} />
              <LabeledInput label="Cloud identity ref" value={credCloudIdentityRef} onChange={setCredCloudIdentityRef} />
            </div>
            <label style={{ fontSize: 13 }}>
              Value (write-only)
              <input type="password" value={credValue} onChange={(e) => setCredValue(e.target.value)} className="of-input" style={{ marginTop: 4 }} disabled={credStorageMode !== 'encrypted_secret'} />
            </label>
            <button type="button" onClick={() => void setCredential()} disabled={busy || (credStorageMode === 'encrypted_secret' && !credValue.trim())} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Save credential metadata
            </button>
          </div>
        </section>
      )}

      {tab === 'capabilities' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          {registryEntry ? (
            <>
              <div>
                <p className="of-eyebrow">{registryEntry.name}</p>
                <p className="of-text-muted" style={{ fontSize: 12 }}>{registryEntry.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 999 }}>
                  {connectorCategoryLabel(registryEntry.category)}
                </span>
                {registryEntry.capabilities.map((c) => (
                  <span key={c} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 999 }}>{capabilityLabel(c)}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
                <RegistryField label="Worker compatibility" value={registryEntry.workers.join(', ')} />
                <RegistryField label="Credential fields" value={registryEntry.credentialFields.length === 0 ? 'No secret fields' : registryEntry.credentialFields.map((field) => `${field.label}${field.secret ? ' (secret)' : ''}`).join(', ')} />
                <RegistryField label="Network requirements" value={registryEntry.network.notes} />
                <RegistryField label="Feature flags" value={Object.entries(registryEntry.featureFlags).filter(([, enabled]) => enabled).map(([flag]) => flag).join(', ') || 'None enabled'} />
              </div>
            </>
          ) : (
            <p className="of-text-muted">No catalog entry for connector type {source.connector_type}.</p>
          )}

          <ConnectorCapabilityPackPanel pack={capabilityPack} worker={source.worker} />
        </section>
      )}

      {tab === 'virtual-tables' && (
        virtualTableProvider ? (
          <VirtualTablesTab sourceRid={source.id} provider={virtualTableProvider} />
        ) : (
          <PlaceholderPanel title="Virtual tables" description="This connector does not currently advertise virtual table support." />
        )
      )}

      {tab === 'syncs' && (
        <>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div>
              <p className="of-eyebrow">Create CDC sync</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Changelog sync setup captures connector-derived primary key, ordering, deletion, schema, start position, and output stream metadata.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Input kind
                <select value={cdcInputKind} onChange={(event) => setCdcInputKind(event.target.value as CdcSyncInputKind)} className="of-input">
                  <option value="relational_connector">Relational connector log</option>
                  <option value="streaming_middleware_changelog">Streaming changelog input</option>
                </select>
              </label>
              <LabeledInput label="Source database" value={cdcSourceDatabase} onChange={setCdcSourceDatabase} />
              <LabeledInput label="Source schema" value={cdcSourceSchema} onChange={setCdcSourceSchema} />
              <LabeledInput label="Source table" value={cdcSourceTable} onChange={setCdcSourceTable} />
              <LabeledInput label="Source topic/queue/stream" value={cdcSourceTopic} onChange={setCdcSourceTopic} />
              <LabeledInput label="Primary key columns" value={cdcPrimaryKeysRaw} onChange={setCdcPrimaryKeysRaw} />
              <LabeledInput label="Ordering column" value={cdcOrderingColumn} onChange={setCdcOrderingColumn} />
              <LabeledInput label="Deletion column" value={cdcDeletionColumn} onChange={setCdcDeletionColumn} />
              <LabeledInput label="Output stream" value={cdcOutputStream} onChange={setCdcOutputStream} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Start position
                <select value={cdcStartPosition} onChange={(event) => setCdcStartPosition(event.target.value as CdcStartPosition)} className="of-input">
                  {CDC_START_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                </select>
              </label>
              <LabeledInput label="Start position value" value={cdcStartPositionValue} onChange={setCdcStartPositionValue} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Output schema JSON
                <textarea className="of-input" value={cdcSchemaJson} onChange={(event) => setCdcSchemaJson(event.target.value)} rows={5} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Connector metadata JSON
                <textarea className="of-input" value={cdcMetadataJson} onChange={(event) => setCdcMetadataJson(event.target.value)} rows={5} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={cdcDatabaseEnabled} onChange={(event) => setCdcDatabaseEnabled(event.target.checked)} />
                Database exposes changelog data
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={cdcTableEnabled} onChange={(event) => setCdcTableEnabled(event.target.checked)} />
                Table exposes changelog data
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={cdcChangelogShapeValidated} onChange={(event) => setCdcChangelogShapeValidated(event.target.checked)} />
                Streaming input has changelog columns
              </label>
            </div>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
              Connector CDC support: {canCreateCdcSync ? 'available' : 'not advertised'} · default input: {cdcInputKindForConnector(source.connector_type) ?? 'manual'}
            </p>
            <button type="button" onClick={() => void createCdcSync()} disabled={busy || !canCreateCdcSync} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Create CDC sync
            </button>
          </section>

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div>
              <p className="of-eyebrow">Create streaming sync</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Long-running syncs read supported topics, queues, or streams into OpenFoundry streams and use start/stop controls instead of one-shot runs.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <LabeledInput label="Source topic/queue/stream" value={streamTopic} onChange={setStreamTopic} />
              <LabeledInput label="Consumer group" value={streamConsumerGroup} onChange={setStreamConsumerGroup} />
              <LabeledInput label="Key fields" value={streamKeyFieldsRaw} onChange={setStreamKeyFieldsRaw} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Start offset
                <select value={streamStartOffset} onChange={(event) => setStreamStartOffset(event.target.value as StreamingStartOffset)} className="of-input">
                  {STREAMING_START_OFFSETS.map((offset) => <option key={offset} value={offset}>{offset}</option>)}
                </select>
              </label>
              <LabeledInput label="Start offset value" value={streamStartOffsetValue} onChange={setStreamStartOffsetValue} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Consistency
                <select value={streamConsistency} onChange={(event) => setStreamConsistency(event.target.value as 'AT_LEAST_ONCE' | 'EXACTLY_ONCE')} className="of-input">
                  <option value="AT_LEAST_ONCE">At least once</option>
                  <option value="EXACTLY_ONCE">Exactly once</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Runtime
                <select value={streamRuntime} onChange={(event) => setStreamRuntime(event.target.value as StreamingRuntimeKind)} className="of-input">
                  {STREAMING_RUNTIMES.map((runtime) => <option key={runtime} value={runtime}>{runtime}</option>)}
                </select>
              </label>
              <LabeledInput label="Checkpoint interval ms" value={streamCheckpointInterval} onChange={setStreamCheckpointInterval} />
              <LabeledInput label="Output stream location" value={streamOutputLocation} onChange={setStreamOutputLocation} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={streamSourceExactlyOnce} onChange={(event) => setStreamSourceExactlyOnce(event.target.checked)} />
                Source supports exactly-once
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={streamSinkExactlyOnce} onChange={(event) => setStreamSinkExactlyOnce(event.target.checked)} />
                Sink supports exactly-once
              </label>
            </div>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
              Consistency evaluation: {evaluateStreamingConsistency({ requested: streamConsistency, runtime: streamRuntime, sourceSupportsExactlyOnce: streamSourceExactlyOnce, sinkSupportsExactlyOnce: streamSinkExactlyOnce }).effective}
              {evaluateStreamingConsistency({ requested: streamConsistency, runtime: streamRuntime, sourceSupportsExactlyOnce: streamSourceExactlyOnce, sinkSupportsExactlyOnce: streamSinkExactlyOnce }).reason ? ` · ${evaluateStreamingConsistency({ requested: streamConsistency, runtime: streamRuntime, sourceSupportsExactlyOnce: streamSourceExactlyOnce, sinkSupportsExactlyOnce: streamSinkExactlyOnce }).reason}` : ''}
            </p>
            <button type="button" onClick={() => void createStreamingSync()} disabled={busy || !streamTopic.trim()} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Create streaming sync
            </button>
            {streamingSyncs.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {streamingSyncs.map((sync) => (
                  <li key={sync.id}>
                    <strong>{sync.source_topic}</strong> → {sync.output_stream_id || sync.output_stream_location} · {sync.status} · checkpoint {sync.checkpoint_interval_ms}ms
                    <button type="button" onClick={() => void startStreamingSync(sync.id)} disabled={busy || !streamingSyncCanStart(sync.status)} className="of-button" style={{ marginLeft: 8, fontSize: 11 }}>Start</button>
                    <button type="button" onClick={() => void stopStreamingSync(sync.id)} disabled={busy || !streamingSyncCanStop(sync.status)} className="of-button" style={{ marginLeft: 4, fontSize: 11 }}>Stop</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div>
              <p className="of-eyebrow">Create sync resource</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Define the source selector, capability, output resource, schema/write behavior, schedule, and build integration. Batch syncs create or select an OpenFoundry dataset output.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Capability
                <select value={newSyncCapability} onChange={(event) => {
                  const next = event.target.value as SyncCapabilityType;
                  setNewSyncCapability(next);
                  setNewWriteMode(defaultWriteModeForCapability(next));
                  setNewTransactionMode(defaultTransactionModeForCapability(next));
                }} className="of-input">
                  {SYNC_CAPABILITIES.filter((capability) => capabilities.includes(capability)).map((capability) => <option key={capability} value={capability}>{syncCapabilityLabel(capability)}</option>)}
                </select>
              </label>
              <LabeledInput label="Source path/table/topic" value={newSourceSelector} onChange={setNewSourceSelector} />
              <LabeledInput label="Output dataset / stream / media set" value={newOutputDataset} onChange={setNewOutputDataset} />
              <LabeledInput label="File glob / filter" value={newFileGlob} onChange={setNewFileGlob} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Write mode
                <select value={newWriteMode} onChange={(event) => setNewWriteMode(event.target.value as SyncWriteMode)} className="of-input">
                  {SYNC_WRITE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Transaction mode
                <select value={newTransactionMode} onChange={(event) => setNewTransactionMode(event.target.value as SyncTransactionMode)} className="of-input">
                  {SYNC_TRANSACTION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
              <LabeledInput label="Schedule / cron" value={newScheduleCron} onChange={setNewScheduleCron} />
              <LabeledInput label="Build integration" value={newBuildIntegration} onChange={setNewBuildIntegration} />
            </div>
            <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div>
                <p className="of-eyebrow">File sync modes</p>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Configure snapshot mirrors, incremental appends, or a historical snapshot followed by recent-file incrementals. Low-level filters are persisted for backend transaction planning.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Mode
                  <select value={fileSyncMode} onChange={(event) => {
                    const mode = event.target.value as FileSyncMode;
                    setFileSyncMode(mode);
                    setNewWriteMode(mode === 'snapshot_mirror' ? 'snapshot' : 'append');
                  }} className="of-input">
                    {FILE_SYNC_MODES.map((mode) => <option key={mode} value={mode}>{fileSyncModeLabel(mode)}</option>)}
                  </select>
                </label>
                <LabeledInput label="Include globs" value={includeGlobsRaw} onChange={setIncludeGlobsRaw} />
                <LabeledInput label="Exclude globs" value={excludeGlobsRaw} onChange={setExcludeGlobsRaw} />
                <LabeledInput label="File count limit" value={fileCountLimit} onChange={setFileCountLimit} />
                <LabeledInput label="Historical cutoff" value={historicalCutoff} onChange={setHistoricalCutoff} />
                <LabeledInput label="Recent window" value={incrementalRecentWindow} onChange={setIncrementalRecentWindow} />
                <LabeledInput label="Path metadata columns" value={pathMetadataColumnsRaw} onChange={setPathMetadataColumnsRaw} />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={excludeAlreadySynced} onChange={(event) => setExcludeAlreadySynced(event.target.checked)} />
                  Exclude already-synced files
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={includePathMetadata} onChange={(event) => setIncludePathMetadata(event.target.checked)} />
                  Include path metadata columns
                </label>
              </div>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                Dataset transaction: {datasetTransactionTypeForFileMode(fileSyncMode)}
              </p>
            </section>

            <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div>
                <p className="of-eyebrow">Table batch syncs</p>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Select one or more discovered tables, infer schemas, and capture row-count and transaction metadata for snapshot or incremental table syncs.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Mode
                  <select value={tableSyncMode} onChange={(event) => setTableSyncMode(event.target.value as TableBatchSyncMode)} className="of-input">
                    {TABLE_SYNC_MODES.map((mode) => <option key={mode} value={mode}>{tableBatchSyncModeLabel(mode)}</option>)}
                  </select>
                </label>
                <LabeledInput label="Tables (comma/newline)" value={tableNamesRaw} onChange={setTableNamesRaw} />
                <LabeledInput label="Incremental column" value={tableIncrementalColumn} onChange={setTableIncrementalColumn} />
                <LabeledInput label="Estimated row count" value={estimatedRowCount} onChange={setEstimatedRowCount} />
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={inferTableSchema} onChange={(event) => setInferTableSchema(event.target.checked)} />
                Infer source and destination schemas before the first run
              </label>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                Dataset transaction: {datasetTransactionTypeForTableMode(tableSyncMode)}
              </p>
            </section>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={createOutputDataset} onChange={(event) => setCreateOutputDataset(event.target.checked)} />
              Create output dataset when no existing dataset is selected
            </label>
            <button type="button" onClick={() => void createSync()} disabled={busy} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Create sync
            </button>
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Syncs ({syncs.length})</p>
            <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
              {syncs.map((s) => (
                <li key={s.id} style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)' }}>
                  <strong>{s.id}</strong> · {syncCapabilityLabel(s.capability_type ?? 'batch_sync')} → {s.output_dataset_id || s.output_stream_id || s.output_media_set_id}
                  {s.source_selector && <> · source: <code>{s.source_selector}</code></>}
                  {s.write_mode && <> · write: {s.write_mode}</>}
                  {s.transaction_mode && <> · transaction: {s.transaction_mode}</>}
                  {s.health?.state && <> · health: {s.health.state}</>}
                  {s.next_run_at && <> · next: {s.next_run_at}</>}
                  {s.file_glob && <> · glob: <code>{s.file_glob}</code></>}
                  {s.schedule_cron && <> · cron: <code>{s.schedule_cron}</code></>}
                  {s.dataset_transaction_type && <> · dataset tx: {s.dataset_transaction_type}</>}
                  {s.file_sync && <> · file mode: {fileSyncModeLabel(s.file_sync.mode)}</>}
                  {s.table_sync && <> · table mode: {tableBatchSyncModeLabel(s.table_sync.mode)} · tables: {s.table_sync.selected_tables.map((table) => table.source_table).join(', ')}</>}
                  {s.cdc_sync && <> · cdc: {(s.cdc_sync.source_table || s.cdc_sync.source_topic || s.source_selector) ?? 'changelog'} · pk {s.cdc_sync.primary_key_columns.join(', ')} · order {s.cdc_sync.ordering_column}</>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" onClick={() => void runSync(s.id)} disabled={busy || s.output_kind === 'stream'} className="of-button" style={{ fontSize: 11 }}>
                      Run sync
                    </button>
                    <button type="button" onClick={() => void loadRuns(s.id)} disabled={busy} className="of-button" style={{ fontSize: 11 }}>
                      Refresh runs
                    </button>
                  </div>
                  {runsBySync[s.id] && (
                    <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11 }}>
                      {runsBySync[s.id].map((r) => (
                        <li key={r.id}>
                          {syncRunStatusLabel(r.status)} · {r.started_at ? new Date(r.started_at).toLocaleString() : r.queued_at ?? 'not started'} · {syncRunDurationMs(r) !== null ? `${syncRunDurationMs(r)}ms · ` : ''}{r.bytes_written} bytes · {r.files_written} files · rows {r.rows_written ?? r.records_written ?? 0} · retries {r.retry_count ?? 0}
                          {r.worker && ` · worker ${r.worker}`}{r.agent_id && ` · agent ${r.agent_id}`}{r.output_transaction?.transaction_id && ` · tx ${r.output_transaction.transaction_id}`}
                          {r.source_progress?.file_checkpoints?.length ? ` · checkpoints ${r.source_progress.file_checkpoints.length}` : ''}
                          {buildHistoryHref(r.build) ? <> · <a href={buildHistoryHref(r.build) ?? undefined}>Build history</a></> : null}
                          {r.error && ` · ${r.error}`}
                          {(r.logs ?? []).slice(-2).map((log) => <div key={`${r.id}-${log.timestamp}-${log.message}`} className="of-text-muted">{log.timestamp} · {log.level}: {log.message}</div>)}
                        </li>
                      ))}
                      {runsBySync[s.id].length === 0 && <li className="of-text-muted">No runs.</li>}
                    </ul>
                  )}
                  <DeadLetterQuarantinePanel
                    syncId={s.id}
                    sink={deadLetterSinks[s.id] ?? null}
                    draft={quarantineDraft(s.id)}
                    summary={quarantineSummaries[s.id] ?? null}
                    selection={quarantineSelection[s.id] ?? {}}
                    busy={Boolean(quarantineBusy[s.id])}
                    expanded={Boolean(quarantineExpanded[s.id])}
                    onToggle={() => toggleQuarantineExpanded(s.id)}
                    onDraftChange={(patch) => updateDeadLetterDraft(s.id, patch)}
                    onSave={() => void saveDeadLetterSink(s.id)}
                    onSelect={(recordId) => toggleQuarantineSelection(s.id, recordId)}
                    onReplay={() => void replayQuarantine(s.id)}
                  />
                </li>
              ))}
              {syncs.length === 0 && <li className="of-text-muted">No syncs yet.</li>}
            </ul>
          </section>
        </>
      )}


      {tab === 'streams' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p className="of-eyebrow">Streams ({streams.length})</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Tabular streaming resources with hot buffer, cold/archive dataset, branches, checkpoints, replay, consumers, and source sync links.
              </p>
            </div>
            <button type="button" className="of-button" onClick={() => void loadStreams()} disabled={busy}>Refresh streams</button>
          </header>
          <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <div>
              <p className="of-eyebrow">Push-based ingestion</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Authenticated REST push endpoint: {pushStreamEndpointUrl(pushDatasetRid || 'ri.foundry.main.dataset...', pushBranch || 'master')}. {recommendStreamIngestion({ sourceConnectorExists: pushSourceConnectorExists, inboundSystemCanAuthenticate: pushCanAuthenticate, inboundSystemConformsToSchema: pushConformsToSchema }).message}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Stream
                <select value={pushStreamId} onChange={(event) => {
                  const next = streams.find((stream) => stream.id === event.target.value);
                  setPushStreamId(event.target.value);
                  if (next) {
                    setPushDatasetRid(next.rid ?? next.id);
                    setPushBranch(next.branch);
                  }
                }} className="of-input">
                  <option value="">Select stream</option>
                  {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
                </select>
              </label>
              <LabeledInput label="Dataset RID" value={pushDatasetRid} onChange={setPushDatasetRid} />
              <LabeledInput label="Branch" value={pushBranch} onChange={setPushBranch} />
              <LabeledInput label="Token reference" value={pushTokenRef} onChange={setPushTokenRef} />
              <LabeledInput label="Idempotency key" value={pushIdempotencyKey} onChange={setPushIdempotencyKey} />
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Records JSON
              <textarea className="of-input" value={pushRecordsJson} onChange={(event) => setPushRecordsJson(event.target.value)} rows={4} />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={pushSourceConnectorExists} onChange={(event) => setPushSourceConnectorExists(event.target.checked)} />Source connector exists</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={pushCanAuthenticate} onChange={(event) => setPushCanAuthenticate(event.target.checked)} />Inbound system can authenticate</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={pushConformsToSchema} onChange={(event) => setPushConformsToSchema(event.target.checked)} />Records conform to stream schema</label>
            </div>
            <button type="button" className="of-button of-button--primary" onClick={() => void pushStreamRecords()} disabled={busy || !pushStreamId}>Push records</button>
          </div>
          {streams.length === 0 ? <p className="of-text-muted">No streams linked to this source yet.</p> : null}
          {streams.map((stream) => (
            <article key={stream.id} className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{stream.name}</strong>
                  <div className="of-text-muted" style={{ fontSize: 12 }}>{stream.id} · branch {stream.branch} · {stream.consistency_guarantee}</div>
                </div>
                <span className="of-chip">{stream.health.state}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, fontSize: 12 }}>
                <RegistryField label="Hot buffer" value={`${stream.hot_buffer.hot_buffer_retention_ms}ms retention · ${stream.hot_buffer.hot_buffer_bytes ?? 0} bytes`} />
                <RegistryField label="Cold/archive dataset" value={stream.cold_storage.cold_dataset_id ?? stream.cold_storage.archive_dataset_id ?? 'Not archived'} />
                <RegistryField label="Archive policy" value={streamArchivePolicyLabel(stream.archive_policy)} />
                <RegistryField label="Hybrid read" value={streamHybridReadLabel(stream.hybrid_read)} />
                <RegistryField label="Offsets" value={`earliest ${stream.offsets.earliest_offset ?? '-'} · latest ${stream.offsets.latest_offset ?? '-'} · committed ${stream.offsets.committed_offset ?? '-'} · lag ${stream.offsets.lag ?? '-'}`} />
                <RegistryField label="Replay" value={streamReplayRangeLabel(stream.replay)} />
                <RegistryField label="Restart plan" value={(stream.restart_plan ?? restartPlanForStream(stream)).can_restart ? `Restart from ${(stream.restart_plan ?? restartPlanForStream(stream)).latest_completed_checkpoint_id}` : ((stream.restart_plan ?? restartPlanForStream(stream)).reason ?? 'Unavailable')} />
                <RegistryField label="Consistency mode" value={stream.consistency ? `${stream.consistency.effective}${stream.consistency.downgraded ? ' (downgraded)' : ''}${stream.consistency.duplicate_tolerant_consumers_required ? ' · duplicate-tolerant consumers required' : ''}` : stream.consistency_guarantee} />
                <RegistryField label="CDC resolution" value={stream.cdc_metadata ? `pk ${stream.cdc_metadata.primary_key_columns.join(', ')} · order ${stream.cdc_metadata.ordering_column}${stream.cdc_metadata.deletion_column ? ` · delete ${stream.cdc_metadata.deletion_column}` : ''}` : 'Not a CDC stream'} />
                <RegistryField label="Permissions" value={`readers ${stream.permissions.readers.length} · writers ${stream.permissions.writers.length} · admins ${stream.permissions.admins.length}`} />
                <RegistryField label="Source syncs" value={stream.source_sync_ids.join(', ') || 'None'} />
              </div>
              <StreamSchemaDetails stream={stream} />
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={tableHeaderStyle}>Checkpoints</th><th style={tableHeaderStyle}>Consumers</th><th style={tableHeaderStyle}>Rows preview</th></tr></thead>
                  <tbody><tr>
                    <td style={tableCellStyle}>{stream.checkpoints.slice(0, 3).map((checkpoint) => `${checkpoint.status}@${checkpoint.offset ?? '-'}${checkpoint.last_processed_source_location ? ` ${checkpoint.last_processed_source_location}` : ''}${checkpoint.size_bytes ? ` ${checkpoint.size_bytes}B` : ''}`).join(', ') || '-'}</td>
                    <td style={tableCellStyle}>{stream.consumers.slice(0, 3).map((consumer) => `${consumer.name} lag ${consumer.lag ?? '-'}`).join(', ') || '-'}</td>
                    <td style={tableCellStyle}>{[...(stream.live_view ?? []), ...(stream.archive_view ?? [])].slice(0, 3).map((row) => `${streamStorageLabel(row.source)}#${row.offset}`).join(', ') || '-'}</td>
                  </tr></tbody>
                </table>
              </div>
              <CdcStreamViews stream={stream} />
              <CdcDownstreamIntegrationPanel stream={stream} />
              <StreamMetricsPanel snapshot={streamMetrics[stream.id] ?? null} window={streamMetricsWindow} onWindowChange={refreshStreamMetrics} />
              <StreamReplayPlanPanel
                stream={stream}
                draft={streamReplayDraft(stream.id)}
                plan={streamReplayPlans[stream.id] ?? null}
                busy={Boolean(streamReplayBusy[stream.id])}
                onDraftChange={(patch) => updateStreamReplayDraft(stream.id, patch)}
                onToggleAck={(warningId) => toggleStreamReplayAck(stream.id, warningId)}
                onEvaluate={() => void evaluateStreamReplayPlan(stream)}
              />
            </article>
          ))}

          <ListenerInboundPanel descriptor={listenerInbound} />
        </section>
      )}

      {tab === 'exports' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p className="of-eyebrow">Exports ({dataExports.length})</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Supported export types: {supportedExportTypes.length ? supportedExportTypes.map(dataExportTypeLabel).join(', ') : 'none advertised for this connector'}.
              </p>
            </div>
            <button type="button" className="of-button" onClick={() => void loadExports()} disabled={busy}>Refresh exports</button>
          </header>
          <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Create export resource</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <LabeledInput label="Export name" value={newExportName} onChange={setNewExportName} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Type
                <select
                  value={newExportType}
                  onChange={(event) => {
                    const next = event.target.value as DataExportType;
                    setNewExportType(next);
                    setNewExportMode(defaultExportModeForType(next));
                  }}
                  className="of-input"
                >
                  {DATA_EXPORT_TYPES.map((type) => (
                    <option key={type} value={type} disabled={!sourceSupportsExportType(source, type)}>
                      {dataExportTypeLabel(type)}{sourceSupportsExportType(source, type) ? '' : ' (unsupported)'}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Mode
                <select
                  value={newExportMode}
                  onChange={(event) => {
                    const next = event.target.value as DataExportMode;
                    setNewExportMode(next);
                    if (newExportType === 'table' && tableExportModeRequiresTruncate(next)) {
                      setTableTruncatePermission(true);
                    }
                  }}
                  className="of-input"
                >
                  {DATA_EXPORT_MODES[newExportType].map((mode) => <option key={mode} value={mode}>{dataExportModeLabel(mode)}</option>)}
                </select>
              </label>
              <LabeledInput
                label={newExportType === 'streaming' ? 'Input stream' : 'Input dataset RID'}
                value={newExportType === 'streaming' ? exportInputStream : exportInputDataset}
                onChange={newExportType === 'streaming' ? setExportInputStream : setExportInputDataset}
              />
              <LabeledInput
                label={newExportType === 'file' ? 'Destination path' : newExportType === 'table' ? 'Destination table' : 'Destination topic'}
                value={exportDestination}
                onChange={setExportDestination}
              />
              <LabeledInput label="Schedule cron" value={exportScheduleCron} onChange={setExportScheduleCron} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {newExportType === 'file' && (
                <>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Overwrite behavior
                    <select value={fileOverwriteBehavior} onChange={(event) => setFileOverwriteBehavior(event.target.value as FileExportOverwriteBehavior)} className="of-input">
                      {FILE_EXPORT_OVERWRITE_BEHAVIORS.map((behavior) => <option key={behavior} value={behavior}>{fileExportOverwriteBehaviorLabel(behavior)}</option>)}
                    </select>
                  </label>
                  <LabeledInput label="Destination subfolder" value={fileDestinationSubfolder} onChange={setFileDestinationSubfolder} />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={filePreserveDirectory} onChange={(event) => setFilePreserveDirectory(event.target.checked)} />
                    Preserve directory structure
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={fileFullReexport} onChange={(event) => setFileFullReexport(event.target.checked)} />
                    Full re-export workaround
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>File manifest JSON
                    <textarea className="of-input" value={fileManifestJson} onChange={(event) => setFileManifestJson(event.target.value)} rows={3} />
                  </label>
                </>
              )}
              {newExportType === 'table' && (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={tableInputParquetBacked} onChange={(event) => setTableInputParquetBacked(event.target.checked)} />
                    Parquet-backed input
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={tableDestinationExists} onChange={(event) => setTableDestinationExists(event.target.checked)} />
                    Destination table exists
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={tableTruncatePermission} onChange={(event) => setTableTruncatePermission(event.target.checked)} />
                    Truncate permission
                  </label>
                  <LabeledInput label="Row count estimate" value={tableRowCountEstimate} onChange={setTableRowCountEstimate} />
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Dataset schema JSON
                    <textarea className="of-input" value={tableDatasetSchemaJson} onChange={(event) => setTableDatasetSchemaJson(event.target.value)} rows={5} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Destination schema JSON
                    <textarea className="of-input" value={tableDestinationSchemaJson} onChange={(event) => setTableDestinationSchemaJson(event.target.value)} rows={5} />
                  </label>
                </>
              )}
              {newExportType === 'streaming' && (
                <>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Replay behavior
                    <select value={exportStreamingReplayBehavior} onChange={(event) => setExportStreamingReplayBehavior(event.target.value as StreamingExportReplayBehavior)} className="of-input">
                      {STREAMING_EXPORT_REPLAY_BEHAVIORS.map((behavior) => <option key={behavior} value={behavior}>{streamingExportReplayBehaviorLabel(behavior)}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Start offset
                    <select value={exportStreamingStartOffset} onChange={(event) => setExportStreamingStartOffset(event.target.value as StreamingExportStartOffset)} className="of-input">
                      {STREAMING_EXPORT_START_OFFSETS.map((offset) => <option key={offset} value={offset}>{offset.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                  <LabeledInput label="Explicit offset" value={exportStreamingStartOffsetValue} onChange={setExportStreamingStartOffsetValue} />
                  <LabeledInput label="Last exported offset" value={exportStreamingLastOffset} onChange={setExportStreamingLastOffset} />
                  <LabeledInput label="Records estimate" value={exportStreamingRecordsEstimate} onChange={setExportStreamingRecordsEstimate} />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={exportStreamingScheduleRestart} onChange={(event) => setExportStreamingScheduleRestart(event.target.checked)} />
                    Schedule-triggered restart
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 18 }}>
                    <input type="checkbox" checked={exportStreamingReplayDetected} onChange={(event) => setExportStreamingReplayDetected(event.target.checked)} />
                    Replayed records detected
                  </label>
                </>
              )}
              <LabeledInput label="Allowed markings" value={exportAllowedMarkings} onChange={setExportAllowedMarkings} />
              <LabeledInput label="Allowed organizations" value={exportAllowedOrganizations} onChange={setExportAllowedOrganizations} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Connector config JSON
                <textarea className="of-input" value={exportConfigJson} onChange={(event) => setExportConfigJson(event.target.value)} rows={3} />
              </label>
            </div>
            {newExportType === 'file' && (
              <div className="of-panel-muted" style={{ padding: 10, fontSize: 12 }}>
                {defaultFileExportSettings({
                  overwrite_behavior: fileOverwriteBehavior,
                  destination_subfolder: fileDestinationSubfolder || null,
                  full_reexport_requested: fileFullReexport,
                }, newExportMode, exportDestination).destination_subfolder_guidance?.join(' ')}
              </div>
            )}
            {newExportType === 'table' && (
              <div className="of-panel-muted" style={{ padding: 10, fontSize: 12 }}>
                {tableExportModeRequiresTruncate(newExportMode)
                  ? 'This table export mode requires truncate permission for mirror-style replacement.'
                  : 'Full snapshot without truncation appends the exported dataset rows without truncating the destination table.'}
              </div>
            )}
            {newExportType === 'streaming' && (
              <div className="of-panel-muted" style={{ padding: 10, fontSize: 12 }}>
                {defaultStreamingExportSettings({
                  replay_behavior: exportStreamingReplayBehavior,
                  start_offset: exportStreamingStartOffset,
                  start_offset_value: exportStreamingStartOffsetValue || null,
                  last_exported_offset: exportStreamingLastOffset || null,
                  schedule_restart_enabled: exportStreamingScheduleRestart,
                  replayed_records_detected: exportStreamingReplayDetected,
                }, Boolean(exportScheduleCron.trim())).warnings?.map((warning) => warning.message).join(' ')}
              </div>
            )}
            <button type="button" onClick={() => void createExport()} disabled={busy || !sourceSupportsExportType(source, newExportType)} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
              Create export
            </button>
          </div>
          <ul style={{ display: 'grid', gap: 8, paddingLeft: 0, listStyle: 'none', margin: 0 }}>
            {dataExports.map((item) => (
              <li key={item.id} className="of-panel-muted" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{item.name || dataExportTypeLabel(item.export_type)}</strong>
                    <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                      {dataExportTypeLabel(item.export_type)} · {dataExportModeLabel(item.export_mode)} · {item.status} · health {item.health?.state ?? 'unknown'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="of-button" style={{ fontSize: 11 }} disabled={busy || !dataExportCanRun(item)} onClick={() => void runExport(item.id)}>Run</button>
                    <button type="button" className="of-button" style={{ fontSize: 11 }} disabled={busy || !dataExportCanStart(item)} onClick={() => void startExport(item.id)}>Start</button>
                    <button type="button" className="of-button" style={{ fontSize: 11 }} disabled={busy || !dataExportCanStop(item)} onClick={() => void stopExport(item.id)}>Stop</button>
                  </div>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, margin: '10px 0 0', fontSize: 12 }}>
                  <RegistryField label="Input" value={dataExportInputLabel(item)} />
                  <RegistryField label="Destination" value={dataExportDestinationLabel(item)} />
                  <RegistryField label="Schedule" value={dataExportScheduleLabel(item)} />
                  <RegistryField label="Start/stop" value={`${item.start_behavior} / ${item.stop_behavior}`} />
                  <RegistryField label="Controls" value={`${item.export_controls?.allowed_markings?.join(', ') || 'no markings'} · ${item.export_controls?.allowed_organizations?.join(', ') || 'no orgs'}`} />
                  <RegistryField label="Last run" value={item.last_run_at ? new Date(item.last_run_at).toLocaleString() : 'Never'} />
                </dl>
                {item.schedule ? (
                  <div className="of-panel-muted" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong>Build schedule</strong>
                    <span>
                      {item.schedule.name} · {item.schedule.trigger_kind} trigger · <code>{item.schedule.cron}</code> · {item.schedule.time_zone} · {item.schedule.build_system}
                    </span>
                    <span className="of-text-muted">
                      Target {item.schedule.target_kind} · {item.schedule.target_rid}
                      {item.schedule.last_triggered_at ? ` · last triggered ${new Date(item.schedule.last_triggered_at).toLocaleString()}` : ''}
                      {item.schedule.schedule_url ? <> · <Link to={item.schedule.schedule_url}>Open schedule</Link></> : null}
                    </span>
                  </div>
                ) : null}
                {item.export_type === 'file' && item.file_export ? (
                  <div className="of-panel-muted" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong>File export policy</strong>
                    <span>
                      {item.file_export.incremental_policy === 'modified_since_last_success' ? 'Only modified files since last successful transaction' : 'Full snapshot'} · {fileExportOverwriteBehaviorLabel(item.file_export.overwrite_behavior)}
                      {item.file_export.destination_subfolder ? ` · subfolder ${item.file_export.destination_subfolder}` : ''}
                      {item.file_export.last_successful_transaction_id ? ` · high watermark ${item.file_export.last_successful_transaction_id}` : ''}
                    </span>
                    {item.file_export.destination_subfolder_guidance?.length ? (
                      <span className="of-text-muted">{item.file_export.destination_subfolder_guidance.join(' ')}</span>
                    ) : null}
                  </div>
                ) : null}
                {item.export_type === 'table' && item.table_export ? (
                  <div className="of-panel-muted" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong>Table export policy</strong>
                    <span>
                      {item.table_export.exact_column_match ? 'Exact schema match' : 'Schema mismatch'} · {item.table_export.input_parquet_backed ? 'Parquet input' : 'Input format blocked'} · {item.table_export.destination_table_exists ? 'Destination exists' : 'Destination missing'}
                      {item.table_export.truncate_permission ? ' · truncate allowed' : ''}
                      {item.table_export.last_successful_at ? ` · last success ${new Date(item.table_export.last_successful_at).toLocaleString()}` : ''}
                    </span>
                    {item.table_export.validation_issues?.length ? (
                      <span className="of-text-muted">{item.table_export.validation_issues.map((issue) => issue.message).join(' ')}</span>
                    ) : null}
                  </div>
                ) : null}
                {item.export_type === 'streaming' && item.streaming_export ? (
                  <div className="of-panel-muted" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong>Streaming export policy</strong>
                    <span>
                      {streamingExportReplayBehaviorLabel(item.streaming_export.replay_behavior)} · start {item.streaming_export.start_offset.replaceAll('_', ' ')}
                      {item.streaming_export.last_exported_offset ? ` · offset ${item.streaming_export.last_exported_offset}` : ''}
                      {item.streaming_export.schedule_restart_enabled ? ' · scheduled restart enabled' : ''}
                    </span>
                    {item.streaming_export.warnings?.length ? (
                      <span className="of-text-muted">{item.streaming_export.warnings.map((warning) => warning.message).join(' ')}</span>
                    ) : null}
                  </div>
                ) : null}
                {item.history?.length ? (
                  <div className="of-panel-muted" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong>Export job history</strong>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                      {item.history.slice(0, 5).map((entry) => {
                        const href = dataExportHistoryHref(entry);
                        return (
                          <li key={entry.id}>
                            {entry.action} · {entry.status} · {new Date(entry.created_at).toLocaleString()} · {dataExportHistoryMetrics(entry)}
                            {entry.schedule_triggered ? ' · schedule triggered' : ''}
                            {href ? <> · <a href={href}>Build report</a></> : null}
                            {entry.error_message ? ` · ${entry.error_message}` : entry.message ? ` · ${entry.message}` : ''}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
            {dataExports.length === 0 && <li className="of-text-muted">No exports configured for this source.</li>}
          </ul>
        </section>
      )}

      {tab === 'webhooks' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p className="of-eyebrow">Webhooks ({webhooks.length})</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Outbound REST webhooks are associated with this source and inherit its base domain, auth references, network policy, worker, and permissions. Use listeners instead for inbound systems calling Foundry.
              </p>
            </div>
            <button type="button" className="of-button" onClick={() => void loadWebhooks()} disabled={busy}>Refresh webhooks</button>
          </header>
          <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Create REST webhook</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <LabeledInput label="Webhook name" value={webhookName} onChange={setWebhookName} />
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Method
                <select value={webhookMethod} onChange={(event) => setWebhookMethod(event.target.value as WebhookHttpMethod)} className="of-input">
                  {WEBHOOK_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <LabeledInput label="Relative path" value={webhookPath} onChange={setWebhookPath} />
              <LabeledInput label="Authorization reference" value={webhookAuthRef} onChange={setWebhookAuthRef} />
              <LabeledInput label="Timeout ms" value={webhookTimeoutMs} onChange={setWebhookTimeoutMs} />
              <LabeledInput label="Retry attempts" value={webhookRetryAttempts} onChange={setWebhookRetryAttempts} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Query parameters (name=value)
                <textarea className="of-input" value={webhookQueryRaw} onChange={(event) => setWebhookQueryRaw(event.target.value)} rows={3} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Headers (Name: value)
                <textarea className="of-input" value={webhookHeadersRaw} onChange={(event) => setWebhookHeadersRaw(event.target.value)} rows={3} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Body template
                <textarea className="of-input" value={webhookBody} onChange={(event) => setWebhookBody(event.target.value)} rows={3} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Input parameters JSON
                <textarea className="of-input" value={webhookInputsJson} onChange={(event) => setWebhookInputsJson(event.target.value)} rows={5} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Output parameters JSON
                <textarea className="of-input" value={webhookOutputsJson} onChange={(event) => setWebhookOutputsJson(event.target.value)} rows={5} />
              </label>
            </div>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
              Inputs support Boolean, integer, long, double, string, date, timestamp, list, record, optional, and attachment metadata. Outputs can extract the whole response, key paths, array indexes, JSON paths, HTTP status, or the full response string.
            </p>
            <button type="button" onClick={() => void createWebhook()} disabled={busy || !webhookName.trim()} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>Create webhook</button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {webhooks.map((webhook) => (
              <li key={webhook.id}>
                <strong>{webhook.name}</strong> · {webhook.method} {webhook.relative_path} · inputs {webhook.input_parameters?.length ?? 0} · outputs {webhook.output_parameters?.length ?? 0} · timeout {webhook.timeout_ms}ms · retries {webhook.retry.max_attempts}
                <button type="button" onClick={() => void loadWebhookInvocations(webhook.id)} disabled={busy} className="of-button" style={{ marginLeft: 8, fontSize: 11 }}>History</button>
                {webhookInvocations[webhook.id] ? (
                  <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                    {webhookInvocations[webhook.id].map((invocation) => (
                      <li key={invocation.id}>
                        {invocation.invoked_at} · caller {invocation.caller_id ?? 'unknown'} · {invocation.status} · HTTP {invocation.http_status ?? '-'} · retries {invocation.retry_attempts} · outputs {Object.keys(invocation.parsed_outputs).join(', ') || 'none'}{invocation.error ? ` · ${invocation.error}` : ''}
                      </li>
                    ))}
                    {webhookInvocations[webhook.id].length === 0 && <li className="of-text-muted">No retained invocation history.</li>}
                  </ul>
                ) : null}
              </li>
            ))}
            {webhooks.length === 0 && <li className="of-text-muted">No webhooks configured for this source.</li>}
          </ul>
        </section>
      )}

      {tab === 'code-imports' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <p className="of-eyebrow">Code imports</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>Python transform source binding</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Imported sources render as repository links and resolve credentials, egress policy, and export controls at build start.
              </p>
            </div>
            <button type="button" onClick={() => void loadSourceCodeImport()} disabled={busy} className="of-button">Refresh</button>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={codeImportEnabled} onChange={(event) => setCodeImportEnabled(event.target.checked)} />
            Allow this source to be imported into code repositories
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={codeImportAllowFoundryInputs} onChange={(event) => setCodeImportAllowFoundryInputs(event.target.checked)} />
            Enable Foundry inputs in jobs with access to this external system
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <LabeledInput label="Friendly source name" value={codeImportFriendlyName} onChange={setCodeImportFriendlyName} />
            <LabeledInput label="Python identifier" value={codeImportPythonIdentifier} onChange={setCodeImportPythonIdentifier} />
            <LabeledInput label="Exportable markings" value={codeImportAllowedMarkings} onChange={setCodeImportAllowedMarkings} />
            <LabeledInput label="Exportable organizations" value={codeImportAllowedOrganizations} onChange={setCodeImportAllowedOrganizations} />
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Imported code repositories
            <textarea className="of-input" value={codeImportRepositoriesJson} onChange={(event) => setCodeImportRepositoriesJson(event.target.value)} rows={6} />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void saveSourceCodeImport()} disabled={busy || !codeImportFriendlyName.trim() || !codeImportPythonIdentifier.trim()} className="of-button of-button--primary">Save code imports</button>
            <button type="button" onClick={() => void resolveSourceCodeImportBuildStart()} disabled={busy || !sourceCodeImport?.enabled} className="of-button">Resolve build start</button>
          </div>

          {sourceCodeImport ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
                <RegistryField label="Approval" value={sourceCodeImport.enabled ? 'Enabled for code imports' : 'Disabled'} />
                <RegistryField label="Source RID" value={sourceCodeImport.source_rid} href={sourceCodeImport.generated_binding.source_panel_url} />
                <RegistryField label="Library" value={sourceCodeImport.generated_binding.library} />
                <RegistryField label="Last updated" value={sourceCodeImport.updated_at} />
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <p className="of-eyebrow">Generated binding</p>
                <pre style={{ margin: 0, padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>
                  <code>{sourceCodeImport.generated_binding.code_snippet}</code>
                </pre>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <p className="of-eyebrow">Repository imports</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {sourceCodeImport.code_repositories.map((repo) => (
                    <li key={`${repo.repository_rid}-${repo.file_path ?? ''}`}>
                      {repo.rendered_link ? (
                        <a href={repo.rendered_link}>{sourceCodeImportRepositoryDisplay(repo)}</a>
                      ) : (
                        sourceCodeImportRepositoryDisplay(repo)
                      )}
                      {repo.imported_name ? ` · imported as ${repo.imported_name}` : ''}
                      {repo.last_imported_at ? ` · ${repo.last_imported_at}` : ''}
                    </li>
                  ))}
                  {sourceCodeImport.code_repositories.length === 0 && <li className="of-text-muted">No repository imports recorded yet.</li>}
                </ul>
              </div>

              <ExternalTransformPatternsPanel patterns={sourceCodeImport.external_transform_patterns ?? []} />

              <ComputeModuleAlternativesPanel alternatives={sourceCodeImport.compute_module_alternatives ?? []} />

              <SourceCodeImportBuildPanel resolution={codeImportResolution ?? sourceCodeImport.build_start_resolution} />
            </>
          ) : (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Open this tab or refresh to load code import settings.</p>
          )}
        </section>
      )}

      {tab === 'permissions' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Permissions and governance</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>Source access model</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Roles are evaluated separately for source metadata, credential metadata, external samples, output datasets, syncs, exports, webhooks, and code imports.
              </p>
            </div>
            <button type="button" onClick={() => void loadSourceGovernance()} disabled={busy} className="of-button">Refresh</button>
          </div>

          {sourceGovernance ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <RegistryField label="Source RID" value={sourceGovernance.source_rid} />
                <RegistryField label="Owner" value={sourceGovernance.owner_id} />
                <RegistryField label="Can create syncs" value={sourceGovernanceCan(sourceGovernance, 'sync_create') ? 'Allowed' : 'Not granted'} />
                <RegistryField label="Can import in code" value={sourceGovernanceCan(sourceGovernance, 'code_import') ? 'Allowed' : 'Not granted'} />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sourceGovernance.effective_roles.map((role) => (
                  <span key={role} className="of-chip">{sourcePermissionRoleLabel(role)}</span>
                ))}
                {sourceGovernance.effective_roles.length === 0 ? <span className="of-text-muted" style={{ fontSize: 12 }}>No effective roles for this viewer.</span> : null}
              </div>

              <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 6, fontSize: 12 }}>
                {sourceGovernanceVisibilitySummary(sourceGovernance).map((line) => <span key={line}>{line}</span>)}
              </div>

              {sourceGovernance.warnings && sourceGovernance.warnings.length > 0 ? (
                <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                  {sourceGovernance.warnings.map((warning) => warning.message).join(' ')}
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    <span className="of-text-muted">Permission grants JSON</span>
                    <textarea className="of-input" value={permissionGrantsJson} onChange={(event) => setPermissionGrantsJson(event.target.value)} rows={10} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    <span className="of-text-muted">Change reason</span>
                    <input className="of-input" value={permissionReason} onChange={(event) => setPermissionReason(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => void saveSourceGovernance()} disabled={busy || !sourceGovernanceCan(sourceGovernance, 'source_owner')} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
                    Save grants
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <p className="of-eyebrow">Current grants</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 6 }}>
                    {sourceGovernance.permission_grants.map((grant) => (
                      <li key={`${grant.principal_type}-${grant.principal_id}`}>{sourceGovernanceGrantSummary(grant)}</li>
                    ))}
                    {sourceGovernance.permission_grants.length === 0 ? <li className="of-text-muted">No delegated grants.</li> : null}
                  </ul>
                  <p className="of-eyebrow" style={{ marginTop: 8 }}>Role definitions</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 6 }}>
                    {sourceGovernance.role_definitions.map((definition) => (
                      <li key={definition.role}>
                        <strong>{definition.label}</strong>
                        {definition.implied_roles?.length ? <span className="of-text-muted"> · implies {definition.implied_roles.map(sourcePermissionRoleLabel).join(', ')}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Open this tab or refresh to load source permission policy.</p>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <p className="of-eyebrow">History</p>
            <button type="button" onClick={() => void loadSourceGovernance()} disabled={busy} className="of-button">Refresh audit</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
            <RegistryField label="Created" value={`${source.created_at} · by ${audit.created_by ?? 'unknown'}`} />
            <RegistryField label="Updated" value={`${source.updated_at} · by ${audit.updated_by ?? 'unknown'}`} />
            <RegistryField label="Archived" value={audit.archived_at ? `${audit.archived_at} · by ${audit.archived_by ?? 'unknown'}` : 'Not archived'} />
            <RegistryField label="Last event" value={audit.last_event_id ?? 'No event id'} />
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 6 }}>
            {sourceGovernanceAudit.map((event) => (
              <li key={event.id}>
                {sourceGovernanceAuditLabel(event)}
                <span className="of-text-muted"> · {event.created_at}</span>
              </li>
            ))}
            {sourceGovernanceAudit.length === 0 ? <li className="of-text-muted">No source permission or source-use audit events loaded.</li> : null}
          </ul>
        </section>
      )}

      {tab === 'media-syncs' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p className="of-eyebrow">SDC.41 — Media sync handoff</p>
              <h2 className="of-section-title" style={{ marginTop: 4 }}>Media set syncs ({mediaSyncs.length})</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Set up syncs from supported file/media sources. Schema, conversion, transformations, transactional policy, and media references are owned by the Media Sets surface.
              </p>
            </div>
            <button type="button" className="of-button" onClick={() => void loadMediaSyncs()} disabled={busy}>Refresh</button>
          </div>

          {mediaSyncHandoffDelegation && (
            <details className="of-panel-muted" style={{ padding: 10, fontSize: 12 }}>
              <summary>Delegated to the Media Sets checklist</summary>
              <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                <li><strong>Schema:</strong> {mediaSyncHandoffDelegation.schema}</li>
                <li><strong>Conversion:</strong> {mediaSyncHandoffDelegation.conversion}</li>
                <li><strong>Transformations:</strong> {mediaSyncHandoffDelegation.transformations}</li>
                <li><strong>Transaction policy:</strong> {mediaSyncHandoffDelegation.transaction_policy}</li>
                <li><strong>Media reference:</strong> {mediaSyncHandoffDelegation.media_reference}</li>
              </ul>
            </details>
          )}

          {mediaSyncs.length === 0 ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>No media syncs configured.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
              {mediaSyncs.map((m) => {
                const isOpen = openMediaSyncId === m.id;
                const runs = mediaSyncHistory[m.id] ?? [];
                return (
                  <li key={m.id} className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <strong style={{ fontSize: 13 }}>{m.kind} · {m.target_media_set_rid}</strong>
                        <span className="of-text-muted" style={{ fontSize: 11 }}>
                          subfolder <code>{m.subfolder || '/'}</code>
                          {m.filters.path_glob ? <> · glob <code>{m.filters.path_glob}</code></> : null}
                          {m.schedule_cron ? <> · schedule <code>{m.schedule_cron}</code></> : null}
                        </span>
                        <span className="of-text-muted" style={{ fontSize: 11 }}>{summarizeMediaSetSyncUsage(m.usage)}</span>
                        {m.usage?.last_status && (
                          <span style={{ fontSize: 11 }}>
                            Last run: {mediaSetSyncRunStatusLabel(m.usage.last_status)}
                            {m.usage.last_run_at ? ` (${new Date(m.usage.last_run_at).toLocaleString()})` : ''}
                            {m.usage.last_error_message ? ` — ${m.usage.last_error_message}` : ''}
                          </span>
                        )}
                      </div>
                      <button type="button" className="of-button" onClick={() => toggleMediaSync(m.id)}>
                        {isOpen ? 'Hide history' : 'View history'}
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 6 }}>
                        {runs.length === 0 ? (
                          <p className="of-text-muted" style={{ fontSize: 11, margin: 0 }}>No runs recorded.</p>
                        ) : (
                          <table className="of-table" style={{ fontSize: 11, width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Started</th>
                                <th>Status</th>
                                <th>Accepted</th>
                                <th>Skipped</th>
                                <th>Mismatch</th>
                                <th>Dispatched</th>
                                <th>Errors</th>
                                <th>Bytes</th>
                                <th>Paths</th>
                                <th>Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {runs.map((run) => (
                                <tr key={run.id}>
                                  <td>{new Date(run.started_at).toLocaleString()}</td>
                                  <td>{mediaSetSyncRunStatusLabel(run.status)}</td>
                                  <td>{run.accepted_files}</td>
                                  <td>{run.skipped_files}</td>
                                  <td>{run.schema_mismatched}</td>
                                  <td>{run.dispatched_files}</td>
                                  <td>{run.dispatch_errors}</td>
                                  <td>{formatMediaSetSyncBytes(run.bytes_accepted)}</td>
                                  <td>{run.selected_paths.length}</td>
                                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {run.error_message ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <VirtualMediaHandoffPanel descriptor={virtualMediaHandoff} />
        </section>
      )}
        </div>
      </div>
      <PreviewRail open={previewOpen} onToggle={() => setPreviewOpen((value) => !value)} source={source} />
      </div>

      {bulkDialogOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="source-bulk-register-title" style={dialogBackdropStyle}>
          <section className="of-panel" style={dialogPanelStyle}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Bulk register</p>
                <h2 id="source-bulk-register-title" className="of-section-title" style={{ marginTop: 4 }}>
                  {selectedDiscovered.length} selected source{selectedDiscovered.length === 1 ? '' : 's'}
                </h2>
              </div>
              <button type="button" onClick={() => setBulkDialogOpen(false)} disabled={busy} className="of-button">
                Close
              </button>
            </header>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                Registration mode
                <select value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)} className="of-input">
                  <option value="sync">sync</option>
                  <option value="zero_copy">zero_copy</option>
                </select>
              </label>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                Target dataset id
                <input value={targetDatasetId} onChange={(event) => setTargetDatasetId(event.target.value)} placeholder="optional UUID" className="of-input" />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={autoSync} onChange={(event) => setAutoSync(event.target.checked)} />
                Auto sync
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={updateDetection} onChange={(event) => setUpdateDetection(event.target.checked)} />
                Update detection
              </label>
            </div>

            <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 260 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>Source</th>
                    <th style={tableHeaderStyle}>Selector</th>
                    <th style={tableHeaderStyle}>Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDiscovered.map((item) => (
                    <tr key={item.selector}>
                      <td style={tableCellStyle}>{discoveredLabel(item)}</td>
                      <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{item.selector}</td>
                      <td style={tableCellStyle}>{item.source_kind ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {registrationErrors.length > 0 && (
              <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {registrationErrors.map((item) => (
                    <li key={`${item.selector}-${item.error}`}>
                      <code>{item.selector}</code>: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setBulkDialogOpen(false)} disabled={busy} className="of-button">
                Cancel
              </button>
              <button type="button" onClick={() => void bulkRegisterSelected()} disabled={busy || selectedDiscovered.length === 0} className="of-button of-button--primary">
                {busy ? 'Registering...' : 'Register selected'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function WorkerCompatibilityPanel({
  valid,
  worker,
  allowed,
  unavailable,
  reason,
}: {
  valid: boolean;
  worker: SourceWorker;
  allowed: ConnectorCatalogEntry['capabilities'];
  unavailable: ConnectorCatalogEntry['capabilities'];
  reason: string | null;
}) {
  return (
    <section
      className={valid ? 'of-status-success' : 'of-status-danger'}
      style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', display: 'grid', gap: 6, fontSize: 12 }}
    >
      <strong>{valid ? `${workerLabel(worker)} is compatible with this source.` : (reason ?? 'Worker is not compatible.')}</strong>
      <span>Available capabilities: {allowed.length > 0 ? allowed.map(capabilityLabel).join(', ') : 'none'}</span>
      {unavailable.length > 0 ? <span>Unavailable capabilities: {unavailable.map(capabilityLabel).join(', ')}</span> : null}
    </section>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="of-input" />
    </label>
  );
}

function PlaceholderPanel({ title, description, actionLabel }: { title: string; description: string; actionLabel?: string }) {
  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">{title}</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{description}</p>
      </div>
      {actionLabel ? <button type="button" className="of-button of-button--primary" style={{ justifySelf: 'start' }}>{actionLabel}</button> : null}
    </section>
  );
}

function StreamSchemaDetails({ stream }: { stream: DataConnectionStreamResource }) {
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div>
        <p className="of-eyebrow">Schema details</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {stream.cdc_metadata ? cdcResolutionStrategyLabel(stream.cdc_metadata) : 'No CDC primary key resolution strategy is configured for this stream.'}
        </p>
      </div>
      <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Field</th>
              <th style={tableHeaderStyle}>Foundry type</th>
              <th style={tableHeaderStyle}>Source type</th>
              <th style={tableHeaderStyle}>Nullable</th>
              <th style={tableHeaderStyle}>CDC resolution role</th>
            </tr>
          </thead>
          <tbody>
            {stream.schema.length === 0 ? (
              <tr><td style={tableCellStyle} colSpan={5}>No schema fields captured.</td></tr>
            ) : stream.schema.map((field) => {
              const role = cdcSchemaFieldResolutionRole(field.name, stream.cdc_metadata);
              return (
                <tr key={field.name}>
                  <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{field.name}</td>
                  <td style={tableCellStyle}>{field.foundry_type}</td>
                  <td style={tableCellStyle}>{field.source_type}</td>
                  <td style={tableCellStyle}>{field.nullable ? 'yes' : 'no'}</td>
                  <td style={tableCellStyle}>{role ? <span className="of-chip">{role}</span> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CdcStreamViews({ stream }: { stream: DataConnectionStreamResource }) {
  if (!stream.cdc_metadata) return null;
  const resolution = resolveCdcArchiveView(stream);
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div>
        <p className="of-eyebrow">CDC live and archive views</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Live changelog rows: {resolution.live_rows.length} · Archive current-state rows: {resolution.archive_rows.length} · Deleted latest rows: {resolution.deleted_rows.length}
          {resolution.used_backend_archive ? ' · showing backend archive view' : ''}
        </p>
      </div>
      {resolution.warnings.length > 0 ? (
        <div className="of-status-info" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
          {resolution.warnings.map((warning) => warning.message).join(' ')}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
        <CdcRowsTable
          title="Live changelog"
          rows={resolution.live_rows}
          stream={stream}
          emptyLabel="No live changelog rows loaded."
        />
        <CdcRowsTable
          title="Archive current-state"
          rows={resolution.archive_rows}
          stream={stream}
          emptyLabel="No current rows after CDC resolution."
        />
      </div>
    </section>
  );
}

function CdcRowsTable({
  title,
  rows,
  stream,
  emptyLabel,
}: {
  title: string;
  rows: StreamLiveRow[];
  stream: DataConnectionStreamResource;
  emptyLabel: string;
}) {
  const metadata = stream.cdc_metadata;
  const visibleRows = rows.slice(0, 8);
  const primaryKeyColumns = metadata?.primary_key_columns ?? [];
  const orderingColumn = metadata?.ordering_column ?? null;
  const deletionColumn = metadata?.deletion_column ?? null;
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>{title}</th>
            <th style={tableHeaderStyle}>Primary key</th>
            <th style={tableHeaderStyle}>Order</th>
            <th style={tableHeaderStyle}>Delete</th>
            <th style={tableHeaderStyle}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr><td style={tableCellStyle} colSpan={5}>{emptyLabel}</td></tr>
          ) : visibleRows.map((row) => (
            <tr key={`${title}-${row.source}-${row.offset}`}>
              <td style={tableCellStyle}>
                <strong>#{row.offset}</strong>
                <div className="of-text-muted" style={{ fontSize: 11 }}>{streamStorageLabel(row.source)} · {row.event_time}</div>
              </td>
              <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{primaryKeyColumns.length > 0 ? cdcPrimaryKeyForRow(row, primaryKeyColumns) : '-'}</td>
              <td style={tableCellStyle}>{orderingColumn ? formatStreamValue(row.payload[orderingColumn]) : '-'}</td>
              <td style={tableCellStyle}>{deletionColumn ? formatStreamValue(row.payload[deletionColumn]) : '-'}</td>
              <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)', maxWidth: 320, overflowWrap: 'anywhere' }}>{formatStreamPayload(row.payload, stream)}</td>
            </tr>
          ))}
          {rows.length > visibleRows.length ? (
            <tr><td style={tableCellStyle} colSpan={5}>{rows.length - visibleRows.length} more row{rows.length - visibleRows.length === 1 ? '' : 's'} not shown.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CdcDownstreamIntegrationPanel({ stream }: { stream: DataConnectionStreamResource }) {
  const bundle = cdcDownstreamIntegrationMetadata(stream);
  if (!bundle) return null;
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div>
        <p className="of-eyebrow">Downstream CDC metadata</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Required metadata columns: {bundle.required_metadata_columns.join(', ')} · Source {bundle.source} · Output {bundle.output_stream_id ?? stream.id}
        </p>
      </div>
      {bundle.warnings.length > 0 ? (
        <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
          {bundle.warnings.map((warning) => warning.message).join(' ')}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {bundle.targets.map((target) => (
          <article key={target.surface} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: 'var(--bg-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>{target.label}</strong>
              <span className={cdcIntegrationStatusClass(target.status)} style={{ padding: '1px 6px', borderRadius: 6, fontSize: 11 }}>{target.status}</span>
            </div>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>{cdcIntegrationSummary(target.surface, target.metadata)}</p>
            {target.warnings.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                {target.warnings.map((warning) => <li key={`${target.surface}-${warning.code}`}>{warning.message}</li>)}
              </ul>
            ) : null}
            {target.recommended_checks?.length ? (
              <div style={{ display: 'grid', gap: 4 }}>
                {target.recommended_checks.slice(0, 4).map((check) => (
                  <span key={check.code} className="of-chip" style={{ justifySelf: 'start' }}>{check.label}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function cdcIntegrationStatusClass(status: CdcDownstreamIntegrationStatus): string {
  if (status === 'ready') return 'of-status-success';
  if (status === 'blocked') return 'of-status-danger';
  return 'of-status-warning';
}

function cdcIntegrationSummary(surface: string, metadata: Record<string, unknown>): string {
  switch (surface) {
    case 'pipeline_builder': {
      const keyBy = metadata.key_by as Record<string, unknown> | undefined;
      return `Key By config: pk ${(keyBy?.primary_key_columns as string[] | undefined)?.join(', ') ?? '-'}; order ${keyBy?.ordering_column ?? '-'}.`;
    }
    case 'ontology_indexing':
      return 'Object indexing can consume the same PK metadata; custom/backfilled streams must arrive in ordering-column order.';
    case 'stream_processing':
      return `Stateful processors key by ${Array.isArray(metadata.state_key_columns) ? metadata.state_key_columns.join(', ') : '-'} and compare ${metadata.ordering_column ?? '-'}.`;
    case 'archive_view':
      return `${metadata.current_state_rows ?? 0} current rows and ${metadata.deleted_latest_rows ?? 0} deleted latest rows in the resolved archive view.`;
    case 'data_health':
      return 'Recommended checks cover metadata presence, PK nullability, ordering comparability, deletion marker shape, and archive freshness.';
    default:
      return 'CDC metadata is available for this downstream surface.';
  }
}

function formatStreamPayload(payload: Record<string, unknown>, stream: DataConnectionStreamResource): string {
  const preferred = [
    ...(stream.cdc_metadata?.primary_key_columns ?? []),
    stream.cdc_metadata?.ordering_column ?? '',
    stream.cdc_metadata?.deletion_column ?? '',
  ].filter((column): column is string => Boolean(column));
  const schemaFields = stream.schema.map((field) => field.name);
  const columns = Array.from(new Set([...preferred, ...schemaFields, ...Object.keys(payload)])).slice(0, 8);
  return columns.map((column) => `${column}=${formatStreamValue(payload[column])}`).join(' · ') || '{}';
}

function formatStreamValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function ExternalTransformPatternsPanel({ patterns }: { patterns: ExternalTransformPattern[] }) {
  if (!patterns.length) {
    return <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No external transform patterns are available for this source import.</p>;
  }
  const coverage = sourceCodeImportPatternCoverage(patterns);
  const examples = sourceCodeImportExampleKinds(patterns);
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">External transform patterns</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Alternatives: {coverage.join(', ')} · Examples: {examples.join(', ')}
        </p>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {patterns.map((pattern) => (
          <article key={pattern.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, display: 'grid', gap: 8, background: 'var(--bg-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{pattern.title}</strong>
                <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>{pattern.summary}</p>
              </div>
              <span className="of-chip" style={{ alignSelf: 'start' }}>{pattern.example_kind}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {pattern.alternative_for.map((item) => <span key={`${pattern.id}-${item}`} className="of-chip">{item}</span>)}
              {pattern.requires_export_controls ? <span className="of-chip">export controls</span> : null}
              {pattern.requires_agent_proxy ? <span className="of-chip">agent proxy</span> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <div>
                <span className="of-text-muted" style={{ fontSize: 11 }}>Use when</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {pattern.recommended_when.slice(0, 3).map((item) => <li key={`${pattern.id}-when-${item}`}>{item}</li>)}
                </ul>
              </div>
              <div>
                <span className="of-text-muted" style={{ fontSize: 11 }}>Requirements</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {pattern.source_requirements.slice(0, 3).map((item) => <li key={`${pattern.id}-req-${item}`}>{item}</li>)}
                </ul>
              </div>
            </div>
            <pre style={{ margin: 0, padding: 10, background: 'var(--bg-subtle)', borderRadius: 8, overflowX: 'auto', fontSize: 11 }}>
              <code>{pattern.code_snippet}</code>
            </pre>
            {pattern.limitations.length ? (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                Limits: {pattern.limitations.join(' · ')}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ComputeModuleAlternativesPanel({ alternatives }: { alternatives: ComputeModuleAlternative[] }) {
  if (!alternatives.length) {
    return <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No compute module alternatives are available for this source import.</p>;
  }
  const coverage = computeModuleAlternativeCoverage(alternatives);
  const blockers = computeModuleAlternativeBlockers(alternatives);
  const blocked = computeModuleAlternativesAreBlocked(alternatives);
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">Compute module alternatives</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Alternatives: {coverage.join(', ')} · Status: {blocked ? 'blocked' : 'mixed'} · Blockers: {blockers.join(', ')}
        </p>
      </div>
      {blocked ? (
        <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
          Blocked until OpenFoundry defines the compute module runtime, deployment, and source-import contracts.
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 10 }}>
        {alternatives.map((alternative) => (
          <article key={alternative.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, display: 'grid', gap: 8, background: 'var(--bg-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{alternative.title}</strong>
                <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>{alternative.summary}</p>
              </div>
              <span className="of-chip" style={{ alignSelf: 'start' }}>{alternative.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="of-chip">{alternative.alternative_for}</span>
              <span className="of-chip">{alternative.runtime_kind}</span>
              {alternative.supported_languages.map((language) => <span key={`${alternative.id}-${language}`} className="of-chip">{language}</span>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <div>
                <span className="of-text-muted" style={{ fontSize: 11 }}>Contracts</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {alternative.required_contracts.map((contract) => <li key={`${alternative.id}-contract-${contract}`}>{contract}</li>)}
                </ul>
              </div>
              <div>
                <span className="of-text-muted" style={{ fontSize: 11 }}>Readiness</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {alternative.readiness_checks.slice(0, 4).map((check) => <li key={`${alternative.id}-check-${check}`}>{check}</li>)}
                </ul>
              </div>
            </div>
            <pre style={{ margin: 0, padding: 10, background: 'var(--bg-subtle)', borderRadius: 8, overflowX: 'auto', fontSize: 11 }}>
              <code>{alternative.code_sketch}</code>
            </pre>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
              {alternative.source_import_contract} · {alternative.deployment_contract} · {alternative.execution_contract}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeadLetterQuarantinePanel({
  syncId,
  sink,
  draft,
  summary,
  selection,
  busy,
  expanded,
  onToggle,
  onDraftChange,
  onSave,
  onSelect,
  onReplay,
}: {
  syncId: string;
  sink: DeadLetterSink | null;
  draft: { kind: DeadLetterSinkKind; targetRid: string; retentionDays: string; rules: DeadLetterRedactionRule[] };
  summary: QuarantineSummary | null;
  selection: Record<string, boolean>;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDraftChange: (patch: Partial<{ kind: DeadLetterSinkKind; targetRid: string; retentionDays: string; rules: DeadLetterRedactionRule[] }>) => void;
  onSave: () => void;
  onSelect: (recordId: string) => void;
  onReplay: () => void;
}) {
  return (
    <div className="of-panel-muted" style={{ padding: 10, marginTop: 8, display: 'grid', gap: 8, fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <p className="of-eyebrow">SDC.47 — Dead-letter &amp; quarantine</p>
          <p className="of-text-muted" style={{ margin: '2px 0 0' }}>
            {sink?.target_rid ? `Sink: ${sink.kind}/${sink.target_rid} · ${sink.retention_days}d retention` : 'No dead-letter sink configured.'}
            {summary ? ` · ${summary.total} quarantined record(s)` : ''}
          </p>
        </div>
        <button type="button" className="of-button" onClick={onToggle}>
          {expanded ? 'Hide' : 'Configure / view'}
        </button>
      </div>

      {expanded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
            <label style={{ display: 'grid', gap: 2 }}>
              <span className="of-text-muted">Sink kind</span>
              <select value={draft.kind} onChange={(e) => onDraftChange({ kind: e.target.value as DeadLetterSinkKind })} className="of-input">
                <option value="dataset">dataset</option>
                <option value="stream">stream</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 2 }}>
              <span className="of-text-muted">Target RID</span>
              <input
                type="text"
                value={draft.targetRid}
                onChange={(e) => onDraftChange({ targetRid: e.target.value })}
                className="of-input"
                placeholder="ri.datasets.main.dlq-…"
              />
            </label>
            <label style={{ display: 'grid', gap: 2 }}>
              <span className="of-text-muted">Retention (days)</span>
              <input
                type="number"
                min={1}
                max={365}
                value={draft.retentionDays}
                onChange={(e) => onDraftChange({ retentionDays: e.target.value })}
                className="of-input"
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button type="button" className="of-button" onClick={onSave} disabled={busy}>
                {busy ? 'Saving…' : 'Save sink'}
              </button>
            </div>
          </div>

          <div>
            <p className="of-text-muted" style={{ margin: '4px 0' }}>Redaction rules</p>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {draft.rules.map((rule, index) => (
                <li key={index} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={rule.field}
                    onChange={(e) => {
                      const next = [...draft.rules];
                      next[index] = { ...rule, field: e.target.value };
                      onDraftChange({ rules: next });
                    }}
                    className="of-input"
                    placeholder="payload.email"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    value={rule.replacement ?? ''}
                    onChange={(e) => {
                      const next = [...draft.rules];
                      next[index] = { ...rule, replacement: e.target.value };
                      onDraftChange({ rules: next });
                    }}
                    className="of-input"
                    placeholder="[REDACTED]"
                    style={{ flex: 1 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(rule.hash_sha256)}
                      onChange={(e) => {
                        const next = [...draft.rules];
                        next[index] = { ...rule, hash_sha256: e.target.checked, replacement: e.target.checked ? '' : (rule.replacement ?? '[REDACTED]') };
                        onDraftChange({ rules: next });
                      }}
                    />
                    <span>hash</span>
                  </label>
                  <button type="button" className="of-button" onClick={() => {
                    onDraftChange({ rules: draft.rules.filter((_, i) => i !== index) });
                  }}>×</button>
                </li>
              ))}
              <li>
                <button type="button" className="of-button" onClick={() => {
                  onDraftChange({ rules: [...draft.rules, { field: '', replacement: '[REDACTED]' }] });
                }}>+ Add rule</button>
              </li>
            </ul>
          </div>

          {summary && summary.total > 0 ? (
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                {Object.entries(summary.by_category).map(([category, count]) => (
                  <span key={category} className="of-chip">{quarantineFailureCategoryLabel(category as QuarantineFailureCategory)}: {count}</span>
                ))}
                <button type="button" className="of-button" onClick={onReplay} disabled={busy || Object.values(selection).filter(Boolean).length === 0}>
                  Replay selected
                </button>
              </div>
              <table className="of-table" style={{ fontSize: 11, width: '100%' }}>
                <thead>
                  <tr><th></th><th>Category</th><th>Error</th><th>Recorded</th><th>Expires</th></tr>
                </thead>
                <tbody>
                  {summary.records.map((record) => (
                    <tr key={record.id} style={{ opacity: record.replay_requested_at ? 0.6 : 1 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selection[record.id])}
                          onChange={() => onSelect(record.id)}
                          disabled={Boolean(record.replay_requested_at)}
                        />
                      </td>
                      <td>{quarantineFailureCategoryLabel(record.failure_category as QuarantineFailureCategory)}</td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{record.error_message}</td>
                      <td>{new Date(record.recorded_at).toLocaleString()}</td>
                      <td>{new Date(record.expires_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="of-text-muted" style={{ margin: 0 }}>No quarantined records.</p>
          )}
        </>
      )}
    </div>
  );
  void syncId;
}

function StreamReplayPlanPanel({
  stream,
  draft,
  plan,
  busy,
  onDraftChange,
  onToggleAck,
  onEvaluate,
}: {
  stream: DataConnectionStreamResource;
  draft: { reason: string; fromOffset: string; toOffset: string; acks: Record<string, boolean> };
  plan: StreamReplayPlan | null;
  busy: boolean;
  onDraftChange: (patch: Partial<{ reason: string; fromOffset: string; toOffset: string }>) => void;
  onToggleAck: (warningId: string) => void;
  onEvaluate: () => void;
}) {
  const statusTone = plan?.status === 'ready' ? '#ecfdf5' : plan?.status === 'requires_confirmation' ? '#fffbeb' : plan?.status === 'blocked' ? '#fef2f2' : 'var(--bg-subtle)';
  const statusBorder = plan?.status === 'ready' ? '#bbf7d0' : plan?.status === 'requires_confirmation' ? '#fde68a' : plan?.status === 'blocked' ? '#fecaca' : 'var(--border-subtle, #e5e7eb)';
  const earliest = stream.offsets?.earliest_offset ?? null;
  const latest = stream.offsets?.latest_offset ?? null;
  return (
    <div className="of-panel-muted" style={{ padding: 10, marginTop: 8, display: 'grid', gap: 8, fontSize: 11 }}>
      <div>
        <p className="of-eyebrow">SDC.46 — Replay plan</p>
        <p className="of-text-muted" style={{ margin: '2px 0 0' }}>
          Safe replay planner: validate offsets, surface downstream impacts, require explicit confirmation for active streaming exports.
        </p>
        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 10 }}>
          Offsets earliest <code>{earliest ?? '—'}</code> · latest <code>{latest ?? '—'}</code>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
        <label style={{ display: 'grid', gap: 2 }}>
          <span className="of-text-muted">Reason</span>
          <input
            type="text"
            value={draft.reason}
            onChange={(event) => onDraftChange({ reason: event.target.value })}
            className="of-input"
            placeholder="e.g. Drain after schema fix"
          />
        </label>
        <label style={{ display: 'grid', gap: 2 }}>
          <span className="of-text-muted">From offset</span>
          <input
            type="number"
            value={draft.fromOffset}
            onChange={(event) => onDraftChange({ fromOffset: event.target.value })}
            className="of-input"
            placeholder={earliest !== null ? String(earliest) : 'earliest'}
          />
        </label>
        <label style={{ display: 'grid', gap: 2 }}>
          <span className="of-text-muted">To offset</span>
          <input
            type="number"
            value={draft.toOffset}
            onChange={(event) => onDraftChange({ toOffset: event.target.value })}
            className="of-input"
            placeholder={latest !== null ? String(latest) : 'latest'}
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button type="button" className="of-button" onClick={onEvaluate} disabled={busy || !draft.reason.trim()}>
            {busy ? 'Evaluating…' : plan ? 'Re-evaluate plan' : 'Evaluate replay plan'}
          </button>
        </div>
      </div>

      {plan && (
        <div style={{ padding: 8, background: statusTone, border: `1px solid ${statusBorder}`, borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <strong>Status: {plan.status}</strong>
            {plan.estimated_records != null && (
              <span className="of-text-muted">~{plan.estimated_records.toLocaleString()} records in range</span>
            )}
          </div>
          {plan.preconditions_blocking.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: '#b91c1c' }}>
              {plan.preconditions_blocking.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </div>
      )}

      {plan && plan.impacts.length > 0 && (
        <div>
          <p className="of-text-muted" style={{ margin: '0 0 4px' }}>Downstream impacts</p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {sortStreamReplayImpactsBySeverity(plan.impacts).map((impact, index) => {
              const ackRequired = Boolean(impact.warning_id) && plan.acknowledgements_required.includes(impact.warning_id!);
              const ackSatisfied = Boolean(impact.warning_id) && plan.acknowledgements_satisfied.includes(impact.warning_id!);
              const draftChecked = impact.warning_id ? Boolean(draft.acks[impact.warning_id]) : false;
              return (
                <li key={`${impact.kind}-${impact.resource_id}-${index}`} style={{ padding: 8, border: '1px solid var(--border-subtle, #e5e7eb)', borderRadius: 6, display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="of-chip">{streamReplayImpactSeverityLabel(impact.severity)}</span>
                    <span className="of-chip">{streamReplayDownstreamKindLabel(impact.kind)}</span>
                    <strong>{impact.resource_name || impact.resource_id}</strong>
                  </div>
                  <p style={{ margin: 0 }}>{impact.implication}</p>
                  {impact.mitigation && (
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 10 }}>{impact.mitigation}</p>
                  )}
                  {ackRequired && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                      <input
                        type="checkbox"
                        checked={draftChecked || ackSatisfied}
                        onChange={() => impact.warning_id && onToggleAck(impact.warning_id)}
                      />
                      <span>
                        I acknowledge: <code>{impact.warning_id}</code>
                        {ackSatisfied ? ' (already confirmed)' : ''}
                      </span>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {plan && plan.acknowledgements_missing.length > 0 && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 10, color: '#b45309' }}>
          {plan.acknowledgements_missing.length} acknowledgement(s) missing; check the boxes above and re-evaluate.
        </p>
      )}
    </div>
  );
}

function StreamMetricsPanel({
  snapshot,
  window,
  onWindowChange,
}: {
  snapshot: StreamMetricsSnapshot | null;
  window: StreamMetricsWindow;
  onWindowChange: (next: StreamMetricsWindow) => void;
}) {
  if (!snapshot) {
    return (
      <div className="of-panel-muted" style={{ padding: 10, marginTop: 8, fontSize: 11 }}>
        <p className="of-eyebrow">SDC.45 — Stream metrics</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0' }}>
          Metrics snapshot not loaded yet.
        </p>
      </div>
    );
  }
  const hasWarning = streamMetricsHasWarning(snapshot);
  return (
    <div className="of-panel-muted" style={{ padding: 10, marginTop: 8, display: 'grid', gap: 8, fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">SDC.45 — Stream metrics</p>
          <p className="of-text-muted" style={{ margin: '2px 0 0' }}>
            {streamMetricsWindowLabel(window)} · captured {new Date(snapshot.captured_at).toLocaleTimeString()}
          </p>
        </div>
        <select value={window} onChange={(event) => onWindowChange(event.target.value as StreamMetricsWindow)} className="of-input" style={{ fontSize: 11, padding: '2px 6px' }}>
          <option value="1m">Last 1 minute</option>
          <option value="5m">Last 5 minutes</option>
          <option value="1h">Last hour</option>
          <option value="1d">Last day</option>
        </select>
      </div>

      {hasWarning && (snapshot.warnings?.length ?? 0) > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, color: '#92400e' }}>
          {snapshot.warnings!.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
        <MetricCell label="Ingestion" value={formatStreamRate(snapshot.ingestion.records_per_second, 'records')} secondary={formatStreamRate(snapshot.ingestion.bytes_per_second, 'bytes')} />
        <MetricCell label="Consumption" value={formatStreamRate(snapshot.consumption.records_per_second, 'records')} secondary={formatStreamRate(snapshot.consumption.bytes_per_second, 'bytes')} />
        <MetricCell label="Stream lag" value={`${snapshot.lag.stream_lag_records.toLocaleString()} rec`} secondary={`hot buffer ${formatStreamBytes(snapshot.lag.hot_buffer_bytes)}`} />
        <MetricCell label="Archive lag" value={`${snapshot.lag.archive_lag_records.toLocaleString()} rec`} secondary={`processing lag ${snapshot.lag.processing_lag_records.toLocaleString()}`} />
        <MetricCell label="Checkpoint" value={`${snapshot.checkpoint.last_duration_ms} ms`} secondary={`avg ${snapshot.checkpoint.average_duration_ms} ms · ${snapshot.checkpoint.failure_count} failed`} />
        <MetricCell label="Retries" value={`${snapshot.retries.total_retries}`} secondary={`dropped ${snapshot.retries.dropped_records} · dup ${snapshot.retries.duplicate_warnings}`} />
      </div>

      {snapshot.consumers.length > 0 && (
        <details>
          <summary>Consumers ({snapshot.consumers.length})</summary>
          <table className="of-table" style={{ fontSize: 11, width: '100%', marginTop: 4 }}>
            <thead>
              <tr><th>Consumer</th><th>Group</th><th>Lag</th><th>Rate</th></tr>
            </thead>
            <tbody>
              {snapshot.consumers.map((consumer) => (
                <tr key={consumer.consumer_id}>
                  <td>{consumer.consumer_name || consumer.consumer_id}</td>
                  <td>{consumer.consumer_group ?? '—'}</td>
                  <td>{consumer.lag.toLocaleString()}</td>
                  <td>{formatStreamRate(consumer.consumption.records_per_second, 'records')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {snapshot.partitions.length > 0 && (
        <details>
          <summary>Topics / partitions ({snapshot.partitions.length})</summary>
          <table className="of-table" style={{ fontSize: 11, width: '100%', marginTop: 4 }}>
            <thead>
              <tr><th>Partition</th><th>Topic</th><th>Lag</th><th>Ingestion</th><th>Consumption</th></tr>
            </thead>
            <tbody>
              {snapshot.partitions.map((partition) => (
                <tr key={`${partition.topic ?? ''}/${partition.partition_key}`}>
                  <td>{partition.partition_key}</td>
                  <td>{partition.topic ?? '—'}</td>
                  <td>{partition.lag.toLocaleString()}</td>
                  <td>{formatStreamRate(partition.ingestion.records_per_second, 'records')}</td>
                  <td>{formatStreamRate(partition.consumption.records_per_second, 'records')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {(snapshot.streaming_syncs.length > 0 || snapshot.streaming_exports.length > 0) && (
        <details>
          <summary>Streaming syncs &amp; exports ({snapshot.streaming_syncs.length + snapshot.streaming_exports.length})</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            {snapshot.streaming_syncs.length > 0 && (
              <div>
                <strong style={{ fontSize: 11 }}>Syncs</strong>
                <ul style={{ margin: '2px 0 0', paddingLeft: 14 }}>
                  {snapshot.streaming_syncs.map((sync) => (
                    <li key={sync.sync_id}>
                      {sync.sync_name || sync.sync_id} · {formatStreamRate(sync.ingestion.records_per_second, 'records')} · retries {sync.retries}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {snapshot.streaming_exports.length > 0 && (
              <div>
                <strong style={{ fontSize: 11 }}>Exports</strong>
                <ul style={{ margin: '2px 0 0', paddingLeft: 14 }}>
                  {snapshot.streaming_exports.map((exp) => (
                    <li key={exp.export_id}>
                      {exp.export_name || exp.export_id} · {formatStreamRate(exp.consumption.records_per_second, 'records')}
                      {exp.duplicate_risk ? ' · duplicate risk' : ''}
                      {exp.drop_risk ? ' · drop risk' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function MetricCell({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <div style={{ padding: 8, background: 'var(--surface-base, #ffffff)', border: '1px solid var(--border-subtle, #e5e7eb)', borderRadius: 6 }}>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 10 }}>{label}</p>
      <strong style={{ fontSize: 13 }}>{value}</strong>
      {secondary && <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 10 }}>{secondary}</p>}
    </div>
  );
}

function formatStreamBytes(bytes: number | null | undefined): string {
  const value = bytes ?? 0;
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let i = 0;
  while (scaled >= 1024 && i < units.length - 1) {
    scaled /= 1024;
    i += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 1)} ${units[i]}`;
}

function ConnectorCapabilityPackPanel({ pack, worker }: { pack: ConnectorCapabilityPack | null; worker: SourceWorker | string | null | undefined }) {
  if (!pack) {
    return (
      <div className="of-panel-muted" style={{ padding: 12, marginTop: 6, fontSize: 12 }}>
        <p className="of-eyebrow">SDC.44 — Capability pack</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0' }}>
          No capability pack is defined for this connector. The catalog entry above is the only declaration available.
        </p>
      </div>
    );
  }
  const baseFlags = pack.capabilities;
  const effective = connectorCapabilityPackEffectiveFlags(pack, worker);
  const baseChips = connectorCapabilityPackChips(baseFlags);
  const effectiveChips = connectorCapabilityPackChips(effective);
  const droppedByWorker = baseChips.filter((cap) => !effectiveChips.includes(cap));

  return (
    <div className="of-panel-muted" style={{ padding: 12, marginTop: 6, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">SDC.44 — Capability pack</p>
          <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {pack.display_name} · {connectorCapabilityFamilyLabel(pack.family)}
            {pack.cdc_input_kind ? <> · CDC input kind: <code>{pack.cdc_input_kind}</code></> : null}
          </p>
        </div>
        <a className="of-text-muted" style={{ fontSize: 11 }} href={pack.docs_url} target="_blank" rel="noreferrer">Docs</a>
      </div>

      <div style={{ fontSize: 12 }}>
        <span className="of-text-muted">Declared capabilities</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {baseChips.length === 0 ? (
            <span className="of-text-muted" style={{ fontSize: 11 }}>None declared.</span>
          ) : (
            baseChips.map((cap) => (
              <span key={cap} className="of-chip" style={{ opacity: effectiveChips.includes(cap) ? 1 : 0.5 }}>
                {capabilityLabel(cap as ConnectorCapability)}
              </span>
            ))
          )}
        </div>
        {droppedByWorker.length > 0 && (
          <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 11 }}>
            Worker <code>{String(worker)}</code> drops: {droppedByWorker.map((cap) => capabilityLabel(cap as ConnectorCapability)).join(', ')}
          </p>
        )}
      </div>

      {pack.notes && pack.notes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
          {pack.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}

      {pack.validation_rules.length > 0 && (
        <div style={{ fontSize: 11 }}>
          <span className="of-text-muted">Source-specific validation rules</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {pack.validation_rules.map((rule) => {
              const supportsCapability = (effective as unknown as Record<string, boolean>)[rule.capability];
              return (
                <li key={rule.id} style={{ opacity: supportsCapability === false ? 0.5 : 1 }}>
                  <strong>{capabilityLabel(rule.capability as ConnectorCapability)}</strong>
                  <span className="of-chip" style={{ marginLeft: 4 }}>{rule.severity}</span>
                  <span style={{ marginLeft: 4 }}>{rule.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ListenerInboundPanel({ descriptor }: { descriptor: ListenerInboundDescriptor | null }) {
  if (!descriptor) return null;
  const blockers = listenerInboundBlockers(descriptor.capabilities);
  const coverage = listenerInboundCoverage(descriptor.capabilities);
  const fullyBlocked = listenerInboundCapabilitiesAreBlocked(descriptor.capabilities);
  const statusTone = descriptor.status === 'blocked' ? '#fff7ed' : descriptor.status === 'partial' ? '#fffbeb' : '#ecfdf5';
  const statusBorder = descriptor.status === 'blocked' || descriptor.status === 'partial' ? '#fde68a' : '#bbf7d0';
  return (
    <section className="of-panel-muted" style={{ padding: 12, marginTop: 12, display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">SDC.43 — Listener-style inbound ingestion</p>
        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
          Facets: {coverage.map((f) => listenerInboundFacetLabel(f)).join(', ')} · Status: {descriptor.status}
        </p>
        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
          Recommendation: {descriptor.recommendation.message}
        </p>
      </div>

      {(descriptor.status === 'blocked' || descriptor.status === 'partial') && descriptor.blocked_reason && (
        <div style={{ padding: 8, background: `var(--surface-warning, ${statusTone})`, border: `1px solid ${statusBorder}`, borderRadius: 6, fontSize: 12 }}>
          {descriptor.blocked_reason}
        </div>
      )}

      {descriptor.available_surfaces.length > 0 && (
        <div style={{ fontSize: 11 }}>
          <span className="of-text-muted">Available surfaces today:</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {descriptor.available_surfaces.map((surface) => (
              <li key={surface}><code>{surface}</code></li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 11 }}>
        <div>
          <span className="of-text-muted">Supported auth modes</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {descriptor.supported_auth_modes.map((mode) => (
              <span key={mode} className="of-chip">{mode}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="of-text-muted">Blocked auth modes</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {descriptor.blocked_auth_modes.map((mode) => (
              <span key={mode} className="of-chip" style={{ opacity: 0.6 }}>{mode}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="of-text-muted">Idempotency headers</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {descriptor.idempotency_key_headers.map((h) => (
              <li key={h}><code>{h}</code></li>
            ))}
          </ul>
        </div>
        <div>
          <span className="of-text-muted">Max payload</span>
          <p style={{ margin: '4px 0 0' }}>{formatMediaSetSyncBytes(descriptor.max_payload_bytes)}</p>
        </div>
      </div>

      {fullyBlocked && blockers.length > 0 && (
        <div style={{ fontSize: 11 }}>
          <span className="of-text-muted">Blockers:</span>{' '}
          {blockers.map((b) => (
            <span key={b} className="of-chip" style={{ marginRight: 4 }}>{b}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {descriptor.capabilities.map((cap) => (
          <article key={cap.id} style={{ padding: 10, border: '1px solid var(--border-subtle, #e5e7eb)', borderRadius: 6, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{cap.title}</strong>
                <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{cap.summary}</p>
              </div>
              <span className="of-chip">{cap.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="of-chip">{listenerInboundFacetLabel(cap.facet)}</span>
            </div>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
              <strong>What works today:</strong> {cap.existing_surface}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 11 }}>
              <div>
                <span className="of-text-muted">Required contracts</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {cap.required_contracts.map((contract) => <li key={contract}>{contract}</li>)}
                </ul>
              </div>
              <div>
                <span className="of-text-muted">Readiness checks</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {cap.readiness_checks.slice(0, 4).map((check) => <li key={check}>{check}</li>)}
                </ul>
              </div>
            </div>
            <pre style={{ background: 'var(--surface-code, #0f172a)', color: '#e2e8f0', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', margin: 0 }}>
              <code>{cap.configuration_sketch}</code>
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function VirtualMediaHandoffPanel({ descriptor }: { descriptor: VirtualMediaHandoffDescriptor | null }) {
  if (!descriptor) {
    return null;
  }
  if (descriptor.status === 'not_supported') {
    return (
      <section className="of-panel-muted" style={{ padding: 12, marginTop: 12, display: 'grid', gap: 6 }}>
        <p className="of-eyebrow">SDC.42 — Virtual media handoff</p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          {descriptor.blocked_reason ?? 'This connector cannot expose physical media files for virtual handoff.'}
        </p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
          Supported connectors: {descriptor.supported_connectors.join(', ') || '—'}.
        </p>
      </section>
    );
  }
  const blockers = virtualMediaHandoffBlockers(descriptor.handoffs);
  const coverage = virtualMediaHandoffCoverage(descriptor.handoffs);
  const blocked = virtualMediaHandoffsAreBlocked(descriptor.handoffs);
  return (
    <section className="of-panel-muted" style={{ padding: 12, marginTop: 12, display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">SDC.42 — Virtual media handoff</p>
        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
          Modes: {coverage.map((mode) => virtualMediaHandoffModeLabel(mode)).join(', ')} · Status: {blocked ? 'blocked' : descriptor.status}
        </p>
      </div>
      {blocked && (
        <div style={{ padding: 8, background: 'var(--surface-warning, #fff7ed)', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12 }}>
          {descriptor.blocked_reason ?? 'Blocked until Media Sets virtual media semantics and object storage authorization are defined locally.'}
        </div>
      )}
      {blockers.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <span className="of-text-muted">Blockers:</span>{' '}
          {blockers.map((b) => (
            <span key={b} className="of-chip" style={{ marginRight: 4 }}>{b}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {descriptor.handoffs.map((handoff) => (
          <article key={handoff.id} style={{ padding: 10, border: '1px solid var(--border-subtle, #e5e7eb)', borderRadius: 6, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{handoff.title}</strong>
                <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{handoff.summary}</p>
              </div>
              <span className="of-chip">{handoff.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="of-chip">{virtualMediaHandoffModeLabel(handoff.handoff_mode)}</span>
              <span className="of-chip">{handoff.connector_type}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 11 }}>
              <div>
                <span className="of-text-muted">Required contracts</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {handoff.required_contracts.map((contract) => <li key={contract}>{contract}</li>)}
                </ul>
              </div>
              <div>
                <span className="of-text-muted">Readiness checks</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {handoff.readiness_checks.slice(0, 4).map((check) => <li key={check}>{check}</li>)}
                </ul>
              </div>
            </div>
            <pre style={{ background: 'var(--surface-code, #0f172a)', color: '#e2e8f0', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', margin: 0 }}>
              <code>{handoff.registration_sketch}</code>
            </pre>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
              <strong>Media set:</strong> {handoff.media_set_contract}<br />
              <strong>Object storage:</strong> {handoff.object_storage_contract}<br />
              <strong>Authorization:</strong> {handoff.authorization_contract}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceCodeImportBuildPanel({ resolution }: { resolution: SourceCodeImportBuildResolution | null }) {
  if (!resolution) {
    return <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No build-start resolution loaded.</p>;
  }
  const summary = sourceCodeImportBuildStartSummary(resolution);
  const exportPolicySummary = sourceCodeImportExportPolicySummary(resolution.export_policy_decision);
  const policyBlocked = !resolution.export_policy_decision.build_allowed;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">Build-start resolution</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {summary.join(' · ')}
        </p>
      </div>
      {(resolution.warnings ?? []).length > 0 ? (
        <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
          {(resolution.warnings ?? []).map((warning) => warning.message).join(' ')}
        </div>
      ) : null}
      {policyBlocked ? (
        <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
          {(resolution.export_policy_decision.blocking_reasons ?? []).map((warning) => warning.message).join(' ')}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12 }}>
        <RegistryField label="Resolved source" value={`${resolution.friendly_name} · ${resolution.source_rid}`} href={resolution.generated_binding.source_panel_url} />
        <RegistryField label="Python parameter" value={resolution.python_identifier} />
        <RegistryField label="Config hash" value={resolution.config_hash} />
        <RegistryField label="Source updated" value={resolution.source_updated_at} />
        <RegistryField label="Foundry inputs export" value={resolution.export_controls.allow_foundry_inputs ? 'Enabled' : 'Disabled'} />
        <RegistryField label="Export policy" value={exportPolicySummary.join(' · ')} />
        <RegistryField label="Exportable markings" value={resolution.export_controls.allowed_markings.join(', ') || 'No markings configured'} />
        <RegistryField label="Exportable organizations" value={resolution.export_controls.allowed_organizations.join(', ') || 'No organizations configured'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}>
          <p className="of-eyebrow">Credentials</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {resolution.credential_bindings.map((credential) => (
              <li key={credential.credential_id}>{credential.kind} · {credential.fingerprint} · {credential.credential_id}</li>
            ))}
            {resolution.credential_bindings.length === 0 && <li className="of-text-muted">No credential binding resolved.</li>}
          </ul>
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}>
          <p className="of-eyebrow">Egress policies</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {resolution.egress_policy_bindings.map((policy) => (
              <li key={policy.policy_id}>{policy.kind} · {policy.policy_id}</li>
            ))}
            {resolution.egress_policy_bindings.length === 0 && <li className="of-text-muted">No egress policy binding resolved.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RegistryField({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}>
      <span className="of-text-muted" style={{ fontSize: 11 }}>{label}</span>
      {href ? (
        <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}><a href={href} target="_blank" rel="noreferrer">{value}</a></p>
      ) : (
        <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value}</p>
      )}
    </div>
  );
}

const tableHeaderStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-subtle)',
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tableCellStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'top',
};

const dialogBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(15, 23, 42, 0.42)',
};

const dialogPanelStyle: CSSProperties = {
  width: 'min(820px, 100%)',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  padding: 16,
  display: 'grid',
  gap: 12,
  boxShadow: 'var(--shadow-popover)',
};

interface StatusChipProps {
  icon: GlyphName;
  count: number;
  tone: 'success' | 'danger' | 'info';
  label: string;
}

function StatusChip({ icon, count, tone, label }: StatusChipProps) {
  const palette =
    tone === 'success'
      ? { color: 'var(--status-success)', bg: 'var(--status-success-bg)' }
      : tone === 'danger'
        ? { color: 'var(--status-danger)', bg: 'var(--status-danger-bg)' }
        : { color: 'var(--status-info)', bg: 'var(--status-info-bg)' };
  return (
    <span
      title={label}
      aria-label={`${label}: ${count}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: palette.color,
        background: palette.bg,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Glyph name={icon} size={12} tone="currentColor" />
      {count}
    </span>
  );
}

interface NameLocationPanelProps {
  source: Source;
  name: string;
  description: string;
  projectRid: string;
  folderRid: string;
  ownerId: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onProjectRidChange: (value: string) => void;
  onFolderRidChange: (value: string) => void;
  onOwnerIdChange: (value: string) => void;
  onSave: () => void;
  busy: boolean;
}

function NameLocationPanel({
  source,
  name,
  description,
  projectRid,
  folderRid,
  ownerId,
  onNameChange,
  onDescriptionChange,
  onProjectRidChange,
  onFolderRidChange,
  onOwnerIdChange,
  onSave,
  busy,
}: NameLocationPanelProps) {
  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div>
        <p className="of-eyebrow">Name and location</p>
        <h2 className="of-section-title" style={{ marginTop: 4 }}>{source.name}</h2>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Source id <code>{source.id}</code>.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <LabeledInput label="Name" value={name} onChange={onNameChange} />
        <LabeledInput label="Description" value={description} onChange={onDescriptionChange} />
        <LabeledInput label="Project RID" value={projectRid} onChange={onProjectRidChange} />
        <LabeledInput label="Folder RID" value={folderRid} onChange={onFolderRidChange} />
        <LabeledInput label="Owner ID" value={ownerId} onChange={onOwnerIdChange} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !name.trim()}
          className="of-button of-button--primary"
        >
          Save changes
        </button>
      </div>
    </section>
  );
}

interface OutputFolderPanelProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  busy: boolean;
}

function OutputFolderPanel({ value, onChange, onSave, busy }: OutputFolderPanelProps) {
  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div>
        <p className="of-eyebrow">Output folder</p>
        <h2 className="of-section-title" style={{ marginTop: 4 }}>Default output location</h2>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Discovered assets, exports, and sync outputs default to this folder when no explicit
          destination is provided.
        </p>
      </div>
      <LabeledInput label="Folder path or RID" value={value} onChange={onChange} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="of-button of-button--primary"
        >
          Save changes
        </button>
      </div>
    </section>
  );
}

interface SourceSetupHeaderProps {
  worker: SourceWorker;
  onComputeClick: () => void;
  pillRef?: RefObject<HTMLButtonElement | null>;
}

function SourceSetupHeader({ worker, onComputeClick, pillRef }: SourceSetupHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '4px 4px 12px',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--text-strong)',
        }}
      >
        Source Setup
      </h2>
      <button
        ref={pillRef}
        type="button"
        onClick={onComputeClick}
        aria-haspopup="dialog"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--bg-chip)',
          color: 'var(--text-strong)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          cursor: 'pointer',
          font: 'inherit',
        }}
        title="Change compute type"
      >
        <span style={{ color: 'var(--text-muted)' }}>Compute:</span>
        <span>{workerLabel(worker)}</span>
        <Glyph name="chevron-down" size={12} tone="currentColor" />
      </button>
    </div>
  );
}


interface PreviewRailProps {
  open: boolean;
  onToggle: () => void;
  source: Source;
}

function PreviewRail({ open, onToggle, source }: PreviewRailProps) {
  const railWidth = open ? 360 : 36;
  return (
    <aside
      aria-label="Preview source"
      style={{
        width: railWidth,
        flexShrink: 0,
        background: 'var(--bg-default)',
        borderLeft: '1px solid var(--border-subtle)',
        transition: 'width 160ms ease',
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? 'Hide preview' : 'Show preview'}
        style={{
          width: 36,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 10,
          padding: '14px 0',
          background: 'var(--bg-panel-muted)',
          color: 'var(--text-muted)',
          border: 0,
          borderRight: open ? '1px solid var(--border-subtle)' : 'none',
          cursor: 'pointer',
          font: 'inherit',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-strong)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        }}
      >
        <Glyph
          name={open ? 'chevron-right' : 'chevron-left'}
          size={14}
          tone="currentColor"
        />
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          Preview source
        </span>
      </button>

      {open && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflow: 'auto',
          }}
        >
          <div>
            <p className="of-eyebrow">Preview</p>
            <h3
              style={{
                margin: '4px 0 0',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-strong)',
              }}
            >
              {source.name}
            </h3>
            <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              {source.connector_type} · {source.worker} · {source.status}
            </p>
          </div>
          <PreviewField label="Project RID" value={source.project_rid ?? '—'} />
          <PreviewField label="Folder RID" value={source.folder_rid ?? '—'} />
          <PreviewField label="Owner" value={source.owner_id ?? '—'} />
          <PreviewField label="Network policy" value={source.network_policy_id ?? '—'} />
          <PreviewField
            label="Default output"
            value={source.default_output_location ?? '—'}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 600,
              }}
            >
              Raw config
            </p>
            <pre
              style={{
                margin: '4px 0 0',
                padding: 8,
                background: 'var(--bg-panel-muted)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                overflow: 'auto',
                maxHeight: 240,
              }}
            >
              {JSON.stringify(source, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </aside>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  );
}

interface ActionLinkProps {
  icon: GlyphName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionLink({ icon, label, onClick, disabled }: ActionLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        border: 0,
        background: 'transparent',
        color: disabled ? 'var(--text-soft)' : 'var(--text-default)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius-md)',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <Glyph name={icon} size={14} tone="currentColor" />
      {label}
    </button>
  );
}
