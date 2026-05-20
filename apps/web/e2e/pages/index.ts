// Barrel export for all Page Objects. Import from this single entry-point in
// specs (`import { DatasetsListPage } from './pages';`) — keeps imports tidy
// and the surface area discoverable.

export * from './_base';

// Existing Page Objects (kept for backward compatibility with existing specs).
export { AppShellPage } from './AppShellPage';
export { LoginPage } from './LoginPage';
export { ProjectsPage } from './ProjectsPage';
export { SettingsPage } from './SettingsPage';
export { WorkshopRuntimePage } from './WorkshopRuntimePage';

// Workspace core.
export { HomePage } from './HomePage';
export { SearchPage } from './SearchPage';
export { NotificationsPage } from './NotificationsPage';
export { FavoritesPage } from './FavoritesPage';
export { RecentPage } from './RecentPage';

// Projects.
export { ProjectsListPage } from './ProjectsListPage';
export { ProjectDetailPage } from './ProjectDetailPage';
export { ProjectFolderPage } from './ProjectFolderPage';

// Datasets.
export { DatasetsListPage } from './DatasetsListPage';
export { DatasetUploadPage } from './DatasetUploadPage';
export { DatasetDetailPage } from './DatasetDetailPage';
export { DatasetBranchesPage } from './DatasetBranchesPage';
export { DatasetBranchDetailPage } from './DatasetBranchDetailPage';

// Tables & objects.
export { VirtualTablesPage } from './VirtualTablesPage';
export { VirtualTableDetailPage } from './VirtualTableDetailPage';
export { IcebergTablesPage } from './IcebergTablesPage';
export { IcebergTableDetailPage } from './IcebergTableDetailPage';
export { ObjectDatabasesPage } from './ObjectDatabasesPage';
export { ObjectExplorerPage } from './ObjectExplorerPage';
export { ObjectViewsPage } from './ObjectViewsPage';
export { ObjectMonitorsPage } from './ObjectMonitorsPage';
export { ObjectLinkTypesPage } from './ObjectLinkTypesPage';

// Pipelines / schedules / builds.
export { PipelinesPage } from './PipelinesPage';
export { PipelineNewPage } from './PipelineNewPage';
export { PipelineEditPage } from './PipelineEditPage';
export { LinterPage } from './LinterPage';
export { FoundryRulesPage } from './FoundryRulesPage';
export { NewSchedulePage } from './NewSchedulePage';
export { ScheduleDetailPage } from './ScheduleDetailPage';
export { BuildSchedulesPage } from './BuildSchedulesPage';
export { SweepPage } from './SweepPage';
export { BuildsPage } from './BuildsPage';
export { BuildDetailPage } from './BuildDetailPage';

// Ontology.
export { OntologyManagerPage } from './OntologyManagerPage';
export { BindingsWizardPage } from './BindingsWizardPage';
export { OntologyHomePage } from './OntologyHomePage';
export { CreateObjectTypePage } from './CreateObjectTypePage';
export { OntologyGraphPage } from './OntologyGraphPage';
export { ObjectSetsPage } from './ObjectSetsPage';
export { ObjectTypeDetailPage } from './ObjectTypeDetailPage';

// Apps / Workshop.
export { AppsPage } from './AppsPage';
export { WorkshopEditorPage } from './WorkshopEditorPage';
export { AppRuntimePage } from './AppRuntimePage';

// Data Connection.
export { DataConnectionPage } from './DataConnectionPage';
export { AgentsPage } from './AgentsPage';
export { EgressPoliciesPage } from './EgressPoliciesPage';
export { NewSourcePage } from './NewSourcePage';
export { NewStreamingSourcePage } from './NewStreamingSourcePage';
export { SourceDetailPage } from './SourceDetailPage';

// AI.
export { AiPage } from './AiPage';
export { AssistPage } from './AssistPage';
export { AnalystPage } from './AnalystPage';
export { ThreadsPage } from './ThreadsPage';
export { DocumentsPage } from './DocumentsPage';
export { ChatbotStudioPage } from './ChatbotStudioPage';
export { OperatorPage } from './OperatorPage';

// Functions & action types.
export { FunctionsPage } from './FunctionsPage';
export { ActionTypesPage } from './ActionTypesPage';
export { ActionTypeDetailPage } from './ActionTypeDetailPage';

// Lineage & visualization.
export { LineagePage } from './LineagePage';
export { QuiverPage } from './QuiverPage';
export { GeospatialPage } from './GeospatialPage';
export { ContourPage } from './ContourPage';
export { VertexPage } from './VertexPage';

// Publishing / notebooks / notepad.
export { SlatePage } from './SlatePage';
export { NotebooksListPage } from './NotebooksListPage';
export { NotebookDetailPage } from './NotebookDetailPage';
export { NotepadListPage } from './NotepadListPage';
export { NotepadDetailPage } from './NotepadDetailPage';

// Streaming & media.
export { StreamingPage } from './StreamingPage';
export { StreamingDetailPage } from './StreamingDetailPage';
export { MediaSetsPage } from './MediaSetsPage';
export { MediaSetDetailPage } from './MediaSetDetailPage';

// ML / AIP evals.
export { MlPage } from './MlPage';
export { AipEvalsPage } from './AipEvalsPage';

// Advanced.
export { MachineryPage } from './MachineryPage';
export { FusionPage } from './FusionPage';
export { LogicAuthoringPage } from './LogicAuthoringPage';
export { DynamicSchedulingPage } from './DynamicSchedulingPage';
export { InterfacesPage } from './InterfacesPage';
export { CodeReposPage } from './CodeReposPage';
export { InvestigatorPage } from './InvestigatorPage';
export { PeerManagerPage } from './PeerManagerPage';
export { CipherPage } from './CipherPage';
export { SensitiveDataScannerPage } from './SensitiveDataScannerPage';
export { RetentionPoliciesPage } from './RetentionPoliciesPage';

// Misc / admin top-level / developer hubs.
export { AuditPage } from './AuditPage';
export { ApplicationsPage } from './ApplicationsPage';
export { OsdkAppsPage } from './OsdkAppsPage';
export { CustomEndpointsPage } from './CustomEndpointsPage';
export { CheckpointsPage } from './CheckpointsPage';
export { CustomWidgetsPage } from './CustomWidgetsPage';
export { DevelopersPage } from './DevelopersPage';
export { PilotPage } from './PilotPage';
export { OntologyIndexingPage } from './OntologyIndexingPage';

// Control Panel (admin hub + 16 sub-pages — namespaced to avoid clashes with
// the user-facing `ProjectsPage` / `RetentionPoliciesPage` exports above).
export { ControlPanelPage } from './ControlPanelPage';
export * as ControlPanel from './control-panel';
