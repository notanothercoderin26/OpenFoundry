import type { CompassSearchResult } from '@/lib/api/workspace';
import type { GlyphName } from '@/lib/components/ui/Glyph';

export type CompassResourceAction = 'move' | 'rename' | 'trash' | 'restore' | 'share';

export interface OpenWithTarget {
  id: string;
  label: string;
  icon: GlyphName;
  urlTemplate: string;
}

export interface CompassResourceTypeDefinition {
  id: string;
  type: string;
  displayName: string;
  owningService: string;
  defaultIcon: GlyphName;
  supportedActions: CompassResourceAction[];
  openAppURLTemplate: string;
  openWith: OpenWithTarget[];
}

const COMMON_ACTIONS: CompassResourceAction[] = ['move', 'rename', 'trash', 'restore', 'share'];
const READ_ONLY_ACTIONS: CompassResourceAction[] = ['share'];

export const COMPASS_RESOURCE_TYPE_REGISTRY: CompassResourceTypeDefinition[] = [
  {
    id: 'COMPASS_PROJECT',
    type: 'project',
    displayName: 'Project',
    owningService: 'ontology-definition-service',
    defaultIcon: 'project',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/projects/{rid}',
    openWith: [
      { id: 'project', label: 'Project', icon: 'project', urlTemplate: '/projects/{rid}' },
      { id: 'files', label: 'Files', icon: 'folder-open', urlTemplate: '/projects/{rid}' },
    ],
  },
  {
    id: 'COMPASS_FOLDER',
    type: 'folder',
    displayName: 'Folder',
    owningService: 'ontology-definition-service',
    defaultIcon: 'folder',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/projects/{project_rid}/{rid}',
    openWith: [
      { id: 'folder', label: 'Folder', icon: 'folder-open', urlTemplate: '/projects/{project_rid}/{rid}' },
      { id: 'project', label: 'Project', icon: 'project', urlTemplate: '/projects/{project_rid}' },
    ],
  },
  {
    id: 'FOUNDRY_DATASET',
    type: 'dataset',
    displayName: 'Dataset',
    owningService: 'dataset-versioning-service',
    defaultIcon: 'database',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/datasets/{rid}',
    openWith: [
      { id: 'dataset', label: 'Dataset', icon: 'database', urlTemplate: '/datasets/{rid}' },
      { id: 'catalog', label: 'Data Catalog', icon: 'badge-check', urlTemplate: '/projects?catalog=1&q={rid}' },
    ],
  },
  {
    id: 'FOUNDRY_PIPELINE',
    type: 'pipeline',
    displayName: 'Pipeline',
    owningService: 'pipeline-build-service',
    defaultIcon: 'graph',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/pipelines/{rid}',
    openWith: [
      { id: 'pipeline', label: 'Pipeline', icon: 'graph', urlTemplate: '/pipelines/{rid}' },
      { id: 'lineage', label: 'Lineage', icon: 'link', urlTemplate: '/lineage?rid={rid}' },
    ],
  },
  {
    id: 'FOUNDRY_BUILD',
    type: 'build',
    displayName: 'Build',
    owningService: 'pipeline-build-service',
    defaultIcon: 'run',
    supportedActions: READ_ONLY_ACTIONS,
    openAppURLTemplate: '/builds/{rid}',
    openWith: [{ id: 'build', label: 'Build', icon: 'run', urlTemplate: '/builds/{rid}' }],
  },
  {
    id: 'FOUNDRY_JOB',
    type: 'job',
    displayName: 'Job',
    owningService: 'pipeline-build-service',
    defaultIcon: 'list',
    supportedActions: READ_ONLY_ACTIONS,
    openAppURLTemplate: '/builds/jobs/{rid}',
    openWith: [{ id: 'job', label: 'Job', icon: 'list', urlTemplate: '/builds/jobs/{rid}' }],
  },
  {
    id: 'FOUNDRY_SCHEDULE',
    type: 'schedule',
    displayName: 'Schedule',
    owningService: 'pipeline-build-service',
    defaultIcon: 'history',
    supportedActions: ['rename', 'trash', 'restore', 'share'],
    openAppURLTemplate: '/schedules/{rid}',
    openWith: [{ id: 'schedule', label: 'Schedule', icon: 'history', urlTemplate: '/schedules/{rid}' }],
  },
  {
    id: 'FOUNDRY_SOURCE',
    type: 'source',
    displayName: 'Source',
    owningService: 'connector-management-service',
    defaultIcon: 'link',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/data-connection/sources/{rid}',
    openWith: [{ id: 'source', label: 'Source', icon: 'link', urlTemplate: '/data-connection/sources/{rid}' }],
  },
  {
    id: 'FOUNDRY_VIRTUAL_TABLE',
    type: 'virtual-table',
    displayName: 'Virtual table',
    owningService: 'connector-management-service',
    defaultIcon: 'spreadsheet',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/virtual-tables/{rid}',
    openWith: [{ id: 'virtual-table', label: 'Virtual table', icon: 'spreadsheet', urlTemplate: '/virtual-tables/{rid}' }],
  },
  {
    id: 'STREAMS_STREAM',
    type: 'stream',
    displayName: 'Stream',
    owningService: 'ingestion-replication-service',
    defaultIcon: 'graph',
    supportedActions: ['rename', 'trash', 'restore', 'share'],
    openAppURLTemplate: '/streaming/{rid}',
    openWith: [{ id: 'stream', label: 'Stream', icon: 'graph', urlTemplate: '/streaming/{rid}' }],
  },
  {
    id: 'ONTOLOGY_OBJECT_TYPE',
    type: 'object-type',
    displayName: 'Object type',
    owningService: 'ontology-definition-service',
    defaultIcon: 'cube',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/ontology/{rid}',
    openWith: [
      { id: 'ontology', label: 'Ontology', icon: 'ontology', urlTemplate: '/ontology/{rid}' },
      { id: 'object-explorer', label: 'Object Explorer', icon: 'search', urlTemplate: '/object-explorer?rid={rid}' },
    ],
  },
  {
    id: 'ONTOLOGY_ACTION_TYPE',
    type: 'action-type',
    displayName: 'Action type',
    owningService: 'ontology-actions-service',
    defaultIcon: 'run',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/action-types/{rid}',
    openWith: [{ id: 'action-type', label: 'Action type', icon: 'run', urlTemplate: '/action-types/{rid}' }],
  },
  {
    id: 'WORKSHOP_APP',
    type: 'app',
    displayName: 'Application',
    owningService: 'application-composition-service',
    defaultIcon: 'app',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/apps/{rid}',
    openWith: [{ id: 'app', label: 'Application', icon: 'app', urlTemplate: '/apps/{rid}' }],
  },
  {
    id: 'REPORT_REPORT',
    type: 'report',
    displayName: 'Report',
    owningService: 'report-service',
    defaultIcon: 'document',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/reports/{rid}',
    openWith: [{ id: 'report', label: 'Report', icon: 'document', urlTemplate: '/reports/{rid}' }],
  },
  {
    id: 'NOTEPAD_NOTEPAD',
    type: 'notepad',
    displayName: 'Notepad',
    owningService: 'application-composition-service',
    defaultIcon: 'document',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/notepad/{rid}',
    openWith: [{ id: 'notepad', label: 'Notepad', icon: 'document', urlTemplate: '/notepad/{rid}' }],
  },
  {
    id: 'NOTEBOOK_NOTEBOOK',
    type: 'notebook',
    displayName: 'Notebook',
    owningService: 'notebook-runtime-service',
    defaultIcon: 'code',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/notebooks/{rid}',
    openWith: [{ id: 'notebook', label: 'Notebook', icon: 'code', urlTemplate: '/notebooks/{rid}' }],
  },
  {
    id: 'MODELS_MODEL',
    type: 'model',
    displayName: 'Model',
    owningService: 'model-catalog-service',
    defaultIcon: 'cube',
    supportedActions: COMMON_ACTIONS,
    openAppURLTemplate: '/ml?model={rid}',
    openWith: [{ id: 'model', label: 'Model catalog', icon: 'cube', urlTemplate: '/ml?model={rid}' }],
  },
];

