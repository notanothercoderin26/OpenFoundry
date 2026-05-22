// Source of truth for the application launcher catalog. The mapping to
// Foundry apps and the rationale for each alias live in
// docs/reference/launcher-app-mapping.md. The internal IDs in this file
// are the stable contract used by:
//   - localStorage favorites (key `of_favorite_apps`)
//   - the backend `/application-access/evaluate` allowlist in
//     services/identity-federation-service/internal/handlers/control_panel.go
// Keep the two in sync when changing an ID.

import type { GlyphName } from '@/lib/components/ui/Glyph';

export type LauncherCategoryId =
  | 'workspace'
  | 'ontology'
  | 'data-integration'
  | 'analytics-operations'
  | 'ai-platform'
  | 'app-development'
  | 'automation'
  | 'security-governance'
  | 'administration';

export interface LauncherCategoryDef {
  id: LauncherCategoryId | 'all' | '__platform';
  label: string;
  isHeading?: boolean;
}

// Sub-action exposed under the global "+ New" flow. The shell renders
// these alongside the app entry when the user opens "+ New" anywhere
// in the workspace.
export interface LauncherAppNewAction {
  id: string;
  name: string;
  description?: string;
  href: string;
  icon?: GlyphName;
}

export interface LauncherApp {
  id: string;
  href: string;
  name: string;
  description: string;
  icon: GlyphName;
  iconTone: string;
  category: LauncherCategoryId;
  promoted?: boolean;
  newActions?: LauncherAppNewAction[];
}

export const LAUNCHER_CATEGORIES: LauncherCategoryDef[] = [
  { id: 'all', label: 'All apps' },
  { id: '__platform', label: 'PLATFORM APPS', isHeading: true },
  { id: 'workspace', label: 'Workspace' },
  { id: 'ontology', label: 'Ontology' },
  { id: 'data-integration', label: 'Data integration' },
  { id: 'analytics-operations', label: 'Analytics & Operations' },
  { id: 'ai-platform', label: 'AI Platform' },
  { id: 'app-development', label: 'Application development' },
  { id: 'automation', label: 'Automation' },
  { id: 'security-governance', label: 'Security & Governance' },
  { id: 'administration', label: 'Administration' },
];

// The hrefs below are stable per-app paths. Apps without a bespoke page
// resolve to the generic AppRoadmapPage by way of the routes registered
// in router.tsx; once a dedicated component is built, the route binding
// changes but the URL stays the same.

