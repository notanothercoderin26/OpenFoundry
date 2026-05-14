import { describe, expect, it } from 'vitest';

import {
  datasetTransactionTypeForFileMode,
  buildHistoryHref,
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
  defaultExportModeForType,
  defaultFileExportSettings,
  defaultStreamingExportSettings,
  defaultTableExportSettings,
  fileExportOverwriteBehaviorLabel,
  defaultOutputKindForCapability,
  defaultTransactionModeForCapability,
  defaultWriteModeForCapability,
  makeFileSyncSettings,
  makeCdcSyncSettings,
  makeTableBatchSyncSettings,
  evaluateStreamingConsistency,
  latestCompletedCheckpoint,
  restartPlanForStream,
  pushStreamEndpointUrl,
  recommendStreamIngestion,
  cdcPrimaryKeyForRow,
  cdcResolutionStrategyLabel,
  cdcDownstreamIntegrationMetadata,
  cdcOrderingSemanticsWarning,
  cdcSchemaFieldResolutionRole,
  resolveCdcArchiveView,
  streamArchivePolicyLabel,
  streamHybridReadLabel,
  streamReplayRangeLabel,
  streamingSyncCanStart,
  streamingSyncCanStop,
  validateStreamingSyncSetup,
  validatePushStreamRecords,
  validateRestApiSourceSetup,
  validateWebhookSetup,
  mapWebhookInputs,
  extractWebhookOutputs,
  redactWebhookMetadata,
  retainWebhookInvocations,
  validateWebhookParameters,
  syncRunDurationMs,
  syncRunIsTerminal,
  classifyRunFailure,
  computeRetryBackoffSeconds,
  defaultRetryBackoffPolicy,
  evaluateRetryDecision,
  retryFailureCategoryLabel,
  connectorSupportsMediaSync,
  formatMediaSetSyncBytes,
  mediaSetSyncRunStatusLabel,
  summarizeMediaSetSyncUsage,
  virtualMediaHandoffsAreBlocked,
  virtualMediaHandoffBlockers,
  virtualMediaHandoffCoverage,
  virtualMediaHandoffModeLabel,
  type VirtualMediaHandoff,
  aggregateListenerInboundStatus,
  listenerInboundBlockers,
  listenerInboundCapabilitiesAreBlocked,
  listenerInboundCoverage,
  listenerInboundFacetLabel,
  type ListenerInboundCapability,
  connectorCapabilityFamilyLabel,
  connectorCapabilityPackChips,
  connectorCapabilityPackEffectiveFlags,
  connectorCapabilityPackValidationRulesFor,
  type ConnectorCapabilityPack,
  formatStreamRate,
  streamMetricsHasWarning,
  streamMetricsWindowLabel,
  streamMetricsWindowSeconds,
  type StreamMetricsSnapshot,
  streamReplayDownstreamKindLabel,
  streamReplayImpactSeverityLabel,
  streamReplayPlanRequiresAcknowledgement,
  sortStreamReplayImpactsBySeverity,
  type StreamReplayPlan,
  type StreamReplayDownstreamImpact,
  classifyQuarantineFailure,
  quarantineFailureCategoryLabel,
  validateDeadLetterSink,
  buildQuarantineReplayPlanLocal,
  quarantineExpiresWithin,
  type QuarantinedRecord,
  suggestedOutputDatasetId,
  sourceSupportsExportType,
  computeModuleAlternativeBlockers,
  computeModuleAlternativeCoverage,
  computeModuleAlternativesAreBlocked,
  connectorAgentCapabilitySummary,
  connectorAgentFailuresForSource,
  connectorAgentHealthLabel,
  connectorAgentsForSource,
  dataConnectionActionableHealthChecks,
  dataConnectionHealthStateLabel,
  dataConnectionHealthSummaryWithStreamChecks,
  dataConnectionHealthSurfaceLabel,
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
  resolveFileExportRunPlan,
  resolveStreamingExportStartPlan,
  resolveTableExportRunPlan,
  advanceStreamingExportOffset,
  streamingExportReplayBehaviorLabel,
  tableExportModeRequiresTruncate,
  validateStreamingExportSettings,
  validateTableExportSettings,
  validateFileSyncSettings,
  validateCdcSyncSetup,
  validateTableBatchSyncSettings,
  validateEgressPoliciesForConnectionTest,
  validateEgressPolicy,
  type NetworkEgressPolicy,
  type SourceGovernance,
} from './data-connection';

function policy(overrides: Partial<NetworkEgressPolicy> = {}): NetworkEgressPolicy {
  return {
    id: 'policy-1',
    name: 'warehouse',
    description: '',
    kind: 'direct',
    address: { kind: 'host', value: 'db.example.com' },
    port: { kind: 'single', value: '5432' },
    protocol: 'tls',
    proxy_mode: 'none',
    status: 'active',
    allowed_organizations: ['org-main'],
    is_global: false,
    permissions: [],
    created_at: '2026-05-13T00:00:00Z',
    ...overrides,
  };
}

describe('data connection egress validation', () => {
  it('rejects invalid endpoints, ports, and proxy combinations', () => {
    expect(validateEgressPolicy(policy({ address: { kind: 'host', value: 'not a host' } }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'address', severity: 'error' })]),
    );
    expect(validateEgressPolicy(policy({ port: { kind: 'single', value: '70000' } }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'port', severity: 'error' })]),
    );
    expect(validateEgressPolicy(policy({ kind: 'agent_proxy', proxy_mode: 'none' }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'proxy_mode', severity: 'error' })]),
    );
  });

  it('requires an active matching policy and allowed organization before testing', () => {
    expect(
      validateEgressPoliciesForConnectionTest([
        policy({ kind: 'agent_proxy', proxy_mode: 'http_connect', status: 'pending_review', allowed_organizations: ['org-other'] }),
      ], { expectedKind: 'agent_proxy', organizationId: 'org-main' }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'warehouse.status', severity: 'error' }),
        expect.objectContaining({ field: 'warehouse.allowed_organizations', severity: 'error' }),
      ]),
    );
  });
});

describe('generic sync resource helpers', () => {
  it('maps capabilities to output, write, and transaction defaults', () => {
    expect(defaultOutputKindForCapability('batch_sync')).toBe('dataset');
    expect(defaultOutputKindForCapability('streaming_sync')).toBe('stream');
    expect(defaultOutputKindForCapability('media_sync')).toBe('media_set');
    expect(defaultWriteModeForCapability('batch_sync')).toBe('snapshot');
    expect(defaultWriteModeForCapability('streaming_sync')).toBe('append');
    expect(defaultTransactionModeForCapability('batch_sync')).toBe('transactional');
    expect(defaultTransactionModeForCapability('cdc_sync')).toBe('external_checkpoint');
  });

  it('suggests stable dataset outputs under the source default location', () => {
    expect(
      suggestedOutputDatasetId(
        { id: 'source-1', name: 'Sales Warehouse', default_output_location: 'rid.folder.outputs/' },
        'public.orders',
      ),
    ).toBe('rid.folder.outputs/sales-warehouse-public-orders');
  });
});

