import { executeFunctionPackage, type SimulateFunctionPackageResponse } from '@/lib/api/ontology';

import type {
  WorkshopResolvedVariableValue,
  WorkshopVariableEngineResult,
  WorkshopVariableLike,
} from './workshopVariables';

export type WorkshopFunctionVariableStatus = 'idle' | 'loading' | 'success' | 'error';

export interface WorkshopFunctionParameterBinding {
  name: string;
  kind: 'static' | 'variable';
  variable_id?: string;
  value?: unknown;
}

export interface WorkshopFunctionVariableConfig {
  function_package_id: string;
  object_type_id: string;
  target_object_id: string;
  target_object_variable_id: string;
  result_path: string;
  parameters: WorkshopFunctionParameterBinding[];
}

export interface WorkshopFunctionRuntimeValue {
  value: unknown;
  status: WorkshopFunctionVariableStatus;
  error?: string;
  cache_key?: string;
}

export interface WorkshopFunctionInvocation {
  variableId: string;
  packageId: string;
  body: {
    object_type_id: string;
    target_object_id?: string;
    parameters: Record<string, unknown>;
    justification: string;
  };
  resultPath: string;
  cacheKey: string;
}

export type WorkshopFunctionExecutor = (
  packageId: string,
  body: WorkshopFunctionInvocation['body'],
) => Promise<Pick<SimulateFunctionPackageResponse, 'result'>>;

export const NIL_OBJECT_TYPE_ID = '00000000-0000-0000-0000-000000000000';

const resultCache = new Map<string, WorkshopFunctionRuntimeValue>();
const pendingCache = new Map<string, Promise<WorkshopFunctionRuntimeValue>>();

export function readFunctionVariableConfig(variable: WorkshopVariableLike): WorkshopFunctionVariableConfig {
  const metadata = isRecord(variable.metadata) ? variable.metadata : {};
  return {
    function_package_id: stringValue(metadata.function_package_id ?? metadata.package_id ?? metadata.functionPackageId),
    object_type_id: stringValue(metadata.object_type_id) || variable.object_type_id || NIL_OBJECT_TYPE_ID,
    target_object_id: stringValue(metadata.target_object_id),
    target_object_variable_id: stringValue(metadata.target_object_variable_id),
    result_path: stringValue(metadata.result_path ?? metadata.output_path),
    parameters: readParameterBindings(metadata.parameters ?? metadata.parameter_bindings ?? metadata.inputs),
  };
}

export function functionVariableDependencies(variable: WorkshopVariableLike): string[] {
  const config = readFunctionVariableConfig(variable);
  const deps = new Set<string>();
  if (config.target_object_variable_id) deps.add(config.target_object_variable_id);
  for (const parameter of config.parameters) {
    if (parameter.kind === 'variable' && parameter.variable_id) deps.add(parameter.variable_id);
  }
  deps.delete(variable.id);
  return [...deps];
}

export function buildFunctionInvocation(
  variable: WorkshopVariableLike,
  engine: Pick<WorkshopVariableEngineResult, 'getValue'>,
): WorkshopFunctionInvocation | null {
  const config = readFunctionVariableConfig(variable);
  if (!config.function_package_id) return null;
  const objectTypeId = isUuidLike(config.object_type_id) ? config.object_type_id : NIL_OBJECT_TYPE_ID;
  const targetObjectId = resolveTargetObjectId(config, engine);
  const parameters = Object.fromEntries(
    config.parameters
      .filter((parameter) => parameter.name)
      .map((parameter) => [parameter.name, parameter.kind === 'variable'
        ? valueForFunctionParameter(parameter.variable_id ? engine.getValue(parameter.variable_id) : undefined)
        : parameter.value]),
  );
  const body: WorkshopFunctionInvocation['body'] = {
    object_type_id: objectTypeId,
    parameters,
    justification: `Workshop function variable ${variable.name || variable.id}`,
  };
  if (targetObjectId && isUuidLike(targetObjectId)) body.target_object_id = targetObjectId;
  const cacheKey = stableStringify({
    function_package_id: config.function_package_id,
    object_type_id: body.object_type_id,
    target_object_id: body.target_object_id ?? '',
    parameters,
    result_path: config.result_path,
  });
  return {
    variableId: variable.id,
    packageId: config.function_package_id,
    body,
    resultPath: config.result_path,
    cacheKey,
  };
}

