# OpenFoundry Frontend UI Flow Blueprint

Este documento define un mapa funcional del producto, inspirado en las capturas locales de Foundry y aterrizado sobre el frontend actual de `apps/web`. La intencion no es copiar pantalla por pantalla sin criterio, sino construir una especificacion navegable que permita codificar el frontend y despues conectar cada boton, modal, drawer y accion con el backend.

## Alcance

Fuentes analizadas:

- Capturas locales en `docs_original_palantir_foundry/foundry-docs`:
  - 7750 imagenes encontradas.
  - Se priorizaron capturas con UI de producto real frente a paginas puramente documentales.
- Router actual: `apps/web/src/router.tsx`.
- Componentes principales: `AppShell`, `Sidebar`, `Topbar`, `Tabs`, dashboards, datasets, pipelines, ontology, apps, projects, workspace, data connection, builds, workflows y settings.
- APIs actuales en `apps/web/src/lib/api`, especialmente `datasets.ts`, `pipelines.ts`, `ontology.ts`, `apps.ts`, `workspace.ts`, `data-connection.ts`, `workflows.ts`, `notebooks.ts` y `notepad.ts`.

Artefactos generados junto a este documento:

- `docs/frontend-ui-flow-map.mmd`: grafo Mermaid con los flujos de producto.
- `docs/frontend-interaction-matrix.json`: matriz estructurada de pantallas, interacciones y contratos frontend-backend.

## Lectura De Las Capturas

Las capturas relevantes de Foundry muestran varios patrones consistentes:

| Referencia | Uso en blueprint | Observaciones aplicables |
|---|---|---|
| `docs_original_palantir_foundry/foundry-docs/Analytics/Analytical results/Dashboards_assets/img_001.png` | Dashboard runtime | Panel lateral de parametros, barra de override, cards de charts en grilla, filtros que afectan varios boards. |
| `docs_original_palantir_foundry/foundry-docs/Analytics/Analytical results/Dashboards_assets/img_002.png` | Dashboard editor | Tres zonas: paleta/lista izquierda, canvas central editable, inspector derecho. Acciones: add tab, add section, add text, preview, publish. |
| `docs_original_palantir_foundry/foundry-docs/Data connectivity & integration/Applications/Dataset Preview/Overview_assets/img_001.png` | Dataset detail | Breadcrumb superior, tabs pegadas, panel de metadatos izquierdo, tabla dominante, acciones SQL preview, analyze, explore pipeline, build. |
| `docs_original_palantir_foundry/foundry-docs/Data connectivity & integration/Workflows/Building pipelines/Getting started/Create a dataset batch pipeline with Pipeline Builder_assets/img_001.png` | Pipeline builder | Sidebar oscura, toolbar superior densa, tabs Edit/Proposals/History, canvas grande, nodos conectados, targets drawer, save/propose/deploy. |
| `docs_original_palantir_foundry/foundry-docs/Use case development/Application building/Workshop/Used colors_assets/img_001.png` | Workshop/app builder | Editor visual con panel lateral, toolbar de secciones, canvas central, widgets, estado de version/autosave, preview/publish. |
| `docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Data Catalog_assets/img_001.png` | Projects/data catalog | Navegacion por portfolios, projects, files, shared, boton New, request data y tabla/lista de recursos. |
| `docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Use Project navigation panel_assets/img_001.png` | Project detail | Navegacion lateral dentro de un proyecto: cover page, files, autosaved, references, trash, usage, access graph. |

Reglas de producto extraidas:

- El shell global debe ser permanente: sidebar, topbar, breadcrumbs, branch, estado de build y acciones globales.
- La navegacion de primer nivel lleva a galerias o listados: projects, datasets, pipelines, apps, ontology, dashboards.
- Los detalles usan tabs para subventanas: preview/schema/files/history/quality, edit/proposals/history, overview/resources/memberships.
- Las acciones de configuracion compleja se abren en modal o drawer, no en paginas nuevas.
- Las acciones mutadoras deben tener estados `idle`, `loading`, `success`, `error`, `empty` y `permission_denied`.
- La UI debe anticipar permisos, ramas, auditoria y estados async desde el diseno.

## Modelo Mental Del "Figma Funcional"

El blueprint usa esta jerarquia:

| Nivel | Nombre | Ejemplo | Implementacion esperada |
|---|---|---|---|
| L0 | Shell | Sidebar, topbar, branch, command/search | `AppShell`, `Sidebar`, `Topbar`, command palette futura |
| L1 | Galeria/listado | `/datasets`, `/pipelines`, `/apps`, `/projects` | Resource table, filtros, bulk actions |
| L2 | Detalle | `/datasets/:id`, `/projects/:projectId`, `/dashboards/:id` | Detail page layout con tabs y panel lateral |
| L3 | Subvista | Preview, schema, files, runs, config | `TabbedWorkspace` |
| L4 | Overlay | modal create, drawer inspector, popover actions | `Modal`, `Drawer`, `ContextMenu`, `InspectorPanel` |
| L5 | Accion backend | save, run, publish, validate, share | Mutation hook con audit, permissions y feedback |

## Inventario De Pantallas

Estado:

- Existe: ruta y vista presentes.
- Parcial: ruta existe pero falta estructura Foundry-like, overlays o contrato completo.
- Falta: deberia existir como pantalla/subpantalla para cerrar el flujo.

El frontend real tiene 88 rutas (verificadas leyendo `apps/web/src/router.tsx`). El inventario abajo cubre las 88, con ID estable, ruta exacta, área, screenshot de referencia cuando aplica, componentes principales (de los que ya existen en `apps/web/src/lib/components/**` o `apps/web/src/routes/**` se marca con `~`; los que faltan crear se marcan con `(target)`), estado y prioridad.

Estado:

- Existe: ruta y vista presentes y funcionales.
- Parcial: ruta existe pero falta estructura Foundry-like, overlays, contrato completo o el shell padre no impone los patrones consistentes (sticky header, tabs, breadcrumbs, save/share contextual, action registry).
- Falta: deberia existir como pantalla/subpantalla para cerrar el flujo.