describe('export resource helpers', () => {
  it('maps export defaults, labels, and controls by export type', () => {
    expect(defaultExportModeForType('file')).toBe('incremental');
    expect(defaultExportModeForType('table')).toBe('mirror');
    expect(defaultExportModeForType('streaming')).toBe('continuous');
    expect(dataExportModeLabel('full_snapshot_truncate')).toBe('Full snapshot with truncation');

    expect(sourceSupportsExportType({ connector_type: 's3', supported_capabilities: null }, 'file')).toBe(true);
    expect(sourceSupportsExportType({ connector_type: 's3', supported_capabilities: null }, 'table')).toBe(false);
    expect(sourceSupportsExportType({ connector_type: 'kafka', supported_capabilities: ['streaming_export'] }, 'streaming')).toBe(true);
  });

  it('summarizes export inputs, destinations, and runtime actions', () => {
    const tableExport = {
      export_type: 'table' as const,
      input_dataset_rid: 'ri.foundry.main.dataset.orders',
      input_dataset_id: null,
      input_stream_id: null,
      destination_table: 'warehouse.orders',
      destination_path: null,
      destination_topic: null,
      status: 'scheduled' as const,
    };
    expect(dataExportInputLabel(tableExport)).toBe('ri.foundry.main.dataset.orders');
    expect(dataExportDestinationLabel(tableExport)).toBe('warehouse.orders');
    expect(dataExportCanRun(tableExport)).toBe(true);
    expect(dataExportCanStart(tableExport)).toBe(false);

    const streamExport = { ...tableExport, export_type: 'streaming' as const, input_stream_id: 'stream://orders', destination_topic: 'orders.out', status: 'running' as const };
    expect(dataExportInputLabel(streamExport)).toBe('stream://orders');
    expect(dataExportDestinationLabel(streamExport)).toBe('orders.out');
    expect(dataExportCanRun(streamExport)).toBe(false);
    expect(dataExportCanStop(streamExport)).toBe(true);
  });

  it('summarizes export schedules and build-backed job history', () => {
    expect(dataExportScheduleLabel({
      schedule_cron: '0 * * * *',
      schedule: {
        rid: 'ri.foundry.main.schedule.export-1',
        name: 'Orders export schedule',
        build_system: 'data-integration-build-schedules',
        trigger_kind: 'time',
        cron: '0 * * * *',
        time_zone: 'UTC',
        target_kind: 'table_export',
        target_rid: 'ri.foundry.main.export.export-1',
        target_display_name: 'Orders',
        active: true,
      },
    })).toBe('Orders export schedule · 0 * * * *');

    const history = {
      id: 'hist-1',
      action: 'run',
      status: 'succeeded',
      build_id: 'ri.foundry.main.build.1',
      rows_written: 25,
      retry_attempts: 2,
      created_at: '2026-05-13T01:00:00Z',
    };
    expect(dataExportHistoryHref(history)).toBe('/builds/ri.foundry.main.build.1');
    expect(dataExportHistoryMetrics(history)).toContain('rows 25');
    expect(dataExportHistoryMetrics(history)).toContain('retries 2');
  });

  it('plans file exports from modified files and supports full re-export workaround', () => {
    const settings = defaultFileExportSettings({
      overwrite_behavior: 'overwrite_existing',
      destination_subfolder: null,
      source_files: [
        { path: 'part-000.parquet', size_bytes: 100, modified_at: '2026-05-13T00:00:00Z', transaction_id: 'tx-1' },
        { path: 'part-001.parquet', size_bytes: 200, modified_at: '2026-05-13T00:05:00Z', transaction_id: 'tx-2' },
      ],
      last_successful_at: '2026-05-13T00:02:00Z',
      last_successful_transaction_id: 'tx-1',
    }, 'incremental', 's3://bucket');

    expect(fileExportOverwriteBehaviorLabel(settings.overwrite_behavior)).toBe('Overwrite existing files');
    expect(settings.destination_subfolder_guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('dedicated destination subfolder'),
    ]));

    const incremental = resolveFileExportRunPlan(settings, 's3://bucket', '2026-05-13T01:00:00Z');
    expect(incremental.files_written).toBe(1);
    expect(incremental.files_skipped).toBe(1);
    expect(incremental.bytes_written).toBe(200);
    expect(incremental.last_exported_transaction_id).toBe('tx-2');

    const full = resolveFileExportRunPlan({ ...settings, full_reexport_requested: true }, 's3://bucket/foundry/orders', '2026-05-13T01:00:00Z');
    expect(full.full_reexport).toBe(true);
    expect(full.files_written).toBe(2);
    expect(full.destination_subfolder_advice.join(' ')).toContain('full re-export');
  });

  it('validates table exports and plans mirror versus full snapshot without truncation', () => {
    const schema = [
      { name: 'ORDER_ID', foundry_type: 'BIGINT', external_type: 'BIGINT', nullable: false },
      { name: 'AMOUNT', foundry_type: 'DECIMAL', external_type: 'NUMERIC', nullable: true },
    ];
    const mirror = defaultTableExportSettings({
      input_parquet_backed: true,
      destination_table_exists: true,
      truncate_permission: true,
      row_count_estimate: 25,
      dataset_schema: schema,
      destination_schema: schema,
    }, 'mirror');

    expect(mirror.exact_column_match).toBe(true);
    expect(validateTableExportSettings(mirror, 'mirror')).toEqual([]);
    expect(tableExportModeRequiresTruncate('mirror')).toBe(true);

    const mirrorPlan = resolveTableExportRunPlan(mirror, 'mirror', '2026-05-13T01:00:00Z');
    expect(mirrorPlan.resolution_strategy).toBe('efficient_mirror');
    expect(mirrorPlan.rows_written).toBe(25);
    expect(mirrorPlan.truncate_performed).toBe(true);

    const fullSnapshot = defaultTableExportSettings({ ...mirror, truncate_permission: false }, 'full_snapshot');
    expect(validateTableExportSettings(fullSnapshot, 'full_snapshot')).toEqual([]);
    expect(resolveTableExportRunPlan(fullSnapshot, 'full_snapshot').truncate_required).toBe(false);

    const invalid = validateTableExportSettings({
      input_parquet_backed: false,
      destination_table_exists: false,
      truncate_permission: false,
      dataset_schema: [{ name: 'ORDER_ID', foundry_type: 'ARRAY<STRING>', external_type: 'ARRAY', nullable: false }],
      destination_schema: [{ name: 'order_id', foundry_type: 'BIGINT', external_type: 'BIGINT', nullable: false }],
    }, 'mirror');
    expect(invalid).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'input_not_parquet' }),
      expect.objectContaining({ code: 'truncate_permission_missing' }),
      expect.objectContaining({ code: 'dataset_schema_unsupported_nested_type' }),
      expect.objectContaining({ code: 'schema_column_name_mismatch' }),
    ]));
  });

  it('plans streaming exports with replay warnings and offset restarts', () => {
    const settings = defaultStreamingExportSettings({
      replay_behavior: 'export_replayed_records',
      start_offset: 'previous_export_offset',
      last_exported_offset: '42',
      schedule_restart_enabled: true,
      records_exported_estimate: 3,
      replayed_records_detected: true,
    }, true);

    expect(streamingExportReplayBehaviorLabel(settings.replay_behavior)).toBe('Export replayed records');
    expect(settings.restart_from_previous_offset).toBe(true);
    expect(settings.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'replay_duplicate_risk', severity: 'warning' }),
    ]));

    const plan = resolveStreamingExportStartPlan(settings, true, '2026-05-13T01:00:00Z');
    expect(plan.effective_start_offset).toBe('42');
    expect(plan.schedule_triggered).toBe(true);
    expect(plan.duplicate_risk).toBe(true);
    expect(plan.records_to_export).toBe(3);
    expect(advanceStreamingExportOffset(settings)).toBe('45');

    const skip = defaultStreamingExportSettings({ ...settings, replay_behavior: 'skip_replayed_records' });
    expect(validateStreamingExportSettings(skip)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'replay_drop_risk', severity: 'warning' }),
    ]));
    expect(validateStreamingExportSettings({ start_offset: 'explicit', replay_behavior: 'skip_replayed_records' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'explicit_offset_missing', severity: 'error' }),
    ]));
  });
});

describe('source governance helpers', () => {
  it('labels roles, visibility separation, grants, and audit entries', () => {
    const governance: SourceGovernance = {
      source_id: 'source-1',
      source_rid: 'ri.foundry.main.source.source-1',
      owner_id: 'owner-1',
      role_definitions: [
        { role: 'source_edit' as const, label: 'Source edit', description: '', implied_roles: ['source_view', 'source_use', 'sync_create', 'export_create', 'code_import'] },
        { role: 'source_view' as const, label: 'Source view', description: '' },
      ],
      effective_roles: ['source_edit' as const],
      permission_grants: [{
        principal_id: 'svc-1',
        principal_type: 'service_account',
        principal_name: 'pipeline-bot',
        roles: ['source_view' as const, 'sync_create' as const],
      }],
      visibility: {
        source_visibility_roles: ['source_view' as const, 'source_edit' as const, 'source_owner' as const],
        credential_visibility_roles: ['code_import' as const, 'source_edit' as const, 'source_owner' as const],
        external_sample_visibility_roles: ['source_use' as const, 'source_edit' as const, 'source_owner' as const],
        output_dataset_permission_roles: ['dataset:view', 'dataset:edit'],
        credential_values_visible: false,
        external_samples_persisted: false,
        output_dataset_permissions_enforced: true,
        output_dataset_permission_system: 'dataset-service',
        source_visibility_distinct: true,
        credential_visibility_distinct: true,
        external_sample_visibility_distinct: true,
        output_dataset_permissions_distinct: true,
      },
      output_dataset_permissions: [],
      audit_events: [{
        id: 'audit-1',
        source_id: 'source-1',
        actor_id: 'actor-1',
        event_type: 'source_use',
        action: 'sync_created',
        result: 'succeeded',
        capability: 'batch_sync',
        job_rid: 'sync-1',
        downstream_resource_rid: 'dataset-1',
        created_at: '2026-05-13T00:00:00Z',
      }],
    };

    expect(sourcePermissionRoleLabel('code_import')).toBe('Code import');
    expect(sourceGovernanceCan(governance, 'source_use')).toBe(true);
    expect(sourceGovernanceCan(governance, 'webhook_execute')).toBe(false);
    expect(sourceGovernanceVisibilitySummary(governance)).toEqual(expect.arrayContaining([
      'Credential secret values remain write-only',
      'External samples are not persisted by default',
      expect.stringContaining('Output datasets: checked separately'),
    ]));
    expect(sourceGovernanceGrantSummary(governance.permission_grants[0])).toContain('pipeline-bot');
    expect(sourceGovernanceGrantSummary(governance.permission_grants[0])).toContain('Sync creation');
    expect(sourceGovernanceAuditLabel(governance.audit_events[0])).toContain('sync_created by actor-1');
    expect(sourceGovernanceAuditLabel(governance.audit_events[0])).toContain('dataset-1');
  });
});

