import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRANULAR_POLICY,
  formatGranularPolicy,
  parseGranularPolicy,
  validateGranularPolicy,
} from './granularPolicy';

describe('granularPolicy', () => {
  it('round-trips canonical granular policies', () => {
    const parsed = parseGranularPolicy(formatGranularPolicy(DEFAULT_GRANULAR_POLICY));

    expect(parsed.kind).toBe('granular_policy');
    expect(parsed.root.operator).toBe('and');
    expect(validateGranularPolicy(parsed)).toEqual([]);
  });

  it('requires stable UUIDs for identity arrays', () => {
    const policy = parseGranularPolicy(JSON.stringify({
      kind: 'granular_policy',
      version: 1,
      root: {
        id: 'root',
        type: 'group',
        operator: 'and',
        children: [{
          id: 'groups',
          type: 'comparison',
          left: { kind: 'user_group_ids' },
          operator: 'intersects',
          right: { kind: 'constant_array', value_type: 'uuid_array', values: ['sales-team'] },
        }],
      },
    }));

    expect(validateGranularPolicy(policy).join('\n')).toContain('stable UUID');
  });
});
