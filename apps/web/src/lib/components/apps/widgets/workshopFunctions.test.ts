import { describe, expect, it, vi } from 'vitest';

import type { ObjectInstance } from '@/lib/api/ontology';

import {
  buildFunctionInvocation,
  executeFunctionVariable,
  extractFunctionResultValue,
  functionVariableDependencies,
  NIL_OBJECT_TYPE_ID,
  readFunctionVariableConfig,
  type WorkshopFunctionExecutor,
} from './workshopFunctions';
import { createWorkshopVariableEngine, type WorkshopVariableLike } from './workshopVariables';

const functionId = '00000000-0000-0000-0000-000000000015';
const objectTypeId = '00000000-0000-0000-0000-000000000042';

function trail(id: string, miles: number): ObjectInstance {
  return {
    id,
    object_type_id: objectTypeId,
    properties: { miles, elevation_gain_ft: 776 },
    created_by: 'test',
    created_at: '2026-05-11T00:00:00Z',
    updated_at: '2026-05-11T00:00:00Z',
  };
}

describe('Workshop function-backed variables', () => {
  it('builds invocations from static and variable inputs', async () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'selected_trail', kind: 'object_set_selection', name: 'Selected trail', object_type_id: objectTypeId },
      { id: 'temperature', kind: 'numeric', name: 'Temperature', object_type_id: '', default_value: 84 },
      {
        id: 'effort',
        kind: 'function_output',
        name: 'Effort score',
        object_type_id: objectTypeId,
        metadata: {
          function_package_id: functionId,
          object_type_id: objectTypeId,
          result_path: 'estimate.max_hr',
          target_object_variable_id: 'selected_trail',
          parameters: [
            { name: 'temperature_f', variable_id: 'temperature' },
            { name: 'coffee_stop', value: true },
          ],
        },
      },
    ];
    const engine = createWorkshopVariableEngine(variables, {
      selectedObjectSets: { selected_trail: [trail('00000000-0000-0000-0000-000000000101', 7.76)] },
    });
    const invocation = buildFunctionInvocation(variables[2], engine);

    expect(functionVariableDependencies(variables[2]).sort()).toEqual(['selected_trail', 'temperature']);
    expect(invocation?.packageId).toBe(functionId);
    expect(invocation?.body.object_type_id).toBe(objectTypeId);
    expect(invocation?.body.target_object_id).toBe('00000000-0000-0000-0000-000000000101');
    expect(invocation?.body.parameters).toEqual({ temperature_f: 84, coffee_stop: true });

    const executor = vi.fn<WorkshopFunctionExecutor>(async () => ({
      result: { estimate: { max_hr: 158 } },
    }));
    const resolved = await executeFunctionVariable(invocation!, executor);

    expect(resolved).toMatchObject({ status: 'success', value: 158, cache_key: invocation?.cacheKey });
    expect(executor).toHaveBeenCalledWith(functionId, invocation?.body);
  });

  it('falls back to nil object context and common result envelopes', () => {
    const variable: WorkshopVariableLike = {
      id: 'effort',
      kind: 'function_output',
      name: 'Effort score',
      object_type_id: 'Trail',
      metadata: { function_package_id: functionId, parameters: { distance_miles: 7.76 } },
    };
    const engine = createWorkshopVariableEngine([variable]);
    const invocation = buildFunctionInvocation(variable, engine);

    expect(readFunctionVariableConfig(variable).object_type_id).toBe('Trail');
    expect(invocation?.body.object_type_id).toBe(NIL_OBJECT_TYPE_ID);
    expect(invocation?.body.parameters).toEqual({ distance_miles: 7.76 });
    expect(extractFunctionResultValue({ value: 172 })).toBe(172);
    expect(extractFunctionResultValue({ result: { score: 9.5 } }, 'result.score')).toBe(9.5);
  });
});