describe('source code import helpers', () => {
  it('summarizes generated bindings and build-start live configuration', () => {
    const summary = sourceCodeImportBuildStartSummary({
      source_id: 'source-1',
      source_rid: 'ri.foundry.main.source.source-1',
      source_name: 'Warehouse API',
      connector_type: 'rest_api',
      python_identifier: 'warehouse_api',
      friendly_name: 'Warehouse API',
      repository_rid: 'ri.code.repo.orders',
      build_rid: 'ri.build.1',
      branch: 'main',
      resolved_at: '2026-05-13T00:00:00Z',
      source_updated_at: '2026-05-13T00:00:00Z',
      config_hash: 'sha256:abc',
      credential_bindings: [{ credential_id: 'cred-1', kind: 'api_key', fingerprint: 'fp-1', created_at: '2026-05-13T00:00:00Z' }],
      egress_policy_bindings: [{ policy_id: 'policy-1', kind: 'agent_proxy' }],
      export_controls: { allow_foundry_inputs: true, allowed_markings: ['public'], allowed_organizations: ['operations'] },
      export_policy_decision: {
        status: 'allowed',
        build_allowed: true,
        uses_foundry_inputs: true,
        allow_foundry_inputs: true,
        foundry_inputs: [{
          rid: 'ri.foundry.main.dataset.orders',
          display_name: 'Orders',
          resource_type: 'dataset',
          markings: ['public'],
          organizations: ['operations'],
        }],
        matched_markings: ['public'],
        matched_organizations: ['operations'],
        owner_approval_required: false,
      },
      uses_live_configuration: true,
      no_code_change_required: true,
      generated_binding: {
        library: 'transforms-external-systems',
        import_line: 'from transforms.external.systems import Source',
        decorator: '@external_systems(warehouse_api=Source("ri.foundry.main.source.source-1"))',
        source_rid: 'ri.foundry.main.source.source-1',
        parameter_name: 'warehouse_api',
        friendly_name: 'Warehouse API',
        code_snippet: '...',
        source_panel_url: '/data-connection/sources/source-1',
      },
    });

    expect(summary).toEqual(expect.arrayContaining([
      'config sha256:abc',
      '1 credential binding',
      '1 egress policy binding',
      'live source configuration is resolved at build start',
      'credential, egress, and exportable-marking updates do not require code changes',
      'policy allowed',
      'build allowed',
    ]));
    expect(sourceCodeImportRepositoryDisplay({
      repository_rid: 'ri.code.repo.orders',
      repository_name: 'Orders transforms',
      file_path: 'transforms/orders.py',
      imported_name: 'warehouse_api',
      rendered_display: 'Orders transforms · transforms/orders.py',
    })).toBe('Orders transforms · transforms/orders.py');
  });

  it('summarizes source export control blocks for Foundry inputs', () => {
    expect(sourceCodeImportExportPolicySummary({
      status: 'blocked',
      build_allowed: false,
      uses_foundry_inputs: true,
      allow_foundry_inputs: false,
      foundry_inputs: [{
        rid: 'ri.foundry.main.dataset.orders',
        display_name: 'Orders',
        resource_type: 'dataset',
        markings: ['restricted'],
        organizations: ['finance'],
      }],
      missing_markings: ['Orders:restricted'],
      missing_organizations: ['Orders:finance'],
      blocking_reasons: [{ code: 'source-export-controls-disabled', severity: 'error', message: 'disabled' }],
      owner_approval_required: true,
    })).toEqual([
      'policy blocked',
      'build blocked',
      'Foundry inputs disabled by source owner',
      '1 Foundry input declared',
      'blocked markings Orders:restricted',
      'blocked organizations Orders:finance',
    ]);
  });

  it('matches connector agents to sources, proxy policies, capabilities, and failures', () => {
    const agent = {
      id: 'agent-1',
      name: 'Edge bridge',
      agent_url: 'https://agent.local:8443',
      version: '1.2.3',
      environment: 'prod',
      host: 'edge-01',
      owner_id: 'owner-1',
      status: 'online',
      capabilities: { connectors: ['postgres'] },
      metadata: { region: 'eu' },
      connected_sources: [{ source_id: 'source-1', source_name: 'Warehouse', connector_type: 'postgres', status: 'connected' }],
      supported_connector_capabilities: [{ connector_type: 'postgres', capabilities: ['batch_sync', 'cdc_sync'] }],
      assigned_proxy_policies: [{ policy_id: 'policy-1', source_id: 'source-1', policy_name: 'Warehouse proxy', proxy_mode: 'http_connect', status: 'active' }],
      connection_failures: [{ source_id: 'source-1', policy_id: 'policy-1', code: 'agent_proxy_403', message: 'Proxy rejected host', retryable: false }],
      health: { state: 'error', stale: false, connected_source_count: 1, assigned_proxy_policy_count: 1, failure_count: 1, message: 'Proxy rejected host' },
      last_heartbeat_at: '2026-05-13T00:00:00Z',
      created_at: '2026-05-13T00:00:00Z',
      updated_at: '2026-05-13T00:00:00Z',
    };

    expect(connectorAgentCapabilitySummary(agent)).toEqual(['postgres: batch_sync, cdc_sync']);
    expect(connectorAgentHealthLabel(agent)).toBe('error · v1.2.3 · prod · 1 failure');
    expect(connectorAgentsForSource([agent], 'source-1')).toHaveLength(1);
    expect(connectorAgentsForSource([agent], 'source-2', ['policy-1'])).toHaveLength(1);
    expect(connectorAgentFailuresForSource(agent, 'source-2', ['policy-1'])).toHaveLength(1);
  });

  it('combines Data Connection health summaries with stream lag and checkpoint checks', () => {
    const summary = {
      source_id: 'source-1',
      source_rid: 'ri.foundry.main.source.source-1',
      state: 'ok' as const,
      checked_at: '2026-05-13T00:00:00Z',
      counts: { ok: 1, warning: 0, critical: 0, unknown: 0 },
      surfaces: ['source' as const],
      checks: [{
        code: 'source_status',
        label: 'Source status',
        surface: 'source' as const,
        severity: 'info' as const,
        state: 'ok' as const,
        message: 'Source is healthy.',
      }],
    };
    const stream = {
      id: 'stream-1',
      rid: 'ri.foundry.main.stream.orders',
      name: 'Orders stream',
      schema: [],
      permissions: { readers: [], writers: [], admins: [] },
      branch: 'master',
      hot_buffer: { hot_buffer_retention_ms: 86_400_000, hot_buffer_bytes: 512, cold_dataset_id: null, archive_interval_ms: null },
      cold_storage: { hot_buffer_retention_ms: 0, hot_buffer_bytes: null, cold_dataset_id: 'dataset-1', archive_dataset_id: 'archive-1', archive_interval_ms: 3_600_000 },
      archive_policy: null,
      hybrid_read: null,
      consistency_guarantee: 'AT_LEAST_ONCE' as const,
      offsets: { earliest_offset: 0, latest_offset: 200_000, committed_offset: 50_000, lag: 150_000 },
      checkpoints: [{ id: 'cp-1', status: 'failed', offset: 50_000, created_at: '2026-05-13T00:00:00Z', duration_ms: null }],
      restart_plan: null,
      consistency: null,
      cdc_metadata: null,
      replay: null,
      source_sync_ids: ['sync-1'],
      consumers: [],
      health: { state: 'healthy' as const, message: null, last_checked_at: '2026-05-13T00:00:00Z' },
      live_view: [],
      archive_view: [],
      created_at: '2026-05-13T00:00:00Z',
      updated_at: '2026-05-13T00:00:00Z',
    };

    const combined = dataConnectionHealthSummaryWithStreamChecks(summary, [stream]);

    expect(combined.state).toBe('critical');
    expect(combined.counts.critical).toBe(2);
    expect(combined.surfaces).toContain('stream');
    expect(dataConnectionActionableHealthChecks(combined).map((check) => check.code)).toEqual(expect.arrayContaining(['stream_lag', 'checkpoint_failure']));
    expect(dataConnectionHealthStateLabel(combined.state)).toBe('Critical');
    expect(dataConnectionHealthSurfaceLabel('network_policy')).toBe('Network policy');
  });

  it('tracks external transform pattern coverage for code-based alternatives', () => {
    const patterns = [
      { id: 'rest', title: 'REST', summary: '', alternative_for: ['batch_sync'], example_kind: 'rest_api', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: false, requires_export_controls: false, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'Source("ri.source")', docs_url: '' },
      { id: 'db', title: 'DB', summary: '', alternative_for: ['table_batch_sync', 'table_export'], example_kind: 'database', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: true, requires_export_controls: true, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'Source("ri.source")', docs_url: '' },
      { id: 'parquet', title: 'Parquet', summary: '', alternative_for: ['batch_sync'], example_kind: 'buffered_parquet', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: false, requires_export_controls: false, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'to_parquet', docs_url: '' },
      { id: 'csv', title: 'CSV', summary: '', alternative_for: ['file_export'], example_kind: 'csv_export', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: true, requires_export_controls: true, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'to_csv', docs_url: '' },
      { id: 'media', title: 'Media', summary: '', alternative_for: ['media_sync_handoff', 'virtual_media_registration'], example_kind: 'media_sync', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: false, requires_export_controls: false, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'media', docs_url: '' },
      { id: 'vt', title: 'VT', summary: '', alternative_for: ['virtual_table_registration'], example_kind: 'virtual_table_registration', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: false, requires_export_controls: false, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'virtual-tables/register', docs_url: '' },
      { id: 'light', title: 'Light', summary: '', alternative_for: ['batch_sync'], example_kind: 'lightweight_transform', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: true, requires_export_controls: true, requires_agent_proxy: false, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'head(1000)', docs_url: '' },
      { id: 'proxy', title: 'Proxy', summary: '', alternative_for: ['batch_sync'], example_kind: 'agent_proxy', runtime: 'python_transform', requires_source_import: true, requires_foundry_input: false, requires_export_controls: false, requires_agent_proxy: true, source_requirements: [], recommended_when: [], limitations: [], code_snippet: 'create_socket', docs_url: '' },
    ];

    expect(sourceCodeImportPatternCoverage(patterns)).toEqual([
      'batch_sync',
      'file_export',
      'media_sync_handoff',
      'table_batch_sync',
      'table_export',
      'virtual_media_registration',
      'virtual_table_registration',
    ]);
    expect(sourceCodeImportExampleKinds(patterns)).toEqual(expect.arrayContaining([
      'agent_proxy',
      'buffered_parquet',
      'csv_export',
      'database',
      'lightweight_transform',
      'rest_api',
    ]));
  });

  it('keeps compute module alternatives blocked until runtime contracts exist', () => {
    const base = {
      title: 'Compute module',
      summary: '',
      runtime_kind: 'long_running_compute_module',
      status: 'blocked',
      supported_languages: ['python', 'typescript', 'java', 'go'],
      required_contracts: [
        'long_running_arbitrary_language_runtime',
        'deployment_and_rollout_contract',
        'source_import_binding_contract',
        'checkpoint_health_and_logs_contract',
      ],
      blockers: [
        'compute_module_runtime',
        'compute_module_deployment_contract',
        'compute_module_source_import_contract',
      ],
      readiness_checks: ['runtime is ready'],
      source_rid: 'ri.foundry.main.source.orders',
      source_import_contract: 'source imports must be injectable',
      deployment_contract: 'deployment APIs exist',
      execution_contract: 'checkpoints are durable',
      code_sketch: 'source_import("ri.foundry.main.source.orders")',
      docs_url: 'https://www.palantir.com/docs/foundry/data-connection/core-concepts/',
    };
    const alternatives = [
      { ...base, id: 'sync', alternative_for: 'streaming_sync' },
      { ...base, id: 'export', alternative_for: 'streaming_export' },
      { ...base, id: 'cdc', alternative_for: 'cdc_sync' },
      { ...base, id: 'webhook', alternative_for: 'webhook' },
    ];

    expect(computeModuleAlternativeCoverage(alternatives)).toEqual([
      'cdc_sync',
      'streaming_export',
      'streaming_sync',
      'webhook',
    ]);
    expect(computeModuleAlternativeBlockers(alternatives)).toEqual([
      'compute_module_deployment_contract',
      'compute_module_runtime',
      'compute_module_source_import_contract',
    ]);
    expect(computeModuleAlternativesAreBlocked(alternatives)).toBe(true);
  });
});