const REGISTRY_BY_TYPE = new Map(COMPASS_RESOURCE_TYPE_REGISTRY.map((entry) => [entry.type, entry]));

export const UNKNOWN_RESOURCE_TYPE: CompassResourceTypeDefinition = {
  id: 'UNKNOWN_RESOURCE_TYPE',
  type: 'unknown',
  displayName: 'Resource',
  owningService: 'unknown',
  defaultIcon: 'object',
  supportedActions: [],
  openAppURLTemplate: '/search?q={rid}',
  openWith: [{ id: 'search', label: 'Search', icon: 'search', urlTemplate: '/search?q={rid}' }],
};

export function getResourceTypeDefinition(type: string): CompassResourceTypeDefinition {
  return REGISTRY_BY_TYPE.get(type) ?? {
    ...UNKNOWN_RESOURCE_TYPE,
    type: type || UNKNOWN_RESOURCE_TYPE.type,
  };
}

export function openURLForCompassResource(result: CompassSearchResult): string {
  const definition = getResourceTypeDefinition(result.type);
  const registryURL = expandResourceURL(definition.openAppURLTemplate, result);
  if (registryURL) return registryURL;
  return result.open_url || expandResourceURL(UNKNOWN_RESOURCE_TYPE.openAppURLTemplate, result);
}

export function openWithTargetsForCompassResource(result: CompassSearchResult): OpenWithTarget[] {
  const definition = getResourceTypeDefinition(result.type);
  return definition.openWith.length > 0 ? definition.openWith : UNKNOWN_RESOURCE_TYPE.openWith;
}

export function expandResourceURL(template: string, result: CompassSearchResult): string {
  const parsed = parseRID(result.rid);
  const replacements: Record<string, string> = {
    rid: result.rid,
    project_rid: result.owning_project_rid ?? '',
    project_id: result.owning_project_id ?? '',
    service: parsed.service,
    instance: parsed.instance,
    type: parsed.type || result.type,
    locator: parsed.locator,
  };

  const url = template.replace(/\{([a-z_]+)\}/g, (_match, key: string) => replacements[key] ?? '');
  if (url.includes('//') || url.endsWith('/')) return url.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return url;
}

function parseRID(value: string) {
  const parts = value.split('.');
  if (parts.length >= 5 && parts[0] === 'ri') {
    return {
      service: parts[1] ?? '',
      instance: parts[2] ?? '',
      type: parts[3] ?? '',
      locator: parts.slice(4).join('.'),
    };
  }
  return { service: '', instance: '', type: '', locator: value };
}
