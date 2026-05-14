import { describe, expect, it } from 'vitest';

import {
  virtualTableBuildActionLabel,
  virtualTableExternalReference,
  virtualTableComputeLocationLabel,
  virtualTablePipelineInputSupport,
  virtualTablePipelineOutputSupport,
  virtualTableLineageKindLabel,
  virtualTableOwner,
  virtualTablePermissionsLabel,
  virtualTablePushdownLimitations,
  virtualTablePushdownPreview,
  virtualTableSaveLocation,
  virtualTableSchemaSummary,
  type Capabilities,
  type VirtualTable,
} from './virtual-tables';

const capabilities: Capabilities = {
  read: true,
  write: true,
  incremental: true,
  versioning: false,
  compute_pushdown: 'snowpark',
  snapshot_supported: true,
  append_only_supported: true,
  foundry_compute: {
    python_single_node: true,
    python_spark: true,
    pipeline_builder_single_node: false,
    pipeline_builder_spark: true,
  },
};

function table(overrides: Partial<VirtualTable> = {}): VirtualTable {
  return {
    id: 'id',
    rid: 'ri.foundry.main.virtual-table.orders',
    source_rid: 'ri.source.snowflake',
    project_rid: 'ri.project.finance',
    name: 'Finance Orders',
    parent_folder_rid: 'ri.folder.curated',
    locator: { kind: 'tabular', database: 'FINANCE', schema: 'PUBLIC', table: 'ORDERS' },
    table_type: 'TABLE',
    schema_inferred: [{ name: 'ORDER_ID', source_type: 'NUMBER', inferred_type: 'long', nullable: false }],
    capabilities,
    update_detection_enabled: false,
    update_detection_interval_seconds: null,
    last_observed_version: null,
    last_polled_at: null,
    markings: ['finance'],
    properties: {
      external_reference: { kind: 'tabular', database: 'FINANCE', schema: 'PUBLIC', table: 'ORDERS' },
      save_location: { project_rid: 'ri.project.finance', parent_folder_rid: 'ri.folder.curated' },
      owner: 'finance-platform',
      permissions: {
        owners: ['finance-platform'],
        readers: ['finance-analysts'],
        writers: [],
        admins: [],
      },
    },
    created_by: 'user-1',
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
    ...overrides,
  };
}

describe('virtual table registration metadata helpers', () => {
  it('formats external references and save locations', () => {
    const row = table();
    expect(virtualTableExternalReference(row)).toBe('FINANCE.PUBLIC.ORDERS');
    expect(virtualTableSaveLocation(row)).toBe('ri.project.finance / ri.folder.curated');
  });

  it('summarizes schema, owner, and permissions', () => {
    const row = table();
    expect(virtualTableSchemaSummary(row)).toBe('1 column');
    expect(virtualTableOwner(row)).toBe('finance-platform');
    expect(virtualTablePermissionsLabel(row)).toBe('owners: finance-platform | readers: finance-analysts');
  });

  it('falls back to locator, creator, and markings', () => {
    const row = table({
      schema_inferred: [],
      properties: {},
      created_by: 'user-1',
    });
    expect(virtualTableExternalReference(row)).toBe('FINANCE.PUBLIC.ORDERS');
    expect(virtualTableSchemaSummary(row)).toBe('schema pending');
    expect(virtualTableOwner(row)).toBe('user-1');
    expect(virtualTablePermissionsLabel(row)).toBe('markings: finance');
  });

  it('describes source, hybrid, and OpenFoundry pushdown plans', () => {
    const sourcePlan = virtualTablePushdownPreview(table(), {
      columns: ['ORDER_ID'],
      filters: ['ORDER_ID > 0'],
    });
    expect(sourcePlan.compute_location).toBe('source_system');
    expect(sourcePlan.pushed_operations).toContain('filter');
    expect(sourcePlan.uses_copied_dataset).toBe(false);
    expect(virtualTableComputeLocationLabel(sourcePlan.compute_location)).toBe('Source system');

    const hybridPlan = virtualTablePushdownPreview(table(), { requires_foundry_compute: true });
    expect(hybridPlan.compute_location).toBe('hybrid');
    expect(hybridPlan.foundry_operations).toContain('custom_expression');

    const openFoundryPlan = virtualTablePushdownPreview(table({ capabilities: { ...capabilities, compute_pushdown: null } }));
    expect(openFoundryPlan.compute_location).toBe('openfoundry');
    expect(virtualTablePushdownLimitations(table({ capabilities: { ...capabilities, compute_pushdown: null } }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'openfoundry_compute_usage' })]),
    );
  });

  it('labels update-detection build decisions and lineage nodes', () => {
    expect(virtualTableBuildActionLabel('triggered')).toBe('Triggered');
    expect(virtualTableBuildActionLabel('skipped')).toBe('Skipped');
    expect(virtualTableLineageKindLabel('object_type')).toBe('Object output');
    expect(virtualTableLineageKindLabel('project_import')).toBe('Project import');
  });

  it('gates virtual tables for pipeline inputs and outputs', () => {
    expect(virtualTablePipelineInputSupport(table()).supported).toBe(true);
    expect(virtualTablePipelineOutputSupport(table()).supported).toBe(true);

    const noPipelineBuilder = table({
      capabilities: {
        ...capabilities,
        foundry_compute: { ...capabilities.foundry_compute, pipeline_builder_spark: false },
      },
    });
    expect(virtualTablePipelineInputSupport(noPipelineBuilder).reasons).toContain(
      'Pipeline Builder Spark compute is not supported for this virtual table.',
    );

    const readOnly = table({ capabilities: { ...capabilities, write: false } });
    expect(virtualTablePipelineOutputSupport(readOnly).supported).toBe(false);
    expect(virtualTablePipelineOutputSupport(readOnly).reasons).toContain(
      'The source/table type is read-only for virtual table outputs.',
    );
  });
});