describe('file-based sync mode helpers', () => {
  it('maps file sync modes to dataset transaction types', () => {
    expect(datasetTransactionTypeForFileMode('snapshot_mirror')).toBe('SNAPSHOT');
    expect(datasetTransactionTypeForFileMode('incremental_append')).toBe('APPEND');
    expect(datasetTransactionTypeForFileMode('historical_snapshot_incremental')).toBe('SNAPSHOT');
  });

  it('warns on contradictory file sync settings', () => {
    const settings = makeFileSyncSettings({
      mode: 'incremental_append',
      exclude_already_synced: false,
      file_count_limit: 0,
      include_globs: ['**/*.csv'],
      exclude_globs: ['**/*.csv'],
      include_path_metadata: false,
      path_metadata_columns: ['source_path'],
      historical_snapshot_cutoff: null,
      incremental_recent_window: null,
      low_level: null,
    });

    expect(validateFileSyncSettings(settings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'incremental-without-dedup', severity: 'warning' }),
        expect.objectContaining({ code: 'invalid-file-count-limit', severity: 'error' }),
        expect.objectContaining({ code: 'contradictory-glob', severity: 'warning' }),
        expect.objectContaining({ code: 'path-columns-disabled', severity: 'warning' }),
      ]),
    );
  });
});

describe('table batch sync helpers', () => {
  it('maps table sync modes to dataset transaction types', () => {
    expect(datasetTransactionTypeForTableMode('full_snapshot')).toBe('SNAPSHOT');
    expect(datasetTransactionTypeForTableMode('incremental')).toBe('APPEND');
  });

  it('captures incremental warnings when a table lacks change detection', () => {
    const settings = makeTableBatchSyncSettings({
      mode: 'incremental',
      infer_schema: true,
      selected_tables: [
        {
          source_table: 'public.orders',
          destination_dataset_id: 'dataset://orders',
          incremental_column: null,
          estimated_row_count: 123,
        },
      ],
      incremental_column: null,
      row_count: 123,
      transaction_ids: ['tx-1'],
    });

    expect(validateTableBatchSyncSettings(settings)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-incremental-column', severity: 'warning' })]),
    );
  });
});


describe('sync run lifecycle helpers', () => {
  it('classifies terminal statuses and derives duration/build links', () => {
    expect(syncRunIsTerminal('succeeded')).toBe(true);
    expect(syncRunIsTerminal('retrying')).toBe(false);
    expect(syncRunDurationMs({ started_at: '2026-05-13T00:00:00Z', finished_at: '2026-05-13T00:00:03Z' })).toBe(3000);
    expect(buildHistoryHref({ build_id: 'build 1', job_id: 'job 2' })).toBe('/builds/build%201/jobs/job%202');
  });
});

describe('stream resource helpers', () => {
  it('describes replay ranges safely', () => {
    expect(streamReplayRangeLabel(null)).toBe('Replay disabled');
    expect(streamReplayRangeLabel({ status: 'available', from_offset: 10, to_offset: null, requested_by: 'u1', requested_at: '2026-05-13T00:00:00Z' })).toBe('available: 10 → latest');
  });

  it('resolves CDC live changelog rows into archive/current-state rows', () => {
    const metadata = {
      input_kind: 'relational_connector' as const,
      source_database: 'warehouse',
      source_schema: 'public',
      source_table: 'orders',
      source_topic: null,
      primary_key_columns: ['order_id'],
      ordering_column: 'sequence',
      deletion_column: 'deleted',
      output_stream_id: 'orders-cdc',
      output_stream_location: 'stream://orders-cdc',
      schema: [
        { name: 'order_id', source_type: 'string', foundry_type: 'String', nullable: false },
        { name: 'sequence', source_type: 'long', foundry_type: 'Long', nullable: false },
        { name: 'deleted', source_type: 'boolean', foundry_type: 'Boolean', nullable: false },
        { name: 'status', source_type: 'string', foundry_type: 'String', nullable: true },
      ],
      start_position: 'latest' as const,
      source_database_cdc_enabled: true,
      source_table_cdc_enabled: true,
      changelog_input_validated: false,
      connector_metadata: { connector_type: 'postgresql' },
    };
    const resolution = resolveCdcArchiveView({
      cdc_metadata: metadata,
      live_view: [
        { offset: 0, event_time: '2026-05-13T00:00:00Z', source: 'hot', payload: { order_id: 'o1', sequence: 1, deleted: false, status: 'draft' } },
        { offset: 1, event_time: '2026-05-13T00:00:01Z', source: 'hot', payload: { order_id: 'o2', sequence: 1, deleted: false, status: 'open' } },
        { offset: 2, event_time: '2026-05-13T00:00:02Z', source: 'hot', payload: { order_id: 'o1', sequence: 3, deleted: false, status: 'paid' } },
        { offset: 3, event_time: '2026-05-13T00:00:03Z', source: 'cold', payload: { order_id: 'o2', sequence: 2, deleted: true, status: 'cancelled' } },
        { offset: 4, event_time: '2026-05-13T00:00:04Z', source: 'hot', payload: { order_id: 'o1', sequence: 2, deleted: false, status: 'late old event' } },
      ],
      archive_view: [],
    });

    expect(resolution.archive_rows).toHaveLength(1);
    expect(resolution.archive_rows[0].payload).toMatchObject({ order_id: 'o1', sequence: 3, status: 'paid' });
    expect(resolution.deleted_rows[0].payload).toMatchObject({ order_id: 'o2', deleted: true });
    expect(cdcPrimaryKeyForRow(resolution.archive_rows[0], resolution.primary_key_columns)).toBe('order_id=o1');
    expect(cdcResolutionStrategyLabel(metadata)).toContain('Group by order_id');
    expect(cdcSchemaFieldResolutionRole('sequence', metadata)).toBe('ordering column');
  });

  it('packages CDC metadata for downstream consumers and warns on custom/backfilled ordering', () => {
    const metadata = {
      input_kind: 'streaming_middleware_changelog' as const,
      source_database: null,
      source_schema: null,
      source_table: '',
      source_topic: 'orders.changelog',
      primary_key_columns: ['order_id'],
      ordering_column: 'sequence',
      deletion_column: 'deleted',
      output_stream_id: 'stream-orders-cdc',
      output_stream_location: 'stream://orders-cdc',
      schema: [
        { name: 'order_id', source_type: 'string', foundry_type: 'String', nullable: false },
        { name: 'sequence', source_type: 'long', foundry_type: 'Long', nullable: false },
        { name: 'deleted', source_type: 'boolean', foundry_type: 'Boolean', nullable: false },
      ],
      start_position: 'offset' as const,
      start_position_value: 12,
      source_database_cdc_enabled: false,
      source_table_cdc_enabled: false,
      changelog_input_validated: true,
      connector_metadata: { connector_type: 'kafka', properties: { manual_backfill: true } },
    };

    const bundle = cdcDownstreamIntegrationMetadata({
      id: 'stream-orders-cdc',
      name: 'Orders CDC',
      schema: metadata.schema,
      cdc_metadata: metadata,
      live_view: [],
      archive_view: [],
    });

    expect(bundle?.required_metadata_columns).toEqual(['order_id', 'sequence', 'deleted']);
    expect(bundle?.targets.find((target) => target.surface === 'pipeline_builder')?.metadata).toMatchObject({
      key_by: { primary_key_columns: ['order_id'], ordering_column: 'sequence', deletion_column: 'deleted' },
    });
    expect(bundle?.targets.find((target) => target.surface === 'ontology_indexing')?.status).toBe('warning');
    expect(bundle?.targets.find((target) => target.surface === 'data_health')?.recommended_checks?.map((check) => check.code)).toEqual(expect.arrayContaining([
      'cdc-required-metadata-present',
      'cdc-primary-key-not-null',
      'cdc-ordering-not-null',
      'cdc-deletion-marker-boolean',
    ]));
    expect(cdcOrderingSemanticsWarning(metadata)?.code).toBe('cdc-ordering-preservation-before-object-indexing');
  });
});