Importante sobre componentes reutilizables: hoy NO existe un componente compartido `ResourceTable`. Las tablas de `datasets`, `pipelines`, `apps`, `projects`, `data-connection`, `ontology`, `marketplace`, `streaming`, etc. estan implementadas localmente, en general usando markup ad-hoc o utilitarios de `lib/components/ui/`. El blueprint asume un futuro `ResourceTable` extraido y normalizado; mientras no exista, en la columna "Componentes principales" se anota como `(target)`.

| ID | Pantalla | Ruta actual | Area | Referencia visual | Componentes principales | Estado | Prioridad |
|---|---|---|---|---|---|---|---|
| HOME-001 | Workspace home | `/` | core | Compass/Data Catalog | `AppShell` ~, `Sidebar` ~, `Topbar` ~, `ResourceTable (target)`, `ActivityPanel (target)`, `QuickActions (target)` | Parcial | P0 |
| SEARCH-001 | Global search page | `/search` | core | Compass Quicksearch | `SearchPage` ~, `CommandPalette (target)`, `SearchResults (target)`, `ObjectCard (target)` | Parcial | P0 |
| AUTH-001 | Auth login | `/auth/login` | security | identity docs | `AuthLayout` ~, `LoginPage` ~ | Existe | P0 |
| AUTH-002 | Auth register | `/auth/register` | security | identity docs | `RegisterPage` ~ | Existe | P1 |
| AUTH-003 | Auth MFA | `/auth/mfa` | security | MFA docs | `MfaPage` ~ | Existe | P0 |
| AUTH-004 | Auth callback | `/auth/callback` | security | SSO callback | `CallbackPage` ~ | Existe | P1 |
| PROJECT-001 | Projects gallery | `/projects` | projects | Compass Data Catalog | `ProjectsListPage` ~, `Tabs` ~, `CreateProjectModal (target)` | Parcial | P0 |
| PROJECT-002 | Project detail | `/projects/:projectId` | projects | Compass project nav | `ProjectDetailPage` ~, `FolderTree` ~, `ResourceDetailsPanel` ~, `ShareDialog` ~, `ResourcePermissionsDrawer` ~ | Existe | P0 |
| PROJECT-003 | Folder detail | `/projects/:projectId/:folderId` | projects | Compass files | `ProjectFolderPage` ~, `BulkActionsToolbar (target)` | Existe | P1 |
| PROJECT-004 | Resource permissions drawer | overlay | projects/security | Checking permissions | `Drawer` ~, `PrincipalPicker` ~, `AccessGraph` ~, `ResourcePermissionsDrawer` ~ | Existe | P0 |
| DATASET-001 | Datasets catalog | `/datasets` | datasets | Dataset Preview, Data Catalog | `DatasetsListPage` ~, `Facets (target)`, `UploadModal (target)` | Existe | P0 |
| DATASET-002 | Dataset detail | `/datasets/:id` | datasets | Dataset Preview | `DatasetDetailPage` ~, `Tabs` ~, `VirtualizedPreviewTable` ~, `MetadataPanel (target)` | Existe | P0 |
| DATASET-003 | Dataset upload | `/datasets/upload` | datasets | Compass manual upload | `DatasetUploadPage` ~, `FileUpload (target)`, `SchemaInferencePanel (target)` | Existe | P1 |
| DATASET-004 | Dataset branches | `/datasets/:id/branches` | datasets/branching | Global branching | `DatasetBranchesPage` ~, `BranchGraph (target)`, `CreateBranchDialog (target)` | Existe | P1 |
| DATASET-005 | Dataset branch detail | `/datasets/:id/branches/:branch` | datasets/branching | Global branching | `DatasetBranchDetailPage` ~, `CompareTab (target)` | Existe | P2 |
| DATASET-006 | Quality rules drawer | overlay on dataset detail | datasets/quality | Dashboard params/details | `QualityDashboard (target)`, `RuleEditorDrawer (target)` | Parcial | P1 |
| PIPE-001 | Pipelines gallery | `/pipelines` | pipelines | Pipeline Builder | `PipelinesPage` ~, `CreatePipelineModal (target)`, `RunHistory (target)` | Existe | P0 |
| PIPE-002 | Pipeline create | `/pipelines/new` | pipelines | Pipeline Builder setup | `PipelineNewPage` ~, `BuildSettings (target)`, `ScheduleConfig (target)` | Existe | P0 |
| PIPE-003 | Pipeline builder | `/pipelines/:id/edit` | pipelines | Pipeline Builder | `PipelineEditPage` ~, `PipelineCanvas` ~, `NodeConfig` ~, `NodePreviewPanel (target)` | Parcial | P0 |
| PIPE-004 | Node inspector drawer | overlay on builder | pipelines | Pipeline Builder node detail | `Drawer (target)`, `NodeConfig` ~, `TransformEditor (target)` | Parcial | P0 |
| PIPE-005 | Pipeline run detail | overlay/tab on `/pipelines/:id/edit` + `/pipelines/:id/runs/:runId` | pipelines/builds | Build detail/logs | `RunLogs` ~, `LiveLogViewer` ~, `LineageView` ~, `PipelineRunDetailDrawer` ~ | Existe | P1 |
| SCHED-001 | Schedule detail | `/schedules/:rid` | operations | schedule management | `ScheduleDetailPage` ~ | Existe | P1 |
| SCHED-002 | Build schedules | `/build-schedules` | operations | schedule management | `BuildSchedulesPage` ~, `ScheduleConfig (target)`, `ScheduleDiff (target)` | Existe | P1 |
| SCHED-003 | Sweep page | `/build-schedules/sweep` | operations | schedule sweep | `SweepPage` ~ | Existe | P2 |
| BUILD-001 | Builds list | `/builds` | operations | Pipeline run history | `BuildsPage` ~, `StateBadge (target)`, `AbortAction (target)` | Existe | P1 |
| BUILD-002 | Build detail | `/builds/:rid` | operations | run logs | `BuildDetailPage` ~, `RunLogs` ~, `ArtifactsPanel (target)` | Existe | P1 |
| DASH-001 | Dashboard gallery | `/dashboards` | analytics | Dashboard editor left list | `DashboardsListPage` ~, `CreateDashboardModal (target)`, `TemplateGallery (target)` | Existe | P0 |
| DASH-002 | Dashboard runtime/editor | `/dashboards/:id` | analytics | Dashboard runtime/editor | `DashboardDetailPage` ~, `DashboardGrid` ~, `WidgetConfig` ~, `FilterBar (target)` | Parcial | P0 |
| DASH-003 | Widget config drawer | overlay on dashboard | analytics | Editor right inspector | `WidgetConfig` ~, `QueryPicker (target)`, `ChartSettings (target)` | Parcial | P0 |
| NOTEBOOK-001 | Notebooks gallery | `/notebooks` | developer | JupyterLab/code workspaces | `NotebooksListPage` ~, `KernelSelector (target)`, `WorkspaceFiles (target)` | Existe | P2 |
| NOTEBOOK-002 | Notebook detail | `/notebooks/:id` | developer | JupyterLab/code workspaces | `NotebookDetailPage` ~, `CellEditor (target)`, `CellOutput (target)` | Existe | P2 |
| NOTEPAD-001 | Notepad gallery | `/notepad` | docs/analysis | Notepad doc editor | `NotepadListPage` ~, `Presence (target)` | Existe | P2 |
| NOTEPAD-002 | Notepad editor | `/notepad/:id` | docs/analysis | Notepad document editor | `NotepadDetailPage` ~, `MonacoEditor` ~, `WidgetEmbeds (target)` | Existe | P2 |
| APP-001 | Apps/Workshop gallery+builder | `/apps` (`?selected=:id`) | apps | Workshop, Developer Console | `AppsPage` ~, `AppPagesEditor` ~, `WidgetCatalog (target)`, `ThemePanel (target)` | Parcial | P0 |
| APP-002 | App runtime | `/apps/runtime/:slug` | apps | Workshop preview | `AppRuntimePage` ~, `AppRenderer` ~, `AppWidgetRenderer (target)` | Existe | P1 |
| APP-003 | Publish app modal | overlay | apps | Workshop publish | `Modal (target)`, `VersionNotes (target)`, `PermissionSummary (target)` | Parcial | P0 |
| DATA-CONN-001 | Data connection home | `/data-connection` | connectivity | Data source/product admin | `DataConnectionPage` ~, `RemoteCatalogBrowser` ~, `AutoRegistrationCard (target)` | Existe | P0 |
| DATA-CONN-002 | New source wizard | `/data-connection/new` | connectivity | connector wizard | `NewSourcePage` ~, `CredentialsPanel (target)`, `TestConnection (target)` | Existe | P0 |
| DATA-CONN-003 | New streaming source | `/data-connection/new/streaming` | connectivity | streaming connector | `NewStreamingSourcePage` ~ | Existe | P1 |
| DATA-CONN-004 | Source detail | `/data-connection/sources/:id` | connectivity | source detail | `SourceDetailPage` ~, `VirtualTablesTab (target)`, `BulkRegisterDialog (target)` | Existe | P1 |
| DATA-CONN-005 | Agents | `/data-connection/agents` | connectivity | agent runtime | `AgentsPage` ~ | Existe | P2 |
| DATA-CONN-006 | Egress policies | `/data-connection/egress-policies` | connectivity | egress | `EgressPoliciesPage` ~ | Existe | P1 |
| ONT-001 | Ontology home | `/ontology` | ontology | Object table/Object explorer | `OntologyHomePage` ~, `OntologySearch` ~, `ObjectExplorer` ~ | Existe | P0 |
| ONT-002 | Object type create/list | `/ontology/types` | ontology | Ontology manager | `CreateObjectTypePage` ~, `TypeEditor (target)` | Existe | P0 |
| ONT-003 | Object type detail | `/ontology/:id` | ontology | Object Table | `ObjectTypeDetailPage` ~, `ObjectExplorer` ~, `PropertyPanel (target)`, `ActionsButtonGroup (target)` | Existe | P0 |
| ONT-004 | Ontology graph | `/ontology/graph` | ontology | graph/cytoscape | `OntologyGraphPage` ~, `CytoscapeCanvas` ~ | Existe | P1 |
| ONT-005 | Object sets | `/ontology/object-sets` | ontology | Object sets docs | `ObjectSetsPage` ~, `ObjectSetFilterBuilder (target)` | Existe | P1 |
| ONT-006 | Object detail drawer | overlay | ontology | Object table side panel | `ObjectDetailDrawer`, `Drawer`, `ObjectCard`, `ActionExecutor`, `InlineEditCell`, `ObjectTimeline` | Existe | P0 |
| ONT-007 | Ontology design | `/ontology-design` | ontology-admin | Ontology design | `OntologyDesignPage` ~ | Existe | P1 |
| ONT-008 | Ontology indexing | `/ontology-indexing` | ontology-admin | Indexing | `OntologyIndexingPage` ~ | Existe | P2 |
| ONT-009 | Ontologies registry | `/ontologies` | ontology-admin | multi-ontology | `OntologiesPage` ~ | Existe | P1 |
| ONT-010 | Object explorer (legacy/global) | `/object-explorer` | ontology | Object explorer | `ObjectExplorerPage` ~ | Existe | P1 |
| ONT-011 | Object views | `/object-views` | ontology | Object views | `ObjectViewsPage` ~ | Existe | P2 |
| ONT-012 | Object monitors | `/object-monitors` | ontology/automation | Monitors | `ObjectMonitorsPage` ~ | Existe | P2 |
| ONT-013 | Object link types | `/object-link-types` | ontology | Link types | `ObjectLinkTypesPage` ~ | Existe | P2 |
| ONT-014 | Object databases | `/object-databases` | ontology | OSv2 databases | `ObjectDatabasesPage` ~ | Existe | P2 |
| ONT-015 | Action types | `/action-types` | ontology | Action types | `ActionTypesPage` ~ | Existe | P1 |
| ONT-016 | Functions | `/functions` | ontology/dev | Foundry functions | `FunctionsPage` ~ | Existe | P1 |
| ONT-017 | Foundry rules | `/foundry-rules` | ontology/governance | Rules engine | `FoundryRulesPage` ~ | Existe | P2 |
| ONT-018 | Interfaces | `/interfaces` | ontology | Interfaces | `InterfacesPage` ~ | Existe | P1 |
| ONTM-001 | Ontology manager | `/ontology-manager` | ontology-admin | Ontology manager | `OntologyManagerPage` ~ | Existe | P0 |
| ONTM-002 | Bindings wizard | `/ontology-manager/bindings` | ontology-admin | Dataset binding wizard | `BindingsWizardPage` ~, `SchemaMapper (target)` | Existe | P1 |
| LINEAGE-001 | Lineage graph | `/lineage` | data/operations | pipeline lineage | `LineagePage` ~, `LineageView (target)`, `GraphView (target)` | Existe | P1 |
| WF-001 | Workflows | `/workflows` | automation | approvals/workflows | `WorkflowsPage` ~, `WorkflowBuilder (target)`, `ApprovalList (target)` | Existe | P1 |
| AUDIT-001 | Audit | `/audit` | security/governance | Audit | `AuditPage` ~ | Existe | P1 |
| QUERIES-001 | Queries | `/queries` | analytics | Saved queries | `QueriesPage` ~ | Existe | P1 |
| REPORTS-001 | Reports | `/reports` | analytics | Reports | `ReportsPage` ~ | Existe | P2 |
| MARKET-001 | Marketplace | `/marketplace` | product delivery | Marketplace listings | `MarketplacePage` ~, `MarketplaceBrowser (target)` | Existe | P2 |
| MARKET-002 | Marketplace product | `/marketplace/:id` | product delivery | Marketplace product | `MarketplaceProductPage` ~, `ListingDetail (target)`, `InstallDialog (target)` | Existe | P2 |
| STREAM-001 | Streaming list | `/streaming` | streaming | Stream catalogs | `StreamingPage` ~ | Existe | P1 |
| STREAM-002 | Streaming detail | `/streaming/:id` | streaming | Stream detail | `StreamingDetailPage` ~ | Existe | P1 |
| VT-001 | Virtual tables | `/virtual-tables` | connectivity | Virtual tables | `VirtualTablesPage` ~ | Existe | P1 |
| VT-002 | Virtual table detail | `/virtual-tables/:rid` | connectivity | Virtual table detail | `VirtualTableDetailPage` ~ | Existe | P2 |
| ICE-001 | Iceberg tables | `/iceberg-tables` | connectivity | Iceberg tables | `IcebergTablesPage` ~ | Existe | P1 |
| ICE-002 | Iceberg table detail | `/iceberg-tables/:id` | connectivity | Iceberg table detail | `IcebergTableDetailPage` ~ | Existe | P2 |
| MEDIA-001 | Media sets | `/media-sets` | data/media | Media set docs | `MediaSetsPage` ~ | Existe | P2 |
| MEDIA-002 | Media set detail | `/media-sets/:rid` | data/media | Media set detail | `MediaSetDetailPage` ~ | Existe | P2 |
| AI-001 | AI platform overview | `/ai` | ai | AIP overview | `AiPage` ~ | Existe | P1 |
| ML-001 | ML platform | `/ml` | ml | Model Studio | `MlPage` ~ | Existe | P1 |
| FUSION-001 | Fusion | `/fusion` | data fusion | Fusion app | `FusionPage` ~ | Existe | P2 |
| NEXUS-001 | Nexus | `/nexus` | federation | Nexus | `NexusPage` ~ | Existe | P2 |
| CONTOUR-001 | Contour | `/contour` | analytics | Contour | `ContourPage` ~ | Existe | P2 |
| QUIVER-001 | Quiver | `/quiver` | analytics | Quiver | `QuiverPage` ~ | Existe | P2 |
| GEO-001 | Geospatial | `/geospatial` | analytics/geo | Geospatial | `GeospatialPage` ~ | Existe | P2 |
| VERTEX-001 | Vertex | `/vertex` | graph | Vertex | `VertexPage` ~ | Existe | P2 |
| MACH-001 | Machinery | `/machinery` | automation | Machinery | `MachineryPage` ~ | Existe | P2 |
| GBR-001 | Global branching | `/global-branching` | branching | Global branching | `GlobalBranchingPage` ~ | Existe | P1 |
| DSCH-001 | Dynamic scheduling | `/dynamic-scheduling` | operations | Dynamic schedules | `DynamicSchedulingPage` ~ | Existe | P2 |
| DEV-001 | Developers | `/developers` | developer toolchain | Developer Console | `DevelopersPage` ~, `ApiExplorer (target)`, `SdkToolkit (target)` | Existe | P2 |
| DEV-002 | Code repos | `/code-repos` | developer toolchain | Code repositories | `CodeReposPage` ~ | Existe | P1 |
| SETTINGS-001 | Settings | `/settings` | security/admin | security settings | `SettingsPage` ~, `UsersSection (target)`, `RolesSection (target)`, `PoliciesSection (target)`, `ApiKeysSection (target)` | Existe | P0 |
| CTRL-001 | Control panel | `/control-panel` | admin | platform control | `ControlPanelPage` ~ | Existe | P1 |
| CTRL-002 | Streaming profiles | `/control-panel/streaming-profiles` | admin/streaming | streaming profiles | `StreamingProfilesPage` ~ | Existe | P2 |
| CTRL-003 | Data health | `/control-panel/data-health` | observability | Data Health dashboard | `DataHealthPage` ~ | Existe | P1 |
| DEMO-001 | Charts demo | `/charts-demo` | dev/demo | n/a | `ChartsDemoPage` ~ | Existe | P3 |
| DEMO-002 | Monaco demo | `/monaco-demo` | dev/demo | n/a | `MonacoDemoPage` ~ | Existe | P3 |
| DEMO-003 | MapLibre demo | `/maplibre-demo` | dev/demo | n/a | `MapLibreDemoPage` ~ | Existe | P3 |
| DEMO-004 | Cytoscape demo | `/cytoscape-demo` | dev/demo | n/a | `CytoscapeDemoPage` ~ | Existe | P3 |
| 404-001 | Not found | `/404` | core | n/a | `NotFound` ~ | Existe | P3 |