export async function executeFunctionVariable(
  invocation: WorkshopFunctionInvocation,
  executor: WorkshopFunctionExecutor = executeFunctionPackage,
): Promise<WorkshopFunctionRuntimeValue> {
  const response = await executor(invocation.packageId, invocation.body);
  return {
    value: extractFunctionResultValue(response.result, invocation.resultPath),
    status: 'success',
    cache_key: invocation.cacheKey,
  };
}

export function getCachedFunctionVariableValue(cacheKey: string): WorkshopFunctionRuntimeValue | undefined {
  return resultCache.get(cacheKey);
}

export function clearWorkshopFunctionResultCache() {
  resultCache.clear();
  pendingCache.clear();
}

export function executeCachedFunctionVariable(
  invocation: WorkshopFunctionInvocation,
  executor: WorkshopFunctionExecutor = executeFunctionPackage,
): Promise<WorkshopFunctionRuntimeValue> {
  const cached = resultCache.get(invocation.cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = pendingCache.get(invocation.cacheKey);
  if (pending) return pending;
  const promise = executeFunctionVariable(invocation, executor)
    .then((result) => {
      resultCache.set(invocation.cacheKey, result);
      pendingCache.delete(invocation.cacheKey);
      return result;
    })
    .catch((error) => {
      pendingCache.delete(invocation.cacheKey);
      throw error;
    });
  pendingCache.set(invocation.cacheKey, promise);
  return promise;
}

export function extractFunctionResultValue(result: unknown, resultPath = ''): unknown {
  if (resultPath.trim()) return getPath(result, resultPath.trim());
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'value')) return result.value;
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'result')) return result.result;
  return result;
}

function resolveTargetObjectId(
  config: WorkshopFunctionVariableConfig,
  engine: Pick<WorkshopVariableEngineResult, 'getValue'>,
) {
  if (config.target_object_id) return config.target_object_id;
  if (!config.target_object_variable_id) return '';
  const value = engine.getValue(config.target_object_variable_id);
  if (value?.kind === 'selected_object') return value.object?.id ?? '';
  if (value?.kind === 'object_set') return value.objects?.[0]?.id ?? value.objectIds?.[0] ?? '';
  if (value?.kind === 'primitive' || value?.kind === 'aggregation' || value?.kind === 'function_output') return stringValue(value.value);
  return '';
}

function valueForFunctionParameter(value: WorkshopResolvedVariableValue | undefined): unknown {
  if (!value) return null;
  if (value.kind === 'primitive' || value.kind === 'aggregation' || value.kind === 'function_output') return value.value;
  if (value.kind === 'selected_object') return value.object ? objectPayload(value.object) : null;
  if (value.kind === 'object_set') {
    if (value.objects) return value.objects.map(objectPayload);
    if (value.objectIds) return value.objectIds;
    return { object_type_id: value.objectTypeId, filters: value.filters };
  }
  if (value.kind === 'object_set_filter') return value.filters;
  if (value.kind === 'shape') return value.shape;
  return null;
}

function objectPayload(object: { id: string; object_type_id: string; properties?: Record<string, unknown> }) {
  return {
    id: object.id,
    object_type_id: object.object_type_id,
    properties: object.properties ?? {},
  };
}

function readParameterBindings(value: unknown): WorkshopFunctionParameterBinding[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => {
        const variableId = stringValue(entry.variable_id ?? entry.source_variable_id);
        return {
          name: stringValue(entry.name ?? entry.parameter_name),
          kind: variableId ? 'variable' : readBindingKind(entry.kind),
          variable_id: variableId,
          value: entry.value ?? entry.static_value,
        };
      })
      .filter((entry) => entry.name);
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([name, raw]) => {
      if (isRecord(raw)) {
        const variableId = stringValue(raw.variable_id ?? raw.source_variable_id);
        return {
          name,
          kind: variableId ? 'variable' : readBindingKind(raw.kind),
          variable_id: variableId,
          value: raw.value ?? raw.static_value,
        };
      }
      return { name, kind: 'static', value: raw };
    });
  }
  return [];
}

function readBindingKind(value: unknown): 'static' | 'variable' {
  return value === 'variable' ? 'variable' : 'static';
}

function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.').map((entry) => entry.trim()).filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, (_key, entry) => {
    if (!isRecord(entry) || Array.isArray(entry)) return entry;
    return Object.keys(entry).sort().reduce<Record<string, unknown>>((out, key) => {
      out[key] = entry[key];
      return out;
    }, {});
  });
}