describe('streaming sync setup helpers', () => {
  it('validates long-running streaming sync configuration and start/stop states', () => {
    expect(streamingSyncCanStart('stopped')).toBe(true);
    expect(streamingSyncCanStop('running')).toBe(true);
    expect(validateStreamingSyncSetup({
      source_id: 'source-1',
      source_topic: '',
      key_fields: [],
      start_offset: 'latest',
      consistency_guarantee: 'EXACTLY_ONCE',
      checkpoint_interval_ms: 500,
      output_stream_location: '',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-streaming-topic', severity: 'error' }),
      expect.objectContaining({ code: 'missing-output-stream', severity: 'error' }),
      expect.objectContaining({ code: 'checkpoint-too-frequent', severity: 'warning' }),
      expect.objectContaining({ code: 'exactly-once-without-key', severity: 'warning' }),
    ]));
  });
});

describe('CDC sync setup helpers', () => {
  it('validates relational CDC readiness, changelog metadata, and schema capture', () => {
    const settings = makeCdcSyncSettings({
      input_kind: 'relational_connector',
      source_database: 'warehouse',
      source_schema: 'public',
      source_table: 'orders',
      source_topic: null,
      primary_key_columns: ['order_id', 'order_id'],
      ordering_column: 'commit_lsn',
      deletion_column: 'is_deleted',
      output_stream_id: null,
      output_stream_location: 'stream://orders-cdc',
      schema: [
        { name: 'order_id', source_type: 'uuid', foundry_type: 'String', nullable: false },
        { name: 'commit_lsn', source_type: 'text', foundry_type: 'String', nullable: false },
        { name: 'is_deleted', source_type: 'boolean', foundry_type: 'Boolean', nullable: false },
      ],
      start_position: 'initial_snapshot',
      start_position_value: null,
      source_database_cdc_enabled: true,
      source_table_cdc_enabled: true,
      changelog_input_validated: false,
      connector_metadata: { debezium_connector: 'postgres' },
    }, 'postgresql');

    expect(settings.primary_key_columns).toEqual(['order_id']);
    expect(validateCdcSyncSetup(settings, 'postgresql')).toEqual([]);
    expect(settings.connector_metadata).toMatchObject({
      connector_type: 'postgresql',
      source_database: 'warehouse',
      source_table: 'orders',
      output_stream_id: null,
      debezium_connector: 'postgres',
    });
  });

  it('rejects unsupported, unprepared, or incomplete CDC inputs', () => {
    expect(validateCdcSyncSetup({
      input_kind: 'relational_connector',
      source_database: '',
      source_schema: '',
      source_table: '',
      source_topic: null,
      primary_key_columns: [],
      ordering_column: '',
      deletion_column: null,
      output_stream_id: null,
      output_stream_location: '',
      schema: [],
      start_position: 'lsn',
      start_position_value: null,
      source_database_cdc_enabled: false,
      source_table_cdc_enabled: false,
      changelog_input_validated: false,
      connector_metadata: { connector_type: 's3' },
    }, 's3')).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-cdc-connector', severity: 'error' }),
      expect.objectContaining({ code: 'missing-cdc-source-table', severity: 'error' }),
      expect.objectContaining({ code: 'database-cdc-not-enabled', severity: 'error' }),
      expect.objectContaining({ code: 'table-cdc-not-enabled', severity: 'error' }),
      expect.objectContaining({ code: 'missing-cdc-primary-key', severity: 'error' }),
      expect.objectContaining({ code: 'missing-cdc-ordering-column', severity: 'error' }),
      expect.objectContaining({ code: 'missing-cdc-output-stream', severity: 'error' }),
      expect.objectContaining({ code: 'missing-cdc-start-position-value', severity: 'error' }),
    ]));

    expect(validateCdcSyncSetup({
      input_kind: 'streaming_middleware_changelog',
      source_database: null,
      source_schema: null,
      source_table: '',
      source_topic: '',
      primary_key_columns: ['id'],
      ordering_column: 'sequence',
      deletion_column: 'deleted',
      output_stream_id: 'stream-orders',
      output_stream_location: '',
      schema: [
        { name: 'id', source_type: 'string', foundry_type: 'String', nullable: false },
        { name: 'sequence', source_type: 'long', foundry_type: 'Long', nullable: false },
        { name: 'deleted', source_type: 'boolean', foundry_type: 'Boolean', nullable: false },
      ],
      start_position: 'latest',
      source_database_cdc_enabled: false,
      source_table_cdc_enabled: false,
      changelog_input_validated: false,
      connector_metadata: { connector_type: 'kafka' },
    }, 'kafka')).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-cdc-source-topic', severity: 'error' }),
      expect.objectContaining({ code: 'changelog-shape-not-validated', severity: 'error' }),
    ]));
  });
});

describe('stream hot/cold storage helpers', () => {
  it('summarizes archive policy and hybrid read metadata', () => {
    expect(streamArchivePolicyLabel({ enabled: true, archive_dataset_id: 'dataset.archive', cadence_ms: 60000, retention_ms: 3600000, last_archived_at: null })).toBe('60000ms cadence → dataset.archive');
    expect(streamHybridReadLabel({ hot_rows: 10, cold_rows: 20, from_offset: 1, to_offset: 30, consistency_guarantee: 'AT_LEAST_ONCE' })).toBe('10 hot + 20 cold rows (1 → 30)');
  });
});


describe('stream checkpoint restart helpers', () => {
  it('finds the latest completed checkpoint and builds a restart plan', () => {
    const stream = {
      checkpoints: [
        { id: 'cp-old', status: 'completed', offset: 10, last_processed_source_location: 'topic:0:10', created_at: '2026-05-13T00:00:00Z', completed_at: '2026-05-13T00:00:01Z', duration_ms: 1000 },
        { id: 'cp-new', status: 'completed', offset: 20, last_processed_source_location: 'topic:0:20', created_at: '2026-05-13T00:01:00Z', completed_at: '2026-05-13T00:01:01Z', duration_ms: 1000 },
      ],
    };

    expect(latestCompletedCheckpoint(stream.checkpoints)?.id).toBe('cp-new');
    expect(restartPlanForStream(stream)).toMatchObject({ can_restart: true, latest_completed_checkpoint_id: 'cp-new', restart_from_source_location: 'topic:0:20' });
  });
});

describe('streaming consistency helpers', () => {
  it('downgrades exactly-once when runtime/source/sink cannot guarantee it', () => {
    expect(evaluateStreamingConsistency({ requested: 'EXACTLY_ONCE', runtime: 'agent_runtime', sourceSupportsExactlyOnce: true, sinkSupportsExactlyOnce: true })).toMatchObject({
      effective: 'AT_LEAST_ONCE',
      downgraded: true,
      duplicate_tolerant_consumers_required: true,
    });
    expect(evaluateStreamingConsistency({ requested: 'AT_LEAST_ONCE', runtime: 'flink', sourceSupportsExactlyOnce: true, sinkSupportsExactlyOnce: true })).toMatchObject({
      effective: 'AT_LEAST_ONCE',
      duplicate_tolerant_consumers_required: true,
    });
  });
});


describe('push-based stream ingestion helpers', () => {
  it('validates push API requests and recommends the right ingestion pattern', () => {
    expect(pushStreamEndpointUrl('ri.foundry.main.dataset.123', 'master')).toContain('/streams/by-dataset/ri.foundry.main.dataset.123/branches/master/records');
    expect(validatePushStreamRecords({
      datasetRid: 'ri.foundry.main.dataset.123',
      branch: 'master',
      tokenReferenceId: 'token-1',
      records: [{ sensor_id: 's1', temperature: 72.5 }],
      schema: [
        { name: 'sensor_id', source_type: 'string', foundry_type: 'String', nullable: false },
        { name: 'temperature', source_type: 'double', foundry_type: 'Double', nullable: false },
      ],
    })).toEqual([]);
    expect(validatePushStreamRecords({ datasetRid: '', branch: '', tokenReferenceId: '', records: [] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-stream-dataset-rid', severity: 'error' }),
      expect.objectContaining({ code: 'missing-stream-branch', severity: 'error' }),
      expect.objectContaining({ code: 'missing-push-token', severity: 'error' }),
      expect.objectContaining({ code: 'empty-push-records', severity: 'error' }),
    ]));
    expect(recommendStreamIngestion({ sourceConnectorExists: true, inboundSystemCanAuthenticate: true, inboundSystemConformsToSchema: true }).kind).toBe('streaming_sync');
    expect(recommendStreamIngestion({ sourceConnectorExists: false, inboundSystemCanAuthenticate: false, inboundSystemConformsToSchema: true }).kind).toBe('listener');
  });
});

