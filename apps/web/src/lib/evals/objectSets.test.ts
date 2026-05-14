import { describe, expect, it } from 'vitest';

import type { EvaluationSuiteColumn, EvaluationTestCase } from '@/lib/api/evals';
import {
  buildObjectSetBackedTestCases,
  recomputeObjectSetBackedTestCases,
  validateObjectSetColumnMappings,
  type EvaluationObjectSetBacking,
  type EvaluationObjectSetRow,
} from './objectSets';

const columns: EvaluationSuiteColumn[] = [
  { id: 'complaint', name: 'Complaint text', apiName: 'complaintText', type: 'string', role: 'input' },
  { id: 'expected', name: 'Expected answer', apiName: 'expectedAnswer', type: 'string', role: 'expected_output' },
  { id: 'customer', name: 'Customer object', apiName: 'customerObject', type: 'object', role: 'metadata' },
  { id: 'owner', name: 'Account owner', apiName: 'accountOwner', type: 'object', role: 'metadata' },
  { id: 'orders', name: 'Related orders', apiName: 'relatedOrders', type: 'object_set', role: 'metadata' },
  { id: 'region', name: 'Owner region', apiName: 'ownerRegion', type: 'string', role: 'metadata' },
  { id: 'scenario', name: 'Scenario', apiName: 'scenario', type: 'string', role: 'metadata' },
];

const rows: EvaluationObjectSetRow[] = [
  {
    id: 'customer-1',
    object_type_id: 'Customer',
    properties: {
      name: 'Acme Logistics',
      complaintText: 'Shipment missed SLA and customer requests escalation.',
    },
    links: {
      accountOwner: {
        id: 'employee-1',
        object_type_id: 'Employee',
        properties: { name: 'Avery', region: 'EMEA' },
      },
      relatedOrders: [
        { id: 'order-1', object_type_id: 'Order', properties: { orderId: '4421' } },
        { id: 'order-2', object_type_id: 'Order', properties: { orderId: '4422' } },
      ],
      expectedResolution: {
        id: 'resolution-1',
        object_type_id: 'Resolution',
        properties: { summary: 'Escalate' },
      },
    },
  },
  {
    id: 'customer-2',
    object_type_id: 'Customer',
    properties: {
      name: 'Northwind Freight',
      complaintText: 'Customer confirms the issue is resolved.',
    },
    links: {
      accountOwner: {
        id: 'employee-2',
        object_type_id: 'Employee',
        properties: { name: 'Morgan', region: 'NA' },
      },
      relatedOrders: [],
      expectedResolution: {
        id: 'resolution-2',
        object_type_id: 'Resolution',
        properties: { summary: 'Close without escalation' },
      },
    },
  },
];

const backing: EvaluationObjectSetBacking = {
  id: 'backing-open-customers',
  objectSetId: 'object-set-open-customers',
  objectSetName: 'Open customer cases',
  objectTypeId: 'Customer',
  refreshMode: 'refresh',
  mappings: [
    { columnApiName: 'customerObject', kind: 'backing_object' },
    { columnApiName: 'complaintText', kind: 'object_property', propertyApiName: 'complaintText' },
    { columnApiName: 'accountOwner', kind: 'linked_object', linkPath: ['accountOwner'] },
    { columnApiName: 'relatedOrders', kind: 'linked_object_set', linkPath: ['relatedOrders'] },
    { columnApiName: 'ownerRegion', kind: 'linked_property', linkPath: ['accountOwner'], linkedPropertyApiName: 'region' },
    { columnApiName: 'expectedAnswer', kind: 'linked_property', linkPath: ['expectedResolution'], linkedPropertyApiName: 'summary' },
    { columnApiName: 'scenario', kind: 'static_value', staticValue: 'object-set regression' },
  ],
};

describe('object-set-backed evaluation test cases', () => {
  it('maps backing objects, properties, linked objects, linked sets, linked properties, and static values', () => {
    expect(validateObjectSetColumnMappings(backing, columns)).toEqual([]);

    const cases = buildObjectSetBackedTestCases({
      backing,
      columns,
      rows,
      now: new Date('2026-05-13T12:00:00Z'),
    });

    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      id: 'object-set-backing-open-customers-customer-1',
      source: 'object_set',
      object_set_backing_id: 'backing-open-customers',
      values: {
        complaintText: 'Shipment missed SLA and customer requests escalation.',
        expectedAnswer: 'Escalate',
        ownerRegion: 'EMEA',
        scenario: 'object-set regression',
      },
      metadata: {
        object_set_id: 'object-set-open-customers',
        object_id: 'customer-1',
        refresh_mode: 'refresh',
      },
    });
    expect(cases[0].values.customerObject).toMatchObject({ id: 'customer-1', objectTypeId: 'Customer' });
    expect(cases[0].values.accountOwner).toMatchObject({ id: 'employee-1', objectTypeId: 'Employee' });
    expect(cases[0].values.relatedOrders).toEqual([
      expect.objectContaining({ id: 'order-1', objectTypeId: 'Order' }),
      expect.objectContaining({ id: 'order-2', objectTypeId: 'Order' }),
    ]);
  });

  it('combines multiple object sets with manual cases and honors snapshot refresh semantics', () => {
    const manualCase: EvaluationTestCase = {
      id: 'manual-1',
      name: 'Manual escalation',
      source: 'manual',
      values: { complaintText: 'Manual case', expectedAnswer: 'Escalate' },
    };
    const snapshotBacking: EvaluationObjectSetBacking = {
      ...backing,
      id: 'snapshot-customers',
      objectSetId: 'object-set-snapshot',
      refreshMode: 'snapshot',
    };
    const refreshBacking: EvaluationObjectSetBacking = {
      ...backing,
      id: 'refresh-customers',
      objectSetId: 'object-set-refresh',
      refreshMode: 'refresh',
      rowLimit: 1,
    };

    const first = recomputeObjectSetBackedTestCases({
      existingTestCases: [manualCase],
      objectSetBackings: [snapshotBacking, refreshBacking],
      columns,
      rowsByObjectSetId: {
        'object-set-snapshot': rows,
        'object-set-refresh': rows,
      },
      now: new Date('2026-05-13T12:00:00Z'),
    });

    expect(first.testCases.map((testCase) => testCase.source)).toEqual(['manual', 'object_set', 'object_set', 'object_set']);
    expect(first.objectSetBackings.find((candidate) => candidate.id === 'snapshot-customers')?.snapshotRows).toHaveLength(2);
    expect(first.testCases.filter((testCase) => testCase.object_set_backing_id === 'refresh-customers')).toHaveLength(1);

    const second = recomputeObjectSetBackedTestCases({
      existingTestCases: first.testCases,
      objectSetBackings: first.objectSetBackings,
      columns,
      rowsByObjectSetId: {
        'object-set-snapshot': [rows[0]],
        'object-set-refresh': [rows[1]],
      },
      now: new Date('2026-05-13T13:00:00Z'),
    });

    expect(second.testCases.find((testCase) => testCase.id === 'manual-1')).toBeTruthy();
    expect(second.testCases.filter((testCase) => testCase.object_set_backing_id === 'snapshot-customers')).toHaveLength(2);
    expect(second.testCases.filter((testCase) => testCase.object_set_backing_id === 'refresh-customers')).toHaveLength(1);
    expect(second.testCases.find((testCase) => testCase.object_set_backing_id === 'refresh-customers')?.metadata?.object_id).toBe('customer-2');
  });
});