### Componentes Existentes Hoy

Verificado contra `apps/web/src/lib/components/**`:

- Shell y layout: `AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `PageHeader.tsx`, `AuthLayout.tsx`, `Tabs.tsx`, `Pagination.tsx`, `LoadingState.tsx`, `ErrorBanner.tsx`, `Toaster.tsx`, `ConfirmDialog.tsx`, `MonacoEditor.tsx`, `JsonEditor.tsx`, `EChartCanvas.tsx`, `MapLibreCanvas.tsx`, `CytoscapeCanvas.tsx`.
- Dominio: 28 subcarpetas con 188 componentes (ai, analytics, app-builder, apps, audit, builds, code-repo, dashboard, data, data-connection, dataset, developer, fusion, iceberg, layout, lineage, map, marketplace, nexus, notebook, notepad, ontology, pipeline, quiver, report, streaming, ui, workspace).
- Anclas verificadas: `PipelineCanvas`, `RunLogs`, `NodeConfig`, `DashboardGrid`, `WidgetConfig`, `ObjectExplorer`, `OntologySearch`, `AppPagesEditor`, `AppRenderer`, `RemoteCatalogBrowser`.

### Componentes Que El Blueprint Asume Como Target Y Aun No Existen

- `ResourceTable` compartido (hoy cada pantalla implementa su propia tabla).
- `CommandPalette` global accionable desde `cmd+k`.
- `Modal` primitivo consistente con el lenguaje Foundry (hoy hay `ConfirmDialog` y `Drawer`).
- `PermissionGate`, `AsyncActionButton`, `BackendActionFeedback`, `ActionMenu`.
- `BranchSwitcher` global que aplique al recurso activo.
- `MetadataPanel`, `BulkActionsToolbar`, `Facets`.
- `LineageView` como componente reutilizable (AccessGraph ya existe para PROJECT-004).

## Mapa De Navegacion Global

Punto de partida: `/` debe funcionar como home operativo. Desde ahi:

| Seccion home | Click | Tipo | Destino | Backend |
|---|---|---|---|---|
| Projects & files | row/card | Navegacion | `/projects` | `GET /ontology/projects`, `GET /workspace/...` |
| Datasets | row/card | Navegacion | `/datasets` | `GET /datasets` |
| Pipelines | row/card | Navegacion | `/pipelines` | `GET /pipelines` |
| Dashboards | row/card | Navegacion | `/dashboards` | local store hoy, futuro `GET /dashboards` |
| Workshop/apps | row/card | Navegacion | `/apps` | `GET /apps`, `GET /apps/templates` |
| Ontology | row/card | Navegacion | `/ontology` o `/ontology-manager` | `GET /ontology/types`, `GET /ontology/projects` |
| Search | topbar/sidebar | Command palette o pagina | `/search` | `POST /ontology/search`, futuro global search |
| Branch selector | topbar | Popover | branch switcher | branch APIs por dominio |
| Share | topbar | Modal/drawer | share current resource | `POST /workspace/resources/:kind/:id/share` |
| Save | topbar | Backend action contextual | recurso actual | endpoint contextual |

Regla de navegacion:

- Page navigation: cambia `route`.
- Tab navigation: cambia subvista local y puede disparar `GET`.
- Modal: creacion, confirmacion, publish, share, upload.
- Drawer: configuracion, detalles, permisos, node inspector, object detail.
- Popover: menus de accion, branch selector, row actions.
- Backend action: save/run/validate/deploy/publish/build/sync/share/delete.

## Flujos Tipo Figma/FigJam

El grafo completo esta en `docs/frontend-ui-flow-map.mmd`. Resumen:

```mermaid
flowchart LR
  Home["/ Workspace home"] --> Projects["/projects"]
  Home --> Datasets["/datasets"]
  Home --> Pipelines["/pipelines"]
  Home --> Dashboards["/dashboards"]
  Home --> Apps["/apps"]
  Home --> Ontology["/ontology"]

  Datasets --> DatasetDetail["/datasets/:id"]
  DatasetDetail --> DatasetPreview["tab: preview"]
  DatasetDetail --> DatasetSchema["tab: schema"]
  DatasetDetail --> DatasetQuality["tab: quality"]
  DatasetDetail --> DatasetActions["actions menu"]
  DatasetActions --> BuildDataset["backend: build"]
  DatasetActions --> ExplorePipeline["navigate: pipeline lineage"]

  Pipelines --> PipelineBuilder["/pipelines/:id/edit"]
  PipelineBuilder --> NodeDrawer["drawer: node config"]
  PipelineBuilder --> Validate["backend: validate"]
  PipelineBuilder --> Run["backend: run"]
  PipelineBuilder --> Deploy["backend: deploy/propose"]

  Apps --> AppBuilder["builder/editor"]
  AppBuilder --> WidgetConfig["drawer: widget config"]
  AppBuilder --> PublishModal["modal: publish"]
  PublishModal --> AppRuntime["/apps/runtime/:slug"]