describe('REST API source and webhook setup helpers', () => {
  it('validates REST source auth and webhook request options', () => {
    expect(validateRestApiSourceSetup({
      name: 'Orders API',
      base_domain: 'https://api.example.com',
      auth: { kind: 'api_key', credential_reference_id: 'cred-1', header_name: 'X-API-Key' },
      additional_secret_reference_ids: [],
      worker: 'foundry',
      permissions: ['team-data'],
    })).toEqual([]);
    expect(validateRestApiSourceSetup({
      name: '',
      base_domain: 'not-a-url',
      auth: { kind: 'api_key', credential_reference_id: 'cred-1' },
      additional_secret_reference_ids: [],
      worker: 'foundry',
      permissions: [],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-rest-source-name', severity: 'error' }),
      expect.objectContaining({ code: 'invalid-rest-base-domain', severity: 'error' }),
      expect.objectContaining({ code: 'missing-api-key-location', severity: 'error' }),
    ]));
    expect(validateWebhookSetup({
      name: 'Create ticket',
      method: 'POST',
      relative_path: '/tickets',
      query_params: [],
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body_template: '{"title":"{{title}}"}',
      timeout_ms: 30000,
      retry: { max_attempts: 3, initial_backoff_ms: 1000, max_backoff_ms: 10000 },
    })).toEqual([]);
    expect(validateWebhookSetup({
      name: '',
      method: 'GET',
      relative_path: 'tickets',
      query_params: [],
      headers: [{ name: '', value: 'x' }],
      body_template: '{}',
      timeout_ms: 100,
      retry: { max_attempts: 0, initial_backoff_ms: 1000, max_backoff_ms: 10000 },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-webhook-name', severity: 'error' }),
      expect.objectContaining({ code: 'invalid-webhook-path', severity: 'error' }),
      expect.objectContaining({ code: 'invalid-webhook-timeout', severity: 'error' }),
      expect.objectContaining({ code: 'invalid-webhook-retries', severity: 'error' }),
      expect.objectContaining({ code: 'body-on-read-webhook', severity: 'warning' }),
    ]));
  });
});


describe('webhook parameter mapping and extraction helpers', () => {
  it('maps typed inputs, supports conditional skip, and extracts response outputs', () => {
    const inputParameters = [
      { name: 'approved', type: 'boolean' as const, required: true },
      { name: 'tags', type: 'list' as const, required: false, item_type: { name: 'tag', type: 'string' as const, required: true } },
      { name: 'assignee', type: 'optional' as const, required: false, inner_type: { name: 'assignee', type: 'string' as const, required: false } },
    ];
    expect(validateWebhookParameters({ input_parameters: inputParameters, output_parameters: [] })).toEqual([]);
    expect(mapWebhookInputs(inputParameters, [
      { parameter_name: 'approved', source: 'action_parameter', source_path: ['decision'] },
      { parameter_name: 'tags', source: 'literal', value: ['p0', 'customer'] },
      { parameter_name: 'assignee', source: 'function_output', source_path: ['owner'], skip_when_undefined: true },
    ], { decision: true })).toMatchObject({ should_invoke: false, skipped_reason: 'Mapping for assignee returned undefined.' });
    expect(mapWebhookInputs(inputParameters.slice(0, 2), [
      { parameter_name: 'approved', source: 'action_parameter', source_path: ['decision'] },
      { parameter_name: 'tags', source: 'literal', value: ['p0'] },
    ], { decision: true })).toMatchObject({ should_invoke: true, inputs: { approved: true, tags: ['p0'] } });
    expect(extractWebhookOutputs([
      { name: 'ticket_id', type: 'string', extractor: { kind: 'key_path', key_path: ['result', 'id'] } },
      { name: 'status', type: 'integer', extractor: { kind: 'http_status' } },
      { name: 'raw', type: 'string', extractor: { kind: 'full_response_string' } },
    ], { status: 201, body: { result: { id: 'T-1' }, warnings: ['slow'] } })).toMatchObject({ ticket_id: 'T-1', status: 201 });
    expect(extractWebhookOutputs([
      { name: 'first_warning', type: 'string', extractor: { kind: 'array_index', array_index_path: [0] } },
    ], { status: 201, body: ['slow'] })).toEqual({ first_warning: 'slow' });
    expect(extractWebhookOutputs([
      { name: 'first_warning', type: 'string', extractor: { kind: 'json_path', json_path: '$.warnings.0' } },
    ], { status: 201, body: { warnings: ['slow'] } })).toEqual({ first_warning: 'slow' });
  });
});

describe('webhook invocation history helpers', () => {
  it('redacts secrets and enforces retention windows', () => {
    expect(redactWebhookMetadata({ headers: { Authorization: 'Bearer secret', Accept: 'application/json' }, query_params: { api_key: 'secret', q: 'orders' }, body_preview: 'abcdef', body_bytes: 6 }, 3)).toMatchObject({
      headers: { Authorization: '[REDACTED]', Accept: 'application/json' },
      query_params: { api_key: '[REDACTED]', q: 'orders' },
      body_preview: 'abc…',
      truncated: true,
    });
    const retained = retainWebhookInvocations([
      { id: 'old', source_id: 's', webhook_id: 'w', invoked_at: '2025-01-01T00:00:00Z', caller_id: 'u', input_summary: {}, http_status: 200, parsed_outputs: {}, status: 'succeeded', error: null, retry_attempts: 0, request: {}, response: {}, retained_until: null },
      { id: 'new', source_id: 's', webhook_id: 'w', invoked_at: '2026-05-01T00:00:00Z', caller_id: 'u', input_summary: {}, http_status: 500, parsed_outputs: {}, status: 'failed', error: 'boom', retry_attempts: 2, request: { headers: { Authorization: 'secret' } }, response: {}, retained_until: null },
    ], '2026-05-13T00:00:00Z', 183);
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({ id: 'new', request: { headers: { Authorization: '[REDACTED]' } } });
  });
});

describe('SDC.40 retry/recovery helpers', () => {
  it('classifies failure messages into the four foundry categories', () => {
    expect(classifyRunFailure('connection reset by peer')).toBe('network');
    expect(classifyRunFailure('upstream gave 504 gateway timeout')).toBe('network');
    expect(classifyRunFailure('Token expired while refreshing')).toBe('credential');
    expect(classifyRunFailure('401 Unauthorized')).toBe('credential');
    expect(classifyRunFailure('dataset write conflict on transaction')).toBe('destination');
    expect(classifyRunFailure('source table not found')).toBe('source');
    expect(classifyRunFailure('')).toBe('unknown');
  });

  it('computes exponential backoff capped at the configured ceiling', () => {
    const policy = defaultRetryBackoffPolicy('network');
    expect(computeRetryBackoffSeconds(policy, 1)).toBe(5);
    expect(computeRetryBackoffSeconds(policy, 2)).toBe(10);
    expect(computeRetryBackoffSeconds(policy, 3)).toBe(20);
    expect(computeRetryBackoffSeconds(policy, 8)).toBe(policy.max_backoff_seconds);
    expect(computeRetryBackoffSeconds(policy, 0)).toBe(5); // attempt clamped
  });

  it('schedules a retry, escalates persistent failures, and exhausts at the limit', () => {
    const policy = defaultRetryBackoffPolicy('network');
    const now = new Date('2026-05-14T12:00:00Z');

    const first = evaluateRetryDecision(policy, {
      category: 'network',
      errorMessage: 'tls handshake timeout',
      attempt: 1,
      hasCheckpoint: true,
      now,
    });
    expect(first.action).toBe('retry');
    expect(first.next_attempt).toBe(2);
    expect(first.preserve_checkpoint).toBe(true);
    expect(first.next_retry_at).toBe('2026-05-14T12:00:10.000Z');

    const escalated = evaluateRetryDecision(policy, {
      category: 'network',
      errorMessage: 'tls handshake timeout',
      attempt: policy.escalate_after_attempts,
      hasCheckpoint: true,
      now,
    });
    expect(escalated.action).toBe('escalate');
    expect(escalated.escalate_to_data_health).toBe(true);

    const exhausted = evaluateRetryDecision(policy, {
      category: 'network',
      errorMessage: 'tls handshake timeout',
      attempt: policy.max_attempts,
      hasCheckpoint: false,
      now,
    });
    expect(exhausted.action).toBe('exhausted');
    expect(exhausted.preserve_checkpoint).toBe(false);
  });

  it('returns no_retry for non-retryable signatures and out-of-allowlist errors', () => {
    const credentialPolicy = defaultRetryBackoffPolicy('credential');
    const noRetry = evaluateRetryDecision(credentialPolicy, {
      category: 'credential',
      errorMessage: 'Invalid credentials: token rejected',
      attempt: 1,
    });
    expect(noRetry.action).toBe('no_retry');
    expect(noRetry.escalate_to_data_health).toBe(true);

    const networkPolicy = defaultRetryBackoffPolicy('network');
    const outsideAllowlist = evaluateRetryDecision(networkPolicy, {
      category: 'network',
      errorMessage: 'schema mismatch on destination table',
      attempt: 1,
    });
    expect(outsideAllowlist.action).toBe('no_retry');
  });

  it('labels categories', () => {
    expect(retryFailureCategoryLabel('source')).toBe('Source');
    expect(retryFailureCategoryLabel('network')).toBe('Network');
    expect(retryFailureCategoryLabel('credential')).toBe('Credential');
    expect(retryFailureCategoryLabel('destination')).toBe('Destination');
    expect(retryFailureCategoryLabel('unknown')).toBe('Unknown');
  });
});