export const LAUNCHER_APPS: LauncherApp[] = [
  // A. Workspace
  {
    id: 'compass',
    href: '/',
    icon: 'folder',
    iconTone: '#60a5fa',
    category: 'workspace',
    name: 'Workspace',
    description: 'Browse, share, and organize projects, files, and resources.',
  },

  // B. Ontology
  {
    id: 'ontology-manager',
    href: '/ontology-manager',
    icon: 'ontology',
    iconTone: '#a78bfa',
    category: 'ontology',
    name: 'Ontology Manager',
    description: 'Shape object models, semantics, action types, and link types.',
  },
  {
    id: 'object-explorer',
    href: '/object-explorer',
    icon: 'object',
    iconTone: '#fb923c',
    category: 'ontology',
    name: 'Object Explorer',
    description: 'Explore linked operational entities, activity, and related records.',
  },
  {
    id: 'object-views',
    href: '/object-views',
    icon: 'view-grid',
    iconTone: '#22d3ee',
    category: 'ontology',
    name: 'Object Views',
    description: 'Configure operational record views, related lists, and quick actions.',
  },

  // C. Data Integration
  {
    id: 'pipeline-builder',
    href: '/pipelines',
    icon: 'graph',
    iconTone: '#a78bfa',
    category: 'data-integration',
    name: 'Pipeline Builder',
    description: 'Design and monitor batch and streaming pipelines, builds, and connections.',
  },
  {
    id: 'code-repositories',
    href: '/code-repos',
    icon: 'code',
    iconTone: '#22d3ee',
    category: 'data-integration',
    name: 'Code Repositories',
    description: 'Browse repositories, reviews, CI gates, and protected merge flows.',
  },
  {
    id: 'data-lineage',
    href: '/lineage',
    icon: 'graph',
    iconTone: '#f472b6',
    category: 'data-integration',
    name: 'Data Lineage',
    description: 'Inspect upstream and downstream dependencies across the data estate.',
  },
  {
    id: 'dataset-preview',
    href: '/datasets',
    icon: 'database',
    iconTone: '#60a5fa',
    category: 'data-integration',
    name: 'Dataset Preview',
    description: 'Inspect dataset schema, rows, branches, and quality status.',
  },
  {
    id: 'linter',
    href: '/pipelines/linter',
    icon: 'badge-check',
    iconTone: '#facc15',
    category: 'data-integration',
    name: 'Pipeline Linter',
    description: 'Detect issues and inefficiencies in data pipelines and get recommendations.',
  },
  {
    id: 'peer-manager',
    href: '/peer-manager',
    icon: 'link',
    iconTone: '#34d399',
    category: 'data-integration',
    name: 'Peer Manager',
    description: 'Share ontology objects and files across enrollments with governance.',
  },
  {
    id: 'machinery',
    href: '/machinery',
    icon: 'cube',
    iconTone: '#a78bfa',
    category: 'data-integration',
    name: 'Job Engine',
    description: 'Manage long-running infrastructure jobs and workers.',
  },
  {
    id: 'data-connection',
    href: '/data-connection',
    icon: 'database',
    iconTone: '#fb923c',
    category: 'data-integration',
    name: 'Data Connection',
    description: 'Connect OpenFoundry to external systems with sources, syncs, exports, and webhooks.',
  },

  // D. Analytics & Operations
  {
    id: 'contour',
    href: '/contour',
    icon: 'graph',
    iconTone: '#fb923c',
    category: 'analytics-operations',
    name: 'Lens',
    description: 'Analyze large datasets with filters, joins, and visualizations.',
  },
  {
    id: 'insight',
    href: '/insight',
    icon: 'eye',
    iconTone: '#a78bfa',
    category: 'analytics-operations',
    name: 'Investigator',
    description: 'Traverse object relationships and build visual investigative analyses.',
  },
  {
    id: 'quiver',
    href: '/quiver',
    icon: 'graph',
    iconTone: '#a78bfa',
    category: 'analytics-operations',
    name: 'Chart Studio',
    description: 'Build interactive dashboards from object and time series data.',
  },
  {
    id: 'notepad',
    href: '/notepad',
    icon: 'document',
    iconTone: '#f472b6',
    category: 'analytics-operations',
    name: 'Notepad',
    description: 'Create, share and export object-aware documents and reports.',
    newActions: [
      {
        id: 'notepad-document-template',
        name: 'Notepad document template',
        href: '/notepad?new=template',
        icon: 'file-type',
      },
    ],
  },
  {
    id: 'fusion',
    href: '/fusion',
    icon: 'spreadsheet',
    iconTone: '#22c55e',
    category: 'analytics-operations',
    name: 'Data Sheet',
    description: 'Interact with live operational data in a familiar spreadsheet interface.',
  },
  {
    id: 'vertex',
    href: '/vertex',
    icon: 'project',
    iconTone: '#22d3ee',
    category: 'analytics-operations',
    name: 'Graph Explorer',
    description: 'Explore object graphs and system diagrams.',
  },
  {
    id: 'map',
    href: '/geospatial',
    icon: 'view-grid',
    iconTone: '#4ade80',
    category: 'analytics-operations',
    name: 'Geo Map',
    description: 'Analyze geospatial and geotemporal data.',
  },

  // E. AI Platform
  {
    id: 'aip-logic',
    href: '/logic',
    icon: 'graph',
    iconTone: '#38bdf8',
    category: 'ai-platform',
    promoted: true,
    name: 'AI Logic',
    description: 'Author no-code Logic functions with inputs, blocks, outputs, and run previews.',
  },
  {
    id: 'aip-assist',
    href: '/ai/assist',
    icon: 'asterisk',
    iconTone: '#67e8f9',
    category: 'ai-platform',
    name: 'AI Assist',
    description: 'In-product AI helper for navigation, documentation, and guided actions.',
  },
  {
    id: 'aip-analyst',
    href: '/ai/analyst',
    icon: 'sparkles',
    iconTone: '#a78bfa',
    category: 'ai-platform',
    name: 'AI Analyst',
    description: 'Ask natural-language questions over the ontology with grounded answers and charts.',
  },
  {
    id: 'aip-threads',
    href: '/ai/threads',
    icon: 'sparkles',
    iconTone: '#60a5fa',
    category: 'ai-platform',
    name: 'AI Threads',
    description: 'Document-aware chat sessions with citation-backed responses.',
  },
  {
    id: 'aip-document-intelligence',
    href: '/ai/documents',
    icon: 'document',
    iconTone: '#facc15',
    category: 'ai-platform',
    name: 'Document AI',
    description: 'Extract structured data from enterprise documents and evaluate strategies.',
  },
  {
    id: 'aip-chatbot-studio',
    href: '/ai/chatbot-studio',
    icon: 'sparkles',
    iconTone: '#22d3ee',
    category: 'ai-platform',
    name: 'Chatbot Studio',
    description: 'Build LLM-powered chatbots grounded in your ontology and tools.',
  },
  {
    id: 'aip-evals',
    href: '/aip-evals',
    icon: 'badge-check',
    iconTone: '#34d399',
    category: 'ai-platform',
    name: 'AI Evals',
    description: 'Score and compare AI workflows with reproducible evaluations.',
  },
  {
    id: 'ai-fde',
    href: '/ai/operator',
    icon: 'sparkles',
    iconTone: '#f472b6',
    category: 'ai-platform',
    name: 'AI Operator',
    description: 'Agent that translates natural-language requests into platform operations.',
  },
  {
    id: 'model-catalog',
    href: '/model-catalog',
    icon: 'sparkles',
    iconTone: '#60a5fa',
    category: 'ai-platform',
    name: 'Model Catalog',
    description: 'Discover, evaluate, and select large language models with sandbox playgrounds.',
  },

  // F. Application Development
  {
    id: 'workshop',
    href: '/apps',
    icon: 'app',
    iconTone: '#a78bfa',
    category: 'app-development',
    promoted: true,
    name: 'Workshop',
    description: 'Build operational apps with widgets, templates, runtime previews, and publishing.',
  },
  {
    id: 'slate',
    href: '/slate',
    icon: 'document',
    iconTone: '#fb923c',
    category: 'app-development',
    name: 'Web App Studio',
    description: 'Drag-and-drop builder for custom-styled apps and public-facing dashboards.',
  },
  {
    id: 'pilot',
    href: '/pilot',
    icon: 'sparkles',
    iconTone: '#facc15',
    category: 'app-development',
    name: 'AI App Builder',
    description: 'Generate operational apps end-to-end from natural-language prompts.',
  },
  {
    id: 'custom-widgets',
    href: '/widgets',
    icon: 'cube',
    iconTone: '#22d3ee',
    category: 'app-development',
    name: 'Custom Widgets',
    description: 'Extend Workshop with bespoke frontend components and visualizations.',
  },
  {
    id: 'osdk-apps',
    href: '/osdk-apps',
    icon: 'app',
    iconTone: '#34d399',
    category: 'app-development',
    name: 'Ontology SDK Apps',
    description: 'Build fully customized React apps backed by ontology APIs and governance.',
  },
  {
    id: 'custom-endpoints',
    href: '/custom-endpoints',
    icon: 'link',
    iconTone: '#60a5fa',
    category: 'app-development',
    name: 'Custom APIs',
    description: 'Expose user-defined APIs with custom URL patterns and response shapes.',
  },
  {
    id: 'developer-console',
    href: '/developers',
    icon: 'code',
    iconTone: '#22d3ee',
    category: 'app-development',
    name: 'Developer Console',
    description: 'Manage OAuth clients, SDKs, hosted frontends, and application monitoring.',
  },
  {
    id: 'compute-modules',
    href: '/compute-modules',
    icon: 'cube',
    iconTone: '#facc15',
    category: 'app-development',
    name: 'Compute Modules',
    description: 'Run containerized, any-language workloads queryable from apps and pipelines.',
  },

  // G. Automation
  {
    id: 'foundry-rules',
    href: '/foundry-rules',
    icon: 'shield',
    iconTone: '#fb923c',
    category: 'automation',
    name: 'Operational Rules',
    description: 'Author rule-based automations, monitors, and triggers across the platform.',
  },
  {
    id: 'dynamic-scheduling',
    href: '/dynamic-scheduling',
    icon: 'history',
    iconTone: '#fbbf24',
    category: 'automation',
    name: 'Dynamic Schedules',
    description: 'Interactive scheduling with constraints, drag-and-drop, and recommendations.',
  },

  // H. Security & Governance
  {
    id: 'approvals',
    href: '/approvals',
    icon: 'shield',
    iconTone: '#f472b6',
    category: 'security-governance',
    name: 'Approvals',
    description: 'Request, review, and apply governed changes through approval workflows.',
  },
  {
    id: 'checkpoints',
    href: '/checkpoints',
    icon: 'shield-plus',
    iconTone: '#facc15',
    category: 'security-governance',
    name: 'Justification Checkpoints',
    description: 'Capture user justifications for sensitive interactions and audit them centrally.',
  },
  {
    id: 'cipher',
    href: '/cipher',
    icon: 'lock',
    iconTone: '#a78bfa',
    category: 'security-governance',
    name: 'Crypto Service',
    description: 'Manage encryption, decryption, and hashing operations with governed keys.',
  },
  {
    id: 'sensitive-data-scanner',
    href: '/sds',
    icon: 'eye',
    iconTone: '#fb923c',
    category: 'security-governance',
    name: 'Sensitive Data Scanner',
    description: 'Discover and protect sensitive patterns across datasets with automated actions.',
  },
  {
    id: 'data-lifetime',
    href: '/retention',
    icon: 'history',
    iconTone: '#22d3ee',
    category: 'security-governance',
    name: 'Retention Policies',
    description: 'Enforce lineage-aware retention and deletion of transactions and derivatives.',
  },

  // I. Administration
  {
    id: 'control-panel',
    href: '/control-panel',
    icon: 'settings',
    iconTone: '#60a5fa',
    category: 'administration',
    name: 'Control Panel',
    description: 'Manage critical platform operations for an enrollment or organization.',
  },
  {
    id: 'resource-management',
    href: '/control-panel/data-health',
    icon: 'pie-chart',
    iconTone: '#34d399',
    category: 'administration',
    name: 'Resource Management',
    description: 'Track and manage costs, budgets, resource queues, and usage limits.',
  },
  {
    id: 'upgrade-assistant',
    href: '/control-panel/streaming-profiles',
    icon: 'badge-check',
    iconTone: '#fbbf24',
    category: 'administration',
    name: 'Upgrade Assistant',
    description: 'Track important platform updates and changes affecting the platform.',
  },
  {
    id: 'enrollment-settings',
    href: '/control-panel/tenancy',
    icon: 'users',
    iconTone: '#a78bfa',
    category: 'administration',
    name: 'Enrollment Settings',
    description: 'Manage enrollment-wide tenancy, identity, and security defaults.',
  },
  {
    id: 'organization-settings',
    href: '/control-panel/users',
    icon: 'users',
    iconTone: '#60a5fa',
    category: 'administration',
    name: 'Organization Settings',
    description: 'Configure organization users, groups, and access defaults.',
  },
];

export function findLauncherApp(id: string): LauncherApp | undefined {
  return LAUNCHER_APPS.find((app) => app.id === id);
}