```

### Dashboard Principal A Apps

1. Usuario entra a `/`.
2. Click en `Workshop`.
3. Navega a `/apps`.
4. Selecciona app existente o `New app`.
5. Si selecciona app: carga definicion y abre editor.
6. Click en `Pages`: cambia tab.
7. Click en widget: abre drawer de configuracion.
8. Click en `Publish`: abre modal de version.
9. Confirmar publish: `POST /apps/:appId/publish`.
10. Click en runtime: navega a `/apps/runtime/:slug`.

### Datasets

1. `/datasets` lista datasets con filtros, facetas y acciones bulk.
2. Click en row: `/datasets/:id`.
3. Tab `Preview`: `GET /datasets/:id/preview`.
4. Tab `Schema`: `GET /datasets/:id/schema`.
5. Tab `Files`: `GET /datasets/:id/files`.
6. Tab `Transactions`: `GET /datasets/:id/transactions`.
7. Tab `Quality`: `GET /datasets/:id/quality`.
8. Accion `Build`: crea build o transaccion, backend async.
9. Accion `Explore pipeline`: navega a pipeline/lineage asociado.
10. Accion `Branches`: `/datasets/:id/branches`.

### Pipelines

1. `/pipelines` lista pipelines y runs recientes.
2. `New pipeline`: `/pipelines/new` o modal create.
3. Guardar creacion: `POST /pipelines`, despues `/pipelines/:id/edit`.
4. En builder, click en nodo: abre drawer `NodeConfig`.
5. Add dataset/transform: modifica DAG local.
6. Validate: `POST /pipelines/:id/_validate`.
7. Save: `PUT /pipelines/:id`.
8. Run now: `POST /pipelines/:id/runs`.
9. History: `GET /pipelines/:id/runs`.
10. Run detail futuro: `/pipelines/:id/runs/:runId` o drawer.

### Ontology

1. `/ontology` muestra busqueda y tipos.
2. Click en object type: `/ontology/:id`.
3. Tab object table/list: `GET /ontology/types/:id/objects`.
4. Click row object: abre drawer object detail.
5. Click action: abre modal/action drawer.
6. Execute action: `POST /ontology/actions/:id/execute`.
7. Inline edit: `POST /ontology/types/:typeId/objects/_inline-edit`.
8. Properties: usar `PropertyPanel`.
9. Links: usar `LinkEditor`.
10. Timeline: `GET /ontology/types/:typeId/objects/:objectId/revisions`.

### Workshop/Apps

1. `/apps` muestra galeria, templates y app seleccionada.
2. `New app`: crea draft local o `POST /apps`.
3. `From template`: `POST /apps/from-template`.
4. Tab `Pages`: editor visual.
5. Click widget: drawer widget settings.
6. Theme: settings de color/densidad.
7. Slate import/export: `GET/POST /apps/:id/slate-package`.
8. Publish: modal, `POST /apps/:id/publish`.
9. Runtime: `GET /apps/public/:slug`.

### Projects/Files

1. `/projects` muestra Projects, Shared with me y Trash.
2. New project: modal, `POST /ontology/projects`.
3. Project row: `/projects/:projectId`.
4. Folder row: `/projects/:projectId/:folderId`.
5. Resource row: abre details drawer.
6. Share: modal, `POST /workspace/resources/:kind/:id/share`.
7. Move: modal, `POST /workspace/resources/:kind/:id/move`.
8. Rename: modal, `POST /workspace/resources/:kind/:id/rename`.
9. Delete: confirmation, `DELETE /workspace/resources/:kind/:id`.
10. Permissions: drawer, actual `GET/POST /workspace/resources/:kind/:id/shares` y `DELETE /workspace/shares/:shareId`; futuro endpoint de permisos efectivos dedicado.

## Matriz De Interacciones

La fuente estructurada esta en `docs/frontend-interaction-matrix.json`. Debe tratarse como contrato de producto. Cada interaccion define:

- `origin`: pantalla origen.
- `element`: elemento clicable.
- `type`: `navigation`, `tab`, `modal`, `drawer`, `popover`, `backend_action`.
- `destination`: route, overlay o endpoint logico.
- `state`: comportamiento esperado.
- `backend`: endpoint actual o propuesto.
- `permissions`: permiso funcional.
- `uiStates`: estados de carga, exito, vacio y error.

## Especificacion De Componentes Reutilizables

### Shell

Responsabilidad:

- Mantener navegacion global, topbar, breadcrumbs, branch, estado de build y usuario.
- Exponer contexto de recurso actual para `Share`, `Save`, `Favorite`, `Branch`.

Props sugeridas:

```ts
interface ShellContext {
  resource?: { kind: string; id: string; name: string };
  branch?: { name: string; canSwitch: boolean };
  dirty?: boolean;
  buildStatus?: { running: number; passed: number; failed: number };
}
```

Estados:

- `resource_unknown`
- `dirty`
- `saving`
- `permission_denied`
- `offline_or_backend_unavailable`

### Sidebar

Responsabilidad:

- Agrupar secciones Core, Apps, Ontology, Platform, Projects & files.
- Mostrar ruta activa, acceso a command/search, lenguaje, track/workspace.

Acciones:

- Navegacion simple.
- `View all` por grupo.
- Futuro: collapse/pin.

### Topbar

Responsabilidad:

- Breadcrumb contextual.
- Menus File/Help.
- Branch switcher.
- Undo/redo contextual.
- Save/share/publish contextual.

Cada boton debe resolver su accion desde `ScreenActionRegistry`, no desde hardcode local.

### Resource Table

Uso:

- Projects, datasets, pipelines, apps, builds, ontology resources.

Capacidades:

- Search, facets, sort, pagination.
- Row click.
- Row action menu.
- Bulk selection.
- Empty/loading/error.

### Preview Table

Uso:

- Dataset preview, virtual tables, query results, object tables.

Capacidades:

- Sticky header.
- Row index.
- Column type row.
- Column search.
- Transaction/version selector.
- Virtualization.
- Cell drawer para valores complejos.

### Config Panel

Uso:

- Dashboard widget config, pipeline node config, app widget config, dataset quality rule.

Patron:

- Drawer derecho para editar propiedades.
- Footer con Cancel/Apply/Save.
- Validacion inline.
- Preview si existe.

### Modal

Uso:

- Create, delete confirmation, publish, share, upload, move, rename.

Debe incluir:

- `title`, `description`, primary/secondary actions.
- `busy`, `error`, `permission_denied`.
- confirmacion explicita en acciones destructivas.

### Drawer

Uso:

- Resource details, object detail, node inspector, permissions, lineage impact.

Debe incluir:

- Header con recurso.
- Tabs internas.
- Anchor a ruta opcional.
- Modo read-only si faltan permisos.

### Tabbed Workspace

Uso:

- Dataset detail, pipeline builder, dashboard editor, project detail, ontology type detail.

Reglas:

- Tabs cambian subvista sin perder contexto.
- Si una tab carga datos, debe cachear resultado y permitir refresh.
- Tab activa puede sincronizarse con query param si interesa compartir links.

### Pipeline Canvas

Uso:

- Builder DAG.

Capacidades:

- Node palette.
- Node inspector drawer.
- Edge create/delete.
- Validate.
- Save.
- Run.
- Deploy/propose.
- Preview node output.
- History/proposals.

### Dashboard Widget

Uso:

- Runtime y editor.

Capacidades:

- Chart, table, KPI, text, filter/parameter.
- Refresh individual.
- Edit/duplicate/delete en edit mode.
- Query template con parametros.
- Error per-widget.

### Gallery/Card List

Uso:

- Apps templates, marketplace, dashboards gallery.

Reglas:

- Cards solo para items repetidos.
- Debe tener lista compacta alternativa si el usuario necesita escaneo rapido.

### Detail Page Layout

Estructura:

- Header compacto.
- Action toolbar.
- Main content con tabs.
- Right/left metadata panel cuando el screenshot Foundry lo pide.
- Overlay registry para drawers/modals.

## Contrato Frontend-Backend Futuro

### Datasets

Endpoints actuales:

- `GET /datasets`
- `POST /datasets`
- `GET /datasets/:id`
- `PATCH /datasets/:id`
- `DELETE /datasets/:id`
- `GET /datasets/:id/preview`
- `GET /datasets/:id/schema`
- `GET /datasets/:id/files`
- `GET /datasets/:id/transactions`
- `GET /datasets/:id/versions`
- `GET /datasets/:id/quality`
- `POST /datasets/:id/quality/profile`
- `GET/POST /datasets/:id/branches`

DTO minimo:

```ts
interface DatasetResource {
  id: string;
  name: string;
  description: string;
  format: string;
  row_count: number;
  size_bytes: number;
  active_branch: string;
  current_version: number;
  tags: string[];
  permissions?: ResourcePermissions;
}
```

Faltantes recomendados:

- `POST /datasets/:id/builds`
- `GET /datasets/:id/lineage`
- `GET /datasets/:id/permissions`
- `PATCH /datasets/:id/tags`

### Pipelines

Endpoints actuales:

- `GET /pipelines`
- `POST /pipelines`
- `GET /pipelines/:id`
- `PUT /pipelines/:id`
- `DELETE /pipelines/:id`
- `POST /pipelines/_validate`
- `POST /pipelines/:id/_validate`
- `POST /pipelines/:id/runs`
- `GET /pipelines/:id/runs`
- `POST /pipelines/:id/runs/:runId/retry`
- `POST /pipelines/_compile`
- `POST /pipelines/_prune`

Faltantes recomendados:

- `POST /pipelines/:id/proposals`
- `POST /pipelines/:id/deployments`
- `GET /pipelines/:id/proposals`
- `GET /pipelines/:id/runs/:runId/logs/stream`
- `GET /pipelines/:id/nodes/:nodeId/preview`

Eventos:

- `pipeline.run.started`
- `pipeline.run.node_updated`
- `pipeline.run.completed`
- `pipeline.validation.updated`

### Dashboards

Estado actual:

- Gran parte del dashboard usa store local.

Endpoints recomendados:

- `GET /dashboards`
- `POST /dashboards`
- `GET /dashboards/:id`
- `PATCH /dashboards/:id`
- `DELETE /dashboards/:id`
- `POST /dashboards/:id/widgets`
- `PATCH /dashboards/:id/widgets/:widgetId`
- `DELETE /dashboards/:id/widgets/:widgetId`
- `POST /dashboards/:id/publish`
- `POST /dashboards/:id/share`
- `POST /queries/execute` para widgets.

DTO minimo:

```ts
interface DashboardDefinitionDto {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidgetDto[];
  filters: DashboardFilterDto[];
  layout: { density: "default" | "compact" | "stretched" };
  version: number;
  updated_at: string;
}
```

### Apps/Workshop

Endpoints actuales:

- `GET /apps`
- `GET /apps/templates`
- `GET /widgets/catalog`
- `GET /apps/:id`
- `POST /apps`
- `POST /apps/from-template`
- `PATCH /apps/:id`
- `DELETE /apps/:id`
- `POST/PATCH/DELETE /apps/:id/pages`
- `GET /apps/:id/preview`
- `GET/POST /apps/:id/slate-package`
- `GET /apps/:id/versions`
- `POST /apps/:id/publish`
- `GET /apps/public/:slug`

Faltantes recomendados:

- `POST /apps/:id/autosave`
- `GET /apps/:id/collaborators/presence`
- `POST /apps/:id/widgets/:widgetId/actions/validate`
- `POST /apps/:id/theme/validate`

Eventos:

- `app.autosaved`
- `app.version.published`
- `app.collaborator.joined`

### Ontology

Endpoints actuales abundantes:

- Object types: `GET/POST/PUT/DELETE /ontology/types`
- Objects: `GET/POST/PATCH/DELETE /ontology/types/:typeId/objects`
- Actions: `GET/POST/PUT/DELETE /ontology/actions`, execute, validate, metrics.
- Interfaces, properties, shared property types, links.
- Object sets evaluate/materialize.
- Projects, branches, proposals, migrations.
- Funnel/indexing.

Faltantes recomendados:

- `GET /ontology/types/:typeId/objects/:objectId/links`
- `GET /ontology/types/:typeId/objects/:objectId/actions`
- `GET /ontology/types/:typeId/objects/:objectId/permissions`
- `GET /ontology/types/:typeId/table-state`
- `PATCH /ontology/types/:typeId/table-state`

Eventos:

- `ontology.object.updated`
- `ontology.action.executed`
- `ontology.branch.proposal_updated`

### Projects/Workspace

Endpoints actuales:

- `GET/POST/PATCH/DELETE /ontology/projects`
- `/ontology/projects/:id/folders`
- `/ontology/projects/:id/resources`
- `/ontology/projects/:id/memberships`
- `/workspace/resources/:kind/:id/share`
- `/workspace/resources/:kind/:id/move`
- `/workspace/resources/:kind/:id/rename`
- `/workspace/resources/:kind/:id/restore`
- `/workspace/resources/:kind/:id/purge`
- `/workspace/resources/batch`

Faltantes recomendados:

- `GET /workspace/resources/:kind/:id/permissions`
- `PATCH /workspace/resources/:kind/:id/permissions`
- `GET /workspace/resources/:kind/:id/activity`
- `GET /workspace/resources/:kind/:id/access-graph`

### Data Connection

Endpoints actuales:

- `GET /data-connection/catalog`
- `GET/POST/PATCH/DELETE /data-connection/sources`
- `POST /data-connection/sources/:id/test-connection`
- discovery/bulk registrations.
- credentials, egress policies, syncs, media set syncs.

Faltantes recomendados:

- `GET /data-connection/sources/:id/health`
- `GET /data-connection/syncs/:syncId/logs`
- `POST /data-connection/sources/:id/preview`

### Otros Dominios

Cada uno tiene su client en `apps/web/src/lib/api/<domain>.ts` y su detalle exhaustivo en `docs/frontend-interaction-matrix.json` -> `backendContracts`. Resumen:

- `builds` (`buildsV1.ts`): `GET /builds`, `GET /builds/:rid`, `POST /builds/:runId/run`, `POST /builds/:runId/abort`. Recomendado: `GET /builds/:rid/logs/stream`, `GET /builds/:rid/artifacts`.
- `schedules` (`schedules.ts`): `GET /schedules`, `PATCH /schedules/:id`, `POST /schedules/:id/pause|resume|run`, `POST /schedules/:id/convert-to-project-scope`.
- `workflows` (`workflows.ts`): CRUD `/workflows`, `POST /workflows/:id/runs/manual`, `POST /workflows/approvals/:id/decision`. Recomendado: `GET /workflows/:id/runs/:runId/logs`.
- `notebooks` (`notebooks.ts`): CRUD `/notebooks`, `POST /notebooks/:id/sessions`, `POST /notebooks/:id/cells/:cellId/execute`, `GET /notebooks/:id/workspace-files`. Recomendado: `GET /notebooks/:id/sessions/:sessionId/logs/stream`.
- `notepad` (`notepad.ts`): CRUD `/notepad/documents`, `GET /notepad/documents/:id/export`.
- `marketplace` (`marketplace.ts`): `GET /marketplace/listings(/:id)`, `POST /marketplace/listings/:id/install`, `POST /marketplace/products/:id/versions`, fleets.
- `streaming` (`streaming.ts`): CRUD `/streaming/streams`, `POST /streaming/streams/:id/events`, `GET /streaming/streams/:id/dlq`, profiles.
- `virtual-tables` (`virtual-tables.ts`): `GET/POST /virtual-tables`, `GET /virtual-tables/:rid`, `DELETE /virtual-tables/:rid`.
- `iceberg-tables` (`icebergTables.ts`): `GET /iceberg-tables(/:id)`, `GET /iceberg-tables/:id/snapshots`.
- `media-sets` (`mediaSets.ts`): CRUD `/media-sets`, `GET/POST /media-sets/:rid/items`, branches.
- `ai` (`ai.ts`): `GET /ai/overview`, `GET /ai/providers`, CRUD `/ai/prompts`, `/ai/agents`, `POST /ai/agents/:id/execute`, `POST /ai/copilot/ask`, `POST /ai/guardrails/evaluate`.
- `ml` (`ml.ts`): `GET /ml/overview`, CRUD `/ml/experiments`, `/ml/models`, `/ml/features`, `/ml/deployments`.
- `audit` (`audit.ts`): `GET /audit/overview`, `GET/POST /audit/events`, `GET /audit/policies`, `POST /audit/sensitive-data/scan`, `POST /audit/subjects/:id/erase`.
- `queries` (`queries.ts`): `POST /queries/execute`, `POST /queries/explain`, `POST /queries/saved`.
- `reports` (`reports.ts`): `GET /reports(/:id)`, `POST /reports/:id/generate`, `GET /reports/:id/executions/:executionId/download`.
- `code-repos` (`code-repos.ts`): `GET /code-repos(/:id)`, `GET /code-repos/:id/branches`, `POST /code-repos/:id/merge-requests`, `POST /code-repos/:id/ci/runs`.
- `monitoring` (`monitoring.ts`): `GET /monitoring/views`, `GET/POST /monitoring/rules`, `POST /monitoring/rules/:id/pause|resume`.
- `fusion` (`fusion.ts`): `GET /fusion/overview`, CRUD `/fusion/rules`, `/fusion/jobs`, `GET /fusion/merge-strategies`, `GET /fusion/review-queue`.
- `nexus` (`nexus.ts`): `GET /nexus/overview`, CRUD `/nexus/peers`, `/nexus/spaces`, `/nexus/contracts`, `POST /nexus/queries`.
- `control-panel` (`control-panel.ts`): `GET /control-panel`, `PATCH /control-panel`, `GET /control-panel/upgrade-readiness`, streaming profiles, health rules.
- `parameterized` (`parameterized.ts`): `enableParameterized`, `createDeployment`, `listDeployments`, `runDeployment`.
- `notifications` (`notifications.ts`): `GET /notifications`, `POST /notifications/:id/read`, ticket socket.
- `global-branches` (`global-branches.ts`): `GET/POST /global-branches`, `POST /global-branches/:id/promote`.

Cualquier nuevo dominio debe agregar su entrada en `backendContracts` del JSON antes de implementar la pantalla.

## Implementacion Recomendada

### Fase 1: Flow registry

Crear un registro fuente en TypeScript:

```ts
interface UiFlowScreen {
  id: string;
  route: string;
  area: string;
  status: "exists" | "partial" | "missing";
  priority: "P0" | "P1" | "P2";
  actions: UiFlowAction[];
}