describe('SDC.41 media sync handoff helpers', () => {
  it('gates media sync setup to the supported connector list', () => {
    expect(connectorSupportsMediaSync('s3')).toBe(true);
    expect(connectorSupportsMediaSync('  S3  ')).toBe(true);
    expect(connectorSupportsMediaSync('onelake')).toBe(true);
    expect(connectorSupportsMediaSync('abfs')).toBe(true);
    expect(connectorSupportsMediaSync('postgresql')).toBe(false);
    expect(connectorSupportsMediaSync('')).toBe(false);
    expect(connectorSupportsMediaSync(null)).toBe(false);
    expect(connectorSupportsMediaSync(undefined)).toBe(false);
  });

  it('formats run status labels', () => {
    expect(mediaSetSyncRunStatusLabel('running')).toBe('Running');
    expect(mediaSetSyncRunStatusLabel('succeeded')).toBe('Succeeded');
    expect(mediaSetSyncRunStatusLabel('partially_succeeded')).toBe('Partially succeeded');
    expect(mediaSetSyncRunStatusLabel('failed')).toBe('Failed');
  });

  it('formats bytes for usage rollups', () => {
    expect(formatMediaSetSyncBytes(0)).toBe('0 B');
    expect(formatMediaSetSyncBytes(512)).toBe('512 B');
    expect(formatMediaSetSyncBytes(2048)).toBe('2.0 KB');
    expect(formatMediaSetSyncBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatMediaSetSyncBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('summarizes usage with files, bytes, and error counts', () => {
    expect(summarizeMediaSetSyncUsage(null)).toBe('No runs recorded yet');
    expect(summarizeMediaSetSyncUsage({
      sync_def_id: 's',
      run_count: 0,
      total_accepted_files: 0,
      total_bytes_accepted: 0,
      total_dispatch_errors: 0,
      total_schema_mismatch: 0,
    })).toBe('No runs recorded yet');

    expect(summarizeMediaSetSyncUsage({
      sync_def_id: 's',
      run_count: 3,
      total_accepted_files: 4500,
      total_bytes_accepted: 8 * 1024 * 1024,
      total_dispatch_errors: 2,
      total_schema_mismatch: 1,
    })).toBe('3 runs · 4,500 files · 8.0 MB · 2 dispatch errors · 1 schema mismatch');
  });
});

describe('SDC.42 virtual media handoff helpers', () => {
  function handoff(overrides: Partial<VirtualMediaHandoff> = {}): VirtualMediaHandoff {
    return {
      id: 'virtual-media-set-sync-s3',
      title: 'Virtual media set sync handoff',
      summary: 'desc',
      handoff_mode: 'media_set_sync_virtual',
      connector_type: 's3',
      status: 'blocked',
      blockers: ['media_sets_virtual_item_semantics', 'object_storage_authorization'],
      readiness_checks: ['readiness'],
      required_contracts: ['contract'],
      source_rid: 'ri.connection.main.source.x',
      media_set_contract: 'media set',
      object_storage_contract: 'storage',
      authorization_contract: 'authz',
      registration_sketch: 'sketch',
      docs_url: 'https://example.com',
      ...overrides,
    };
  }

  it('reports blocked only when all handoffs are blocked', () => {
    expect(virtualMediaHandoffsAreBlocked([])).toBe(false);
    expect(virtualMediaHandoffsAreBlocked([handoff()])).toBe(true);
    expect(virtualMediaHandoffsAreBlocked([handoff(), handoff({ id: 'h2', status: 'available' })])).toBe(false);
  });

  it('flattens blockers and coverage across handoffs', () => {
    const handoffs = [
      handoff({ id: 'h1', handoff_mode: 'media_set_sync_virtual', blockers: ['a', 'b'] }),
      handoff({ id: 'h2', handoff_mode: 'external_transform', blockers: ['b', 'c'] }),
      handoff({ id: 'h3', handoff_mode: 'rest_api', blockers: ['c', 'd'] }),
    ];
    expect(virtualMediaHandoffBlockers(handoffs)).toEqual(['a', 'b', 'c', 'd']);
    expect(virtualMediaHandoffCoverage(handoffs)).toEqual(['external_transform', 'media_set_sync_virtual', 'rest_api']);
  });

  it('labels handoff modes', () => {
    expect(virtualMediaHandoffModeLabel('media_set_sync_virtual')).toBe('VIRTUAL_MEDIA_SET_SYNC dispatch');
    expect(virtualMediaHandoffModeLabel('external_transform')).toBe('External transform registration');
    expect(virtualMediaHandoffModeLabel('rest_api')).toBe('REST API registration');
    expect(virtualMediaHandoffModeLabel('unknown')).toBe('unknown');
  });
});

describe('SDC.43 listener inbound descriptor helpers', () => {
  function capability(overrides: Partial<ListenerInboundCapability> = {}): ListenerInboundCapability {
    return {
      id: 'listener-schema-mapping',
      title: 'Schema mapping',
      summary: 'desc',
      facet: 'schema_mapping',
      status: 'blocked',
      existing_surface: 'none',
      blockers: ['listener_public_documentation', 'schema_mapping_pipeline'],
      readiness_checks: ['readiness'],
      required_contracts: ['contract'],
      configuration_sketch: 'sketch',
      docs_url: 'https://example.com',
      ...overrides,
    };
  }

  it('flattens blockers across capabilities and dedupes', () => {
    const caps = [
      capability({ id: 'a', facet: 'schema_mapping', blockers: ['x', 'y'] }),
      capability({ id: 'b', facet: 'auth_strategy', blockers: ['y', 'z'] }),
    ];
    expect(listenerInboundBlockers(caps)).toEqual(['x', 'y', 'z']);
  });

  it('reports capabilities as fully blocked only when all are blocked', () => {
    expect(listenerInboundCapabilitiesAreBlocked([])).toBe(false);
    expect(listenerInboundCapabilitiesAreBlocked([capability()])).toBe(true);
    expect(listenerInboundCapabilitiesAreBlocked([capability(), capability({ id: 'b', status: 'partial' })])).toBe(false);
  });

  it('returns sorted coverage of all facets present', () => {
    const caps = [
      capability({ id: 'a', facet: 'auth_strategy' }),
      capability({ id: 'b', facet: 'schema_mapping' }),
      capability({ id: 'c', facet: 'dead_letter' }),
    ];
    expect(listenerInboundCoverage(caps)).toEqual(['auth_strategy', 'dead_letter', 'schema_mapping']);
  });

  it('aggregates per-facet status into a single label', () => {
    expect(aggregateListenerInboundStatus([])).toBe('blocked');
    expect(aggregateListenerInboundStatus([capability({ status: 'available' })])).toBe('available');
    expect(aggregateListenerInboundStatus([capability({ status: 'partial' })])).toBe('partial');
    expect(aggregateListenerInboundStatus([
      capability({ id: 'a', status: 'available' }),
      capability({ id: 'b', status: 'partial' }),
    ])).toBe('partial');
    expect(aggregateListenerInboundStatus([
      capability({ id: 'a', status: 'partial' }),
      capability({ id: 'b', status: 'blocked' }),
    ])).toBe('blocked');
  });

  it('labels each facet', () => {
    expect(listenerInboundFacetLabel('schema_mapping')).toBe('Schema mapping');
    expect(listenerInboundFacetLabel('auth_strategy')).toBe('Auth strategy');
    expect(listenerInboundFacetLabel('replay_idempotency')).toBe('Replay & idempotency');
    expect(listenerInboundFacetLabel('dead_letter')).toBe('Dead-letter handling');
    expect(listenerInboundFacetLabel('unknown')).toBe('unknown');
  });
});

describe('SDC.44 connector capability pack helpers', () => {
  const basePack: ConnectorCapabilityPack = {
    connector_type: 'postgresql',
    display_name: 'PostgreSQL',
    family: 'relational_database',
    capabilities: {
      batch_sync: true,
      file_sync: false,
      table_sync: true,
      streaming_sync: false,
      cdc_sync: true,
      media_sync: false,
      file_export: false,
      table_export: true,
      streaming_export: false,
      virtual_table: false,
      webhook: false,
      exploration: true,
    },
    worker_overrides: {
      agent: {
        batch_sync: true,
        file_sync: false,
        table_sync: true,
        streaming_sync: false,
        cdc_sync: true,
        media_sync: false,
        file_export: false,
        table_export: false,
        streaming_export: false,
        virtual_table: false,
        webhook: false,
        exploration: true,
      },
    },
    cdc_input_kind: 'relational_connector',
    validation_rules: [
      { id: 'cdc-requires-pk', capability: 'cdc_sync', severity: 'required', description: 'PK required.' },
      { id: 'table-export', capability: 'table_export', severity: 'required', description: 'Parquet input.' },
    ],
    docs_url: 'https://example.com',
  };

  it('returns capability chips in canonical order', () => {
    expect(connectorCapabilityPackChips(basePack.capabilities)).toEqual([
      'batch_sync',
      'table_sync',
      'cdc_sync',
      'table_export',
      'exploration',
    ]);
  });

  it('applies worker overrides for agent worker', () => {
    expect(connectorCapabilityPackEffectiveFlags(basePack, 'agent').table_export).toBe(false);
    expect(connectorCapabilityPackEffectiveFlags(basePack, 'foundry').table_export).toBe(true);
    expect(connectorCapabilityPackEffectiveFlags(basePack, null).table_export).toBe(true);
    expect(connectorCapabilityPackEffectiveFlags(basePack, 'does-not-exist').table_export).toBe(true);
  });

  it('filters validation rules by capability', () => {
    expect(connectorCapabilityPackValidationRulesFor(basePack, 'cdc_sync')).toEqual([
      { id: 'cdc-requires-pk', capability: 'cdc_sync', severity: 'required', description: 'PK required.' },
    ]);
    expect(connectorCapabilityPackValidationRulesFor(basePack, 'webhook')).toEqual([]);
  });

  it('labels connector families', () => {
    expect(connectorCapabilityFamilyLabel('relational_database')).toBe('Relational database');
    expect(connectorCapabilityFamilyLabel('object_store')).toBe('Object store');
    expect(connectorCapabilityFamilyLabel('foundry_to_foundry')).toBe('Foundry-to-Foundry');
    expect(connectorCapabilityFamilyLabel('unknown_family')).toBe('unknown_family');
  });
});

describe('SDC.45 stream metrics helpers', () => {
  it('maps each canonical window to seconds', () => {
    expect(streamMetricsWindowSeconds('1m')).toBe(60);
    expect(streamMetricsWindowSeconds('5m')).toBe(300);
    expect(streamMetricsWindowSeconds('1h')).toBe(3600);
    expect(streamMetricsWindowSeconds('1d')).toBe(86400);
    expect(streamMetricsWindowSeconds(undefined)).toBe(60);
  });

  it('labels each canonical window', () => {
    expect(streamMetricsWindowLabel('1m')).toBe('Last 1 minute');
    expect(streamMetricsWindowLabel('5m')).toBe('Last 5 minutes');
    expect(streamMetricsWindowLabel('1h')).toBe('Last hour');
    expect(streamMetricsWindowLabel('1d')).toBe('Last day');
    expect(streamMetricsWindowLabel('15m')).toBe('15m');
  });

  it('formats record rates with units', () => {
    expect(formatStreamRate(0, 'records')).toBe('0 rec/s');
    expect(formatStreamRate(3.5, 'records')).toBe('3.5 rec/s');
    expect(formatStreamRate(125, 'records')).toBe('125 rec/s');
    expect(formatStreamRate(1_500, 'records')).toBe('1.5 k rec/s');
    expect(formatStreamRate(2_500_000, 'records')).toBe('2.5 M rec/s');
  });

  it('formats byte rates with units', () => {
    expect(formatStreamRate(0, 'bytes')).toBe('0 B/s');
    expect(formatStreamRate(2048, 'bytes')).toBe('2.0 KB/s');
    expect(formatStreamRate(5 * 1024 * 1024, 'bytes')).toBe('5.0 MB/s');
  });

  it('flags snapshots with warnings, drops, duplicates, lag stalls, or checkpoint failures', () => {
    const base: StreamMetricsSnapshot = {
      stream_id: 'stream-1',
      window: '1m',
      captured_at: '2026-05-14T12:00:00Z',
      ingestion: { records_per_second: 0, bytes_per_second: 0, window_seconds: 60 },
      consumption: { records_per_second: 0, bytes_per_second: 0, window_seconds: 60 },
      lag: { stream_lag_records: 0, hot_buffer_records: 0, hot_buffer_bytes: 0, archive_lag_records: 0, processing_lag_records: 0 },
      checkpoint: { checkpoint_count: 0, average_duration_ms: 0, max_duration_ms: 0, last_duration_ms: 0, average_size_bytes: 0, last_size_bytes: 0, failure_count: 0 },
      retries: { total_retries: 0, dropped_records: 0, duplicate_warnings: 0, recent_failures: 0 },
      partitions: [],
      consumers: [],
      streaming_syncs: [],
      streaming_exports: [],
    };
    expect(streamMetricsHasWarning(null)).toBe(false);
    expect(streamMetricsHasWarning(base)).toBe(false);
    expect(streamMetricsHasWarning({ ...base, warnings: ['something'] })).toBe(true);
    expect(streamMetricsHasWarning({ ...base, retries: { ...base.retries, dropped_records: 5 } })).toBe(true);
    expect(streamMetricsHasWarning({ ...base, retries: { ...base.retries, duplicate_warnings: 1 } })).toBe(true);
    expect(streamMetricsHasWarning({ ...base, lag: { ...base.lag, stream_lag_records: 100 } })).toBe(true);
    expect(streamMetricsHasWarning({ ...base, checkpoint: { ...base.checkpoint, failure_count: 1 } })).toBe(true);
  });
});

describe('SDC.46 stream replay plan helpers', () => {
  function plan(overrides: Partial<StreamReplayPlan> = {}): StreamReplayPlan {
    return {
      stream_id: 'stream-1',
      status: 'ready',
      confirmation_required: false,
      acknowledgements_required: [],
      acknowledgements_satisfied: [],
      acknowledgements_missing: [],
      preconditions_satisfied: [],
      preconditions_blocking: [],
      impacts: [],
      computed_at: '2026-05-14T12:00:00Z',
      ...overrides,
    };
  }

  it('labels downstream kinds and severities', () => {
    expect(streamReplayDownstreamKindLabel('streaming_export')).toBe('Streaming export');
    expect(streamReplayDownstreamKindLabel('cdc_archive_view')).toBe('CDC archive view');
    expect(streamReplayDownstreamKindLabel('object_index')).toBe('Object index');
    expect(streamReplayDownstreamKindLabel('duplicate_tolerant_consumer')).toBe('Consumer');
    expect(streamReplayDownstreamKindLabel('unknown_kind')).toBe('unknown_kind');

    expect(streamReplayImpactSeverityLabel('block')).toBe('Block');
    expect(streamReplayImpactSeverityLabel('warn')).toBe('Warn');
    expect(streamReplayImpactSeverityLabel('info')).toBe('Info');
  });

  it('detects missing acknowledgements', () => {
    expect(streamReplayPlanRequiresAcknowledgement(null, 'ack_x')).toBe(false);
    const p = plan({ acknowledgements_missing: ['ack_streaming_export_exp1'] });
    expect(streamReplayPlanRequiresAcknowledgement(p, 'ack_streaming_export_exp1')).toBe(true);
    expect(streamReplayPlanRequiresAcknowledgement(p, 'ack_streaming_export_exp2')).toBe(false);
  });

  it('sorts impacts by severity (block first, info last)', () => {
    const impacts: StreamReplayDownstreamImpact[] = [
      { kind: 'object_index', resource_id: 'i', severity: 'info', implication: 'i' },
      { kind: 'streaming_export', resource_id: 'b', severity: 'block', implication: 'b' },
      { kind: 'cdc_archive_view', resource_id: 'w', severity: 'warn', implication: 'w' },
    ];
    const sorted = sortStreamReplayImpactsBySeverity(impacts);
    expect(sorted.map((i) => i.severity)).toEqual(['block', 'warn', 'info']);
  });
});

describe('SDC.47 dead-letter / quarantine helpers', () => {
  it('classifies failure messages into the four categories', () => {
    expect(classifyQuarantineFailure('schema validation failed: missing field amount')).toBe('schema_validation');
    expect(classifyQuarantineFailure('JSON parse error at offset 13')).toBe('serialization');
    expect(classifyQuarantineFailure('Permission denied: marking does not match destination')).toBe('permission_check');
    expect(classifyQuarantineFailure('Destination write conflict on dataset')).toBe('destination_write');
    expect(classifyQuarantineFailure('')).toBe('unknown');
    expect(classifyQuarantineFailure('something unrelated')).toBe('unknown');
  });

  it('labels each category', () => {
    expect(quarantineFailureCategoryLabel('schema_validation')).toBe('Schema validation');
    expect(quarantineFailureCategoryLabel('serialization')).toBe('Serialization');
    expect(quarantineFailureCategoryLabel('permission_check')).toBe('Permission check');
    expect(quarantineFailureCategoryLabel('destination_write')).toBe('Destination write');
    expect(quarantineFailureCategoryLabel('unknown')).toBe('Unknown');
    expect(quarantineFailureCategoryLabel('weird_value')).toBe('weird_value');
  });

  it('validates dead-letter sink configuration', () => {
    expect(validateDeadLetterSink({
      kind: 'dataset',
      target_rid: 'ri.datasets.main.dlq',
      retention_days: 14,
      redaction_rules: [{ field: 'payload.email', replacement: '[REDACTED]' }],
    })).toEqual([]);

    const errors = validateDeadLetterSink({
      kind: 'queue' as any,
      target_rid: 'not-a-rid',
      retention_days: 999,
      redaction_rules: [
        { field: '', replacement: 'X' },
        { field: 'x', replacement: 'Y', hash_sha256: true },
      ],
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors).toContain('kind must be dataset or stream');
    expect(errors).toContain('target_rid must start with ri.');
    expect(errors).toContain('retention_days must be between 1 and 365');
  });

  it('computes local replay plan with expired records', () => {
    const now = new Date('2026-05-14T12:00:00Z');
    const records: QuarantinedRecord[] = [
      { id: 'r1', sync_def_id: 's', failure_category: 'schema_validation', error_message: 'e', redacted_payload: {}, redacted_headers: {}, recorded_at: '2026-05-12T00:00:00Z', expires_at: '2026-05-18T00:00:00Z' },
      { id: 'r2', sync_def_id: 's', failure_category: 'schema_validation', error_message: 'e', redacted_payload: {}, redacted_headers: {}, recorded_at: '2026-05-01T00:00:00Z', expires_at: '2026-05-13T00:00:00Z' }, // expired
    ];
    const plan = buildQuarantineReplayPlanLocal('s', records, ['r1', 'r2'], now);
    expect(plan.records_matched).toBe(1);
    expect(plan.records_expired).toBe(1);
    expect(plan.requires_fix).toBe(true);
    expect(plan.blocking_reasons).toContain('quarantine_replay_expired_records');

    const emptyPlan = buildQuarantineReplayPlanLocal('s', records, [], now);
    expect(emptyPlan.requires_fix).toBe(true);
    expect(emptyPlan.blocking_reasons).toContain('quarantine_replay_no_records');
  });

  it('reports time-to-expiry in days', () => {
    const now = new Date('2026-05-14T12:00:00Z');
    const record: QuarantinedRecord = {
      id: 'r1', sync_def_id: 's', failure_category: 'schema_validation', error_message: 'e',
      redacted_payload: {}, redacted_headers: {}, recorded_at: '2026-05-14T00:00:00Z',
      expires_at: '2026-05-20T12:00:00Z',
    };
    expect(quarantineExpiresWithin(record, now).expired).toBe(false);
    expect(quarantineExpiresWithin(record, now).daysLeft).toBe(6);

    const expired: QuarantinedRecord = { ...record, expires_at: '2026-05-13T00:00:00Z' };
    expect(quarantineExpiresWithin(expired, now).expired).toBe(true);
  });
});