interface UiFlowAction {
  id: string;
  element: string;
  type: "navigation" | "tab" | "modal" | "drawer" | "popover" | "backend_action";
  destination: string;
  endpoint?: string;
  permission?: string;
}
```

Ese registro puede derivarse inicialmente de `docs/frontend-interaction-matrix.json`.

### Fase 2: UI Map Route

Crear una ruta interna futura:

- `/ui-map`

Funciones:

- Ver grafo de pantallas.
- Click en nodo para ver pantallas hijas.
- Click en accion para ver endpoint, permisos y estados.
- Exportar Mermaid/JSON.
- Marcar pantallas como `implemented`, `needs_backend`, `needs_design`.

### Fase 3: Componentes Base

Normalizar:

- `ResourceTable`
- `DetailPageLayout`
- `TabbedWorkspace`
- `InspectorDrawer`
- `CreateResourceModal`
- `ActionMenu`
- `PermissionGate`
- `AsyncActionButton`
- `BackendActionFeedback`

### Fase 4: Sincronizacion Backend

Cada boton debe pasar por:

1. `PermissionGate`.
2. `ActionRegistry`.
3. `Mutation hook`.
4. `Audit event`.
5. `Toast/inline feedback`.
6. `Refresh/cache invalidation`.

## Definition Of Done

Una pantalla queda lista cuando:

- Esta en el inventario con ruta, prioridad y estado.
- Tiene sus tabs, modales y drawers definidos.
- Cada boton importante tiene destino o endpoint.
- Los estados loading/error/empty/success estan diseñados.
- El permiso requerido esta definido.
- Hay una historia clara de backend: DTO, endpoint y evento si aplica.
- Se puede representar en `frontend-ui-flow-map.mmd`.
- Se puede serializar en `frontend-interaction-matrix.json`.
