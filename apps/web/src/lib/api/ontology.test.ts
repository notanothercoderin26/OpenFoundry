import { describe, expect, it, vi } from "vitest";

import {
  ONTOLOGY_BUNDLE_SCHEMA_VERSION,
  addObjectViewTab,
  buildCoreObjectViews,
  buildDefaultCustomObjectViewConfig,
  buildDefaultCustomObjectViews,
  buildObjectInstanceViewPolicy,
  buildObjectViewActionSuccessToastLink,
  buildObjectViewApplicationEmbeddingMatrix,
  buildObjectViewEditPermissionDecision,
  buildObjectViewGlobalBranchAdapterState,
  buildObjectViewGlobalBranchRebaseModel,
  buildObjectViewGlobalBranchResources,
  buildObjectViewMarketplaceInstallPlan,
  buildObjectViewMarketplaceOutput,
  buildObjectViewRuntimePermissionDecision,
  buildObjectViewUrlVariants,
  buildOntologyBundle,
  buildOntologyBranchProposalIntegration,
  buildOntologyHistory,
  buildOntologyResourceRegistry,
  buildOntologyResourceSearchIndex,
  buildOntologyResourceHistory,
  buildOntologyUsageImpactAnalysis,
  buildOntologyPermissionAnalysis,
  createOntologyRestoreChange,
  deriveOntologyArtifact,
  buildObjectExplorerActionPrefill,
  buildObjectCommentPermissionDecision,
  buildObjectCommentThread,
  buildObjectExplorerExportAffordances,
  buildObjectExplorerLinkedFilterQuery,
  buildObjectExplorerOpenInAffordances,
  buildObjectExplorerPivotObjectSetDraft,
  buildObjectExplorerPivotQuery,
  buildPanelObjectViewRuntimeConfig,
  buildObjectExplorerSavedLayout,
  buildObjectExplorerSavedQueryState,
  buildObjectExplorerTypeGroups,
  deleteObjectViewTab,
  evaluateRestrictedViewRowPolicy,
  evaluateObjectAndPropertySecurityPolicies,
  ensureObjectViewEditorShell,
  ensurePanelObjectViewConfiguration,
  filterObjectsForRestrictedViewPolicy,
  formatPropertyValue,
  linkTypeCardinalityLabel,
  linkTypeEndpointLabels,
  linkTypeHasDatasourceMapping,
  objectTypeAPIName,
  prominentPropertyPresentation,
  objectTypeGeoPointPropertyNames,
  objectTypeGeoShapePropertyNames,
  objectTypePluralDisplayName,
  objectTypePrimaryKey,
  objectTypeRID,
  objectTypeSearchablePropertyNames,
  objectTypeTitleProperty,
  objectViewFullHref,
  objectViewConfiguredHref,
  objectViewEmbedPolicy,
  objectViewPrimaryKey,
  objectViewPrimaryKeyProperty,
  objectViewPrimaryKeyValue,
  objectViewRuntimeTabs,
  objectViewTitle,
  objectViewVersionHistory,
  objectViewVisibleProperties,
  objectExplorerApplicableActionsForContext,
  objectExplorerLinkedTargetForType,
  objectExplorerLinksForType,
  objectExplorerSavedArtifactAccess,
  objectExplorerSavedArtifactKind,
  objectExplorerShareLink,
  objectExplorerVisibleObjectSets,
  objectExplorerVisibleObjectTypes,
  ontologyBundleToStagedChanges,
  ontologyResourceKey,
  objectSecurityPolicySupportStatus,
  redactObjectInstanceForSecurityPolicies,
  redactObjectViewResponseForRestrictedView,
  propertyConditionalStyle,
  buildObjectViewSafeMetadata,
  buildOntologyAuditEventLog,
  buildOntologyCleanupAssistant,
  buildOntologyHealthReport,
  cacheObjectViewSafeMetadata,
  createOntologyCleanupStagedChanges,
  defaultObjectViewRuntimeBudgets,
  emptyObjectViewMetadataCache,
  evaluateObjectViewRuntimeBudgets,
  getObjectViewSafeMetadata,
  invalidateObjectViewMetadataCache,
  measureObjectViewRuntimeUsage,
  objectViewPermissionContextKey,
  objectViewRuntimeBudgets,
  setObjectViewRuntimeBudgets,
  redactObjectInstanceForPolicy,
  redactObjectViewResponseForObjectViewPermissions,
  redactObjectViewResponseForPolicy,
  redactSearchResultForObjectAccess,
  redactSearchResultForObjectSecurityAccess,
  redactSearchResultForRestrictedViewAccess,
  renameObjectViewTab,
  restrictedViewPolicyPropagationStatus,
  restoreObjectViewConfigVersion,
  resolveObjectViewModeToggle,
  saveObjectViewConfigVersion,
  propertyTypeMetadata,
  parseObjectViewUrlSearch,
  schemaOnlyObjectViewResponse,
  setObjectViewTabVisibility,
  sharedPropertyImpactWarning,
  sharedPropertyUsageSummary,
  bindingDatasourceProvenance,
  mergeApplicableInterfaceActions,
  markObjectViewConfigManuallyEdited,
  moveObjectViewTab,
  validateInterfaceActionRestrictions,
  validateInterfaceImplementation,
  validateMultiDatasourcePrimaryKeys,
  reviewUnsavedOntologyChanges,
  discardOntologyChange,
  discardOntologyChangesOwnedBy,
  executeFunctionPackage,
  appendObjectComment,
  applyObjectViewGlobalBranchAdapterOperation,
  completeObjectViewGlobalBranchRebase,
  removeOntologyBranchProposalResources,
  searchOntologyResourceIndex,
  deleteObjectComment,
  editObjectComment,
  extractObjectCommentMentions,
  maskObjectPropertiesForDatasourceAccess,
  normalizeObjectCommentAttachments,
  objectCommentEntryPermissions,
  objectCommentThreadKey,
  isLogicFunctionPackageId,
  validateValueAgainstValueType,
  valueTypeUsageSummary,
  validateOntologyBundle,
  type ActionType,
  type LinkType,
  type ObjectSetDefinition,
  type ObjectType,
  type ObjectViewDefinition,
  type ObjectViewResponse,
  type OntologyBundle,
  type OntologyObjectTypeGroup,
  type OntologyProject,
  type OntologySavedChangeRecord,
  type OntologyStagedChange,
  type OntologyValueType,
  type Property,
} from "./ontology";

const now = "2026-05-11T00:00:00Z";

describe("logic function package invocation bridge", () => {
  it("routes Workshop-style logic function packages to agent runtime invocation", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/v1/agent-runtime/logic/functions/logic.customer-triage/invoke");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        inputs: { question: "Summarize risk" },
        invocation_surface: "workshop",
        justification: "Workshop function variable effort",
      });
      return new Response(JSON.stringify({
        function: {
          id: "00000000-0000-0000-0000-000000000099",
          function_rid: "logic.customer-triage",
          name: "Customer triage",
          published_version_id: "00000000-0000-0000-0000-000000000077",
        },
        invocation_surface: "workshop",
        status: "succeeded",
        inputs: { question: "Summarize risk" },
        outputs: { finalAnswer: "Escalate with service recovery." },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      expect(isLogicFunctionPackageId("logic.customer-triage")).toBe(true);
      const response = await executeFunctionPackage("logic.customer-triage", {
        object_type_id: "Customer",
        parameters: { question: "Summarize risk" },
        justification: "Workshop function variable effort",
      });

      expect(response.package).toMatchObject({ id: "logic.customer-triage", runtime: "logic" });
      expect(response.result).toEqual({ finalAnswer: "Escalate with service recovery." });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function property(overrides: Partial<Property>): Property {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    object_type_id: overrides.object_type_id ?? "Trail",
    name: overrides.name ?? "label",
    display_name: overrides.display_name ?? overrides.name ?? "Label",
    description: overrides.description ?? "",
    property_type: overrides.property_type ?? "string",
    required: overrides.required ?? false,
    unique_constraint: overrides.unique_constraint ?? false,
    time_dependent: overrides.time_dependent ?? false,
    default_value: overrides.default_value ?? null,
    validation_rules: overrides.validation_rules ?? null,
    inline_edit_config: overrides.inline_edit_config ?? null,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    ...overrides,
  };
}

function objectType(overrides: Partial<ObjectType> = {}): ObjectType {
  return {
    id: "Trail",
    name: "Trail",
    display_name: "Trail",
    description: "",
    primary_key_property: "id",
    icon: "walk",
    color: "#0f766e",
    owner_id: "test",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function graphResponse(overrides: Partial<ObjectViewResponse["graph"]> = {}): ObjectViewResponse["graph"] {
  return {
    mode: "object",
    root_object_id: "trail-1",
    root_type_id: "Trail",
    depth: 1,
    total_nodes: 1,
    total_edges: 0,
    summary: {
      scope: "object",
      node_kinds: {},
      edge_kinds: {},
      object_types: {},
      markings: {},
      root_neighbor_count: 0,
      max_hops_reached: 0,
      boundary_crossings: 0,
      sensitive_objects: 0,
      sensitive_markings: [],
    },
    nodes: [],
    edges: [],
    ...overrides,
  };
}

function actionType(overrides: Partial<ActionType> = {}): ActionType {
  return {
    id: "act",
    name: "RateTrail",
    display_name: "Rate",
    description: "",
    object_type_id: "Trail",
    operation_kind: "modify_object",
    input_schema: [],
    form_schema: { sections: [] },
    config: {},
    confirmation_required: false,
    permission_key: null,
    authorization_policy: {},
    owner_id: "builder",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function ontologyBundleFixture() {
  const projects: OntologyProject[] = [
    {
      id: "project-1",
      slug: "ontology-project",
      display_name: "Ontology project",
      description: "",
      workspace_slug: "demo-space",
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    },
  ];
  const trail = objectType({
    id: "Trail",
    name: "Trail",
    api_name: "Trail",
    display_name: "Trail",
    backing_dataset_id: "dataset-trails",
    properties: [
      property({ id: "trail-id", object_type_id: "Trail", name: "id", display_name: "ID" }),
      property({ id: "trail-rating", object_type_id: "Trail", name: "rating", display_name: "Rating", property_type: "integer", value_type_id: "value-type:default:rating" }),
    ],
  });
  const campsite = objectType({
    id: "Campsite",
    name: "Campsite",
    api_name: "Campsite",
    display_name: "Campsite",
  });
  const link: LinkType = {
    id: "trail-campsite",
    name: "TrailCampsite",
    display_name: "Trail campsites",
    description: "",
    source_type_id: "Trail",
    target_type_id: "Campsite",
    cardinality: "one_to_many",
    owner_id: "owner",
    created_at: now,
    updated_at: now,
  };
  const action: ActionType = {
    id: "update-trail",
    name: "UpdateTrail",
    display_name: "Update trail",
    description: "",
    object_type_id: "Trail",
    operation_kind: "update_object",
    input_schema: [],
    form_schema: {},
    config: {},
    confirmation_required: false,
    permission_key: "ontology:edit",
    authorization_policy: {},
    owner_id: "owner",
    created_at: now,
    updated_at: now,
  };
  const ratingValueType: OntologyValueType = {
    id: "value-type:default:rating",
    name: "rating",
    display_name: "Rating",
    description: "",
    space_id: "default",
    base_type: "integer",
    semantic_type: "rating",
    constraints: { min: 1, max: 5 },
    formatting: {},
    permissions: { viewers: [], appliers: [], editors: ["owner"] },
    version: 1,
    versions: [{ version: 1, edit_kind: "non_breaking", note: "Initial", created_by: "owner", created_at: now }],
    status: "active",
    owner_id: "owner",
    created_at: now,
    updated_at: now,
  };
  const ontology = deriveOntologyArtifact({ projects, objectTypeCount: 2, linkTypeCount: 1 });
  const registry = buildOntologyResourceRegistry({
    ontology,
    projects,
    objectTypes: [trail, campsite],
    linkTypes: [link],
    actionTypes: [action],
    interfaces: [],
    sharedPropertyTypes: [],
    objectTypeGroups: [],
    objectViews: [],
  });
  return { projects, ontology, registry, objectTypes: [trail, campsite], linkTypes: [link], actionTypes: [action], valueTypes: [ratingValueType] };
}

describe("ontology object type metadata helpers", () => {
  it("keeps stable aliases for Foundry-like metadata", () => {
    const type = objectType({
      properties: [
        property({ name: "label", property_type: "string" }),
        property({ name: "trailhead", property_type: "geopoint" }),
        property({ name: "route", property_type: "geojson" }),
      ],
      title_property: "label",
    });

    expect(objectTypeRID(type)).toBe("ri.ontology.main.object-type.Trail");
    expect(objectTypeAPIName(type)).toBe("Trail");
    expect(objectTypePluralDisplayName(type)).toBe("Trails");
    expect(objectTypePrimaryKey(type)).toBe("id");
    expect(objectTypeTitleProperty(type)).toBe("label");
    expect(objectTypeSearchablePropertyNames(type)).toEqual(["label", "id"]);
    expect(objectTypeGeoPointPropertyNames(type)).toEqual(["trailhead"]);
    expect(objectTypeGeoShapePropertyNames(type)).toEqual(["route"]);
  });

  it("honors backend-provided metadata over derived fallbacks", () => {
    const type = objectType({
      rid: "ri.custom.object-type.trail",
      api_name: "TrailApi",
      plural_display_name: "Trailheads",
      primary_key: "trail_id",
      title_property: "trail_name",
      searchable_property_names: ["trail_name"],
      geopoint_property_names: ["start_point"],
      geoshape_property_names: ["route_shape"],
    });

    expect(objectTypeRID(type)).toBe("ri.custom.object-type.trail");
    expect(objectTypeAPIName(type)).toBe("TrailApi");
    expect(objectTypePluralDisplayName(type)).toBe("Trailheads");
    expect(objectTypePrimaryKey(type)).toBe("trail_id");
    expect(objectTypeTitleProperty(type)).toBe("trail_name");
    expect(objectTypeSearchablePropertyNames(type)).toEqual(["trail_name"]);
    expect(objectTypeGeoPointPropertyNames(type)).toEqual(["start_point"]);
    expect(objectTypeGeoShapePropertyNames(type)).toEqual(["route_shape"]);
  });
});

describe("ontology property metadata helpers", () => {
  it("derives base type semantics for advanced property types", () => {
    expect(
      propertyTypeMetadata(property({ property_type: "geopoint" })),
    ).toMatchObject({
      base_type: "geopoint",
      type_family: "geospatial",
      value_shape: "lat-lon-object",
      filterable: true,
      sortable: false,
    });
    expect(
      propertyTypeMetadata(property({ property_type: "geojson" })),
    ).toMatchObject({
      base_type: "geoshape",
      type_family: "geospatial",
    });
    expect(
      propertyTypeMetadata(property({ property_type: "vector" })),
    ).toMatchObject({
      base_type: "vector",
      type_family: "semantic",
      array_allowed: false,
    });
    expect(
      propertyTypeMetadata(property({ property_type: "time_series" })),
    ).toMatchObject({
      base_type: "time_series",
      type_family: "timeseries",
      array_allowed: false,
    });
    expect(
      propertyTypeMetadata(property({ property_type: "decimal" })),
    ).toMatchObject({
      base_type: "decimal",
      type_family: "numeric",
      aggregatable: true,
      formatting_eligible: true,
      primary_key_eligible: false,
    });
    expect(
      propertyTypeMetadata(property({ property_type: "geohash" })),
    ).toMatchObject({
      base_type: "geohash",
      type_family: "geospatial",
      title_key_eligible: true,
      object_security_eligible: true,
    });
    expect(
      propertyTypeMetadata(property({ property_type: "array<string>" })),
    ).toMatchObject({
      base_type: "array",
      type_family: "collection",
      array_item_type: "string",
      primary_key_eligible: false,
      title_key_eligible: false,
    });
  });

  it("honors backend-provided property metadata", () => {
    const metadata = propertyTypeMetadata(
      property({
        property_type: "string",
        base_type: "media_reference",
        type_family: "media",
        type_display_name: "Media reference",
        value_shape: "media-reference",
        array_allowed: true,
        searchable: false,
        filterable: true,
        sortable: false,
        aggregatable: false,
        primary_key_eligible: false,
        title_key_eligible: false,
        formatting_eligible: true,
        object_security_eligible: false,
        prominent_eligible: true,
        semantic_hints: ["media"],
      }),
    );

    expect(metadata.base_type).toBe("media_reference");
    expect(metadata.type_family).toBe("media");
    expect(metadata.formatting_eligible).toBe(true);
    expect(metadata.prominent_eligible).toBe(true);
    expect(metadata.semantic_hints).toEqual(["media"]);
  });
});


describe("ontology working-state review helpers", () => {
  it("summarizes validation status and discard operations for unsaved changes", () => {
    const changes = [
      { id: "c1", kind: "object_type", action: "create", label: "Create bad type", description: "", targetId: "type-1", payload: { name: "bad-name", primary_key_property: "id" }, warnings: [], errors: [], source: "test", author: "user-1", createdAt: now },
      { id: "c2", kind: "object_type_binding", action: "update", label: "Map datasource", description: "", targetId: "binding-1", payload: { primary_key_column: "id", property_mapping: [{ source_field: "status", target_property: "status" }] }, warnings: [], errors: [], source: "test", author: "user-2", createdAt: now },
    ];

    const review = reviewUnsavedOntologyChanges(changes, "user-1");
    expect(review).toMatchObject({ total: 2, errors: 1, current_user_owned: 1, save_ready: false });
    expect(review.reviews[0]).toMatchObject({ resource_kind: "object_type", resource_id: "type-1", validation_status: "error", save_ready: false });
    expect(review.reviews[1]).toMatchObject({ resource_kind: "object_type_binding", resource_id: "binding-1", validation_status: "valid", save_ready: true });
    expect(discardOntologyChange(changes, "c1").map((change) => change.id)).toEqual(["c2"]);
    expect(discardOntologyChangesOwnedBy(changes, "user-2").map((change) => change.id)).toEqual(["c1"]);
  });

  it("filters saved history and stages restore changes without applying them", () => {
    const records: OntologySavedChangeRecord[] = [
      {
        id: "record-1",
        project_id: "project-1",
        change_ids: ["c1"],
        resources: [{ kind: "object_type", id: "Trail", label: "Trail" }],
        changes: [
          {
            id: "c1",
            kind: "object_type",
            action: "update",
            label: "Trail",
            description: "Older Trail schema",
            targetId: "Trail",
            payload: { id: "Trail", name: "Trail", display_name: "Trail", visibility: "normal", primary_key_property: "id" },
            warnings: [],
            errors: [],
            source: "test",
            author: "author-1",
            createdAt: now,
          },
        ],
        status: "saved",
        validation_errors: [],
        saved_by: "author-1",
        saved_at: now,
      },
      {
        id: "record-2",
        project_id: "project-1",
        change_ids: ["c2"],
        resources: [{ kind: "link_type", id: "hidden-link", label: "Hidden link" }],
        changes: [
          {
            id: "c2",
            kind: "link_type",
            action: "update",
            label: "Hidden link",
            description: "",
            targetId: "hidden-link",
            payload: { id: "hidden-link", name: "HiddenLink", visibility: "hidden" },
            warnings: [],
            errors: [],
            source: "test",
            author: "author-2",
            createdAt: now,
          },
        ],
        status: "saved",
        validation_errors: [],
        saved_by: "author-2",
        saved_at: now,
      },
    ];

    const history = buildOntologyHistory(records, [], { resource_kind: "object_type", author: "author-1", details: "viewable" }, { current_user_id: "viewer" });
    expect(history).toHaveLength(1);
    expect(history[0].resources[0]).toMatchObject({ kind: "object_type", id: "Trail", can_view_details: true });

    const hiddenHistory = buildOntologyHistory(records, [], { visibility: "hidden", details: "restricted" }, { current_user_id: "viewer" });
    expect(hiddenHistory).toHaveLength(1);
    expect(hiddenHistory[0].restricted_details_count).toBe(1);

    const resourceHistory = buildOntologyResourceHistory(records, [], { kind: "object_type", id: "Trail" });
    const restore = createOntologyRestoreChange(resourceHistory[0], resourceHistory[0].resources[0], { current_user_id: "viewer", now });
    expect(restore).toMatchObject({
      kind: "object_type",
      action: "restore",
      targetId: "Trail",
      source: "ontology_history_restore",
      payload: {
        restored_from_record_id: "record-1",
        restored_from_change_id: "c1",
      },
    });
    expect(restore.warnings[0]).toContain("unsaved ontology change");
  });

  it("exports selected ontology resources and imports them as unsaved changes", () => {
    const fixture = ontologyBundleFixture();
    const bundle = buildOntologyBundle({
      ontology: fixture.ontology,
      registry: fixture.registry,
      selectedResourceKeys: [
        ontologyResourceKey("object_type", "Trail"),
        ontologyResourceKey("link_type", "trail-campsite"),
        ontologyResourceKey("value_type", "value-type:default:rating"),
      ],
      objectTypes: fixture.objectTypes,
      linkTypes: fixture.linkTypes,
      actionTypes: fixture.actionTypes,
      interfaces: [],
      sharedPropertyTypes: [],
      valueTypes: fixture.valueTypes,
      objectTypeGroups: [],
      objectViews: [],
      exportedBy: "viewer",
      now,
    });

    expect(bundle.metadata).toMatchObject({ generated_by: "openfoundry", resource_count: 3 });
    expect(bundle.resources.map((resource) => ontologyResourceKey(resource.kind, resource.id)).sort()).toEqual([
      "link_type:trail-campsite",
      "object_type:Trail",
      "value_type:value-type:default:rating",
    ]);

    const validation = validateOntologyBundle(bundle, {
      ontology: fixture.ontology,
      registry: fixture.registry,
      valueTypes: fixture.valueTypes,
      currentUserId: "viewer",
    });
    expect(validation).toMatchObject({ valid: true, errors: 0 });
    expect(validation.staged_changes).toHaveLength(3);

    const staged = ontologyBundleToStagedChanges(bundle, { currentUserId: "viewer", now });
    const objectImport = staged.find((change) => change.targetId === "Trail");
    expect(objectImport).toMatchObject({
      source: "ontology_bundle_import",
      action: "import",
      author: "viewer",
      payload: {
        imported_from_bundle_id: bundle.bundle_id,
        imported_resource_kind: "object_type",
      },
    });
  });

  it("validates edited bundles for conflicts, dependencies, unsafe deletes, and private fields", () => {
    const fixture = ontologyBundleFixture();
    const bundle: OntologyBundle = {
      schema_version: ONTOLOGY_BUNDLE_SCHEMA_VERSION,
      bundle_id: "bundle-edited",
      exported_at: now,
      exported_by: "editor",
      ontology: {
        id: fixture.ontology.id,
        api_name: fixture.ontology.api_name,
        display_name: fixture.ontology.display_name,
        owning_space_slug: fixture.ontology.owning_space_slug,
      },
      resources: [
        {
          kind: "object_type",
          id: "TrailCopy",
          api_name: "Trail",
          display_name: "Trail copy",
          action: "upsert",
          payload: { id: "TrailCopy", name: "Trail", display_name: "Trail copy" },
          dependencies: [],
        },
        {
          kind: "link_type",
          id: "orphan-link",
          api_name: "OrphanLink",
          display_name: "Orphan link",
          action: "upsert",
          payload: { id: "orphan-link", name: "OrphanLink", source_type_id: "MissingSource", target_type_id: "Trail" },
          dependencies: [],
        },
        {
          kind: "object_type",
          id: "Trail",
          api_name: "Trail",
          display_name: "Trail",
          action: "delete",
          payload: { id: "Trail", name: "Trail", private_note: "not importable" },
          dependencies: [],
        },
        {
          kind: "action_type",
          id: "unsafe-action",
          api_name: "UnsafeAction",
          display_name: "Unsafe action",
          action: "upsert",
          payload: { id: "unsafe-action", name: "UnsafeAction", object_type_id: "Trail", authorization_policy: {} },
          dependencies: [],
        },
      ],
      metadata: {
        resource_count: 4,
        includes_working_state: false,
        generated_by: "openfoundry",
      },
    };

    const validation = validateOntologyBundle(bundle, {
      ontology: fixture.ontology,
      registry: fixture.registry,
      valueTypes: fixture.valueTypes,
      currentUserId: "viewer",
    });
    const issueCodes = validation.issues.map((issue) => issue.code);
    expect(validation.valid).toBe(false);
    expect(issueCodes).toContain("api_name_conflict");
    expect(issueCodes).toContain("missing_dependency");
    expect(issueCodes).toContain("unsafe_delete");
    expect(issueCodes).toContain("missing_permission_requirement");
    expect(issueCodes).toContain("unsupported_private_fields");
  });

  it("builds usage impact across downstream products and warns on breaking edits", () => {
    const fixture = ontologyBundleFixture();
    const objectViews = buildCoreObjectViews({
      objectTypes: fixture.objectTypes,
      linkTypes: fixture.linkTypes,
    });
    const analysis = buildOntologyUsageImpactAnalysis({
      objectTypes: fixture.objectTypes,
      linkTypes: fixture.linkTypes,
      actionTypes: fixture.actionTypes,
      interfaces: [],
      sharedPropertyTypes: [],
      valueTypes: fixture.valueTypes,
      objectViews,
      externalSources: [
        {
          product: "workshop",
          consumer_id: "app-1",
          consumer_label: "Trail operations",
          consumer_kind: "Workshop app",
          payload: {
            settings: {
              workshop_variables: [
                { id: "trails", object_type_id: "Trail", static_filters: [{ property_name: "rating" }] },
              ],
            },
            pages: [{ widgets: [{ props: { action_type_id: "update-trail" } }] }],
          },
          last_used_at: now,
          actor: "builder",
        },
        {
          product: "pipeline_builder",
          consumer_id: "pipeline-1",
          consumer_label: "Trail sync",
          consumer_kind: "Pipeline",
          payload: { nodes: [{ object_type_id: "Trail", link_type_id: "trail-campsite" }] },
          last_used_at: now,
          actor: "builder",
        },
        {
          product: "marketplace",
          consumer_id: "listing-1:v1",
          consumer_label: "Trail package 1.0.0",
          consumer_kind: "Marketplace package version",
          payload: { packaged_resources: [{ kind: "object_type", resource_ref: "object_type:Trail" }] },
          last_used_at: now,
          actor: "publisher",
        },
      ],
      workingChanges: [
        {
          id: "delete-rating",
          kind: "property",
          action: "delete",
          label: "Delete rating",
          description: "",
          targetId: "Trail.rating",
          payload: { name: "rating" },
          warnings: [],
          errors: [],
          source: "test",
          author: "editor",
          createdAt: now,
        },
      ],
    });

    const trailSummary = analysis.summaries.find((summary) => summary.resource_key === "object_type:Trail");
    const ratingSummary = analysis.summaries.find((summary) => summary.resource_key === "property:Trail.rating");
    expect(trailSummary?.products).toEqual(expect.arrayContaining(["workshop", "pipeline_builder", "marketplace", "object_views"]));
    expect(ratingSummary?.products).toEqual(expect.arrayContaining(["workshop", "object_views"]));
    expect(analysis.product_counts.workshop).toBeGreaterThan(0);
    expect(analysis.warnings[0]).toMatchObject({
      severity: "error",
      code: "breaking_downstream_usage",
      resource_kind: "property",
      resource_id: "Trail.rating",
    });
  });

  it("models project resource permissions and enforces compound link/action edit requirements", () => {
    const fixture = ontologyBundleFixture();
    const viewerAnalysis = buildOntologyPermissionAnalysis({
      registry: fixture.registry,
      projects: fixture.projects,
      projectMemberships: [
        { project_id: "project-1", user_id: "viewer", role: "viewer", created_at: now, updated_at: now },
      ],
      objectTypes: fixture.objectTypes,
      linkTypes: fixture.linkTypes,
      actionTypes: fixture.actionTypes,
      principal: { user_id: "viewer", roles: ["viewer"], permissions: [] },
      workingChanges: [
        {
          id: "edit-link",
          kind: "link_type",
          action: "update",
          label: "Edit Trail campsites",
          description: "",
          targetId: "trail-campsite",
          payload: {},
          warnings: [],
          errors: [],
          source: "test",
          author: "viewer",
          createdAt: now,
        },
      ],
    });

    const trailDecision = viewerAnalysis.resources.find((resource) => resource.resource_key === "object_type:Trail");
    expect(trailDecision).toMatchObject({
      effective_level: "view",
      can_view_definition: true,
      can_view_instances: false,
      object_instance_access: "datasource_required",
    });
    expect(viewerAnalysis.change_checks[0]).toMatchObject({ allowed: false });
    expect(viewerAnalysis.change_checks[0].requirements.map((requirement) => requirement.resource_key).sort()).toEqual([
      "link_type:trail-campsite",
      "object_type:Campsite",
      "object_type:Trail",
    ]);

    const propertyAnalysis = buildOntologyPermissionAnalysis({
      registry: fixture.registry,
      projects: fixture.projects,
      projectMemberships: [
        { project_id: "project-1", user_id: "viewer", role: "viewer", created_at: now, updated_at: now },
      ],
      objectTypes: fixture.objectTypes,
      principal: { user_id: "viewer", roles: ["viewer"], permissions: [] },
      workingChanges: [
        {
          id: "edit-property",
          kind: "property",
          action: "update",
          label: "Edit Trail rating",
          description: "",
          targetId: "Trail.rating",
          payload: {},
          warnings: [],
          errors: [],
          source: "test",
          author: "viewer",
          createdAt: now,
        },
      ],
    });
    expect(propertyAnalysis.change_checks[0]).toMatchObject({ allowed: false });
    expect(propertyAnalysis.change_checks[0].requirements.map((requirement) => requirement.resource_key)).toEqual([
      "object_type:Trail",
    ]);

    const editorAnalysis = buildOntologyPermissionAnalysis({
      registry: fixture.registry,
      projects: fixture.projects,
      projectMemberships: [
        { project_id: "project-1", user_id: "editor", role: "editor", created_at: now, updated_at: now },
      ],
      objectTypes: fixture.objectTypes,
      linkTypes: fixture.linkTypes,
      actionTypes: fixture.actionTypes,
      principal: { user_id: "editor", roles: ["editor"], permissions: ["datasources:view"] },
      workingChanges: [
        {
          id: "edit-action",
          kind: "action_type",
          action: "update",
          label: "Edit Update trail",
          description: "",
          targetId: "update-trail",
          payload: { operation_kind: "update_object" },
          warnings: [],
          errors: [],
          source: "test",
          author: "editor",
          createdAt: now,
        },
      ],
    });
    expect(editorAnalysis.resources.find((resource) => resource.resource_key === "object_type:Trail")).toMatchObject({
      effective_level: "edit",
      can_view_instances: true,
      object_instance_access: "datasource_granted",
    });
    expect(editorAnalysis.change_checks[0]).toMatchObject({ allowed: true });
    expect(editorAnalysis.change_checks[0].requirements.map((requirement) => requirement.resource_key).sort()).toEqual([
      "action_type:update-trail",
      "object_type:Trail",
    ]);
  });

  it("renders schema-only object views when instance data is not viewable", () => {
    const fixture = ontologyBundleFixture();
    const trailType = fixture.objectTypes[0];
    const viewerPolicy = buildObjectInstanceViewPolicy({
      objectType: trailType,
      principal: { user_id: "viewer", roles: ["viewer"], permissions: [] },
    });
    expect(viewerPolicy).toMatchObject({
      can_view_definition: true,
      can_view_instances: false,
      schema_only: true,
      access_mode: "datasource_required",
    });

    const trailObject = {
      id: "trail-1",
      object_type_id: "Trail",
      properties: { id: "trail-1", rating: 5 },
      created_by: "owner",
      marking: "confidential",
      created_at: now,
      updated_at: now,
    };
    const redactedObject = redactObjectInstanceForPolicy(trailObject, viewerPolicy);
    expect(redactedObject.properties).toEqual({});
    expect(redactedObject.marking).toBe("schema-only");

    const view = schemaOnlyObjectViewResponse({ objectType: trailType, objectId: trailObject.id, policy: viewerPolicy });
    const redactedView = redactObjectViewResponseForPolicy({
      ...view,
      object: trailObject,
      summary: { rating: 5 },
      neighbors: [{
        direction: "outbound",
        link_id: "link-1",
        link_type_id: "trail-campsite",
        link_name: "Trail campsites",
        object: {
          id: "camp-1",
          object_type_id: "Campsite",
          properties: { name: "Hidden camp" },
          created_by: "owner",
          created_at: now,
          updated_at: now,
        },
      }],
      timeline: [{ kind: "comment", body: "Sensitive handoff" }],
    }, viewerPolicy);
    expect(redactedView.summary).toEqual({});
    expect(redactedView.neighbors).toEqual([]);
    expect(redactedView.timeline).toEqual([]);
    expect(redactedView.applicable_actions).toEqual([]);

    const redactedSearch = redactSearchResultForObjectAccess({
      kind: "object_instance",
      id: "trail-1",
      object_type_id: "Trail",
      title: "Secret trail",
      subtitle: "High risk",
      snippet: "rating: 5",
      score: 1,
      route: "/ontology/Trail?object=trail-1",
      metadata: { rating: 5 },
    }, viewerPolicy);
    expect(redactedSearch).toMatchObject({
      title: "Schema-only object",
      subtitle: "Object values restricted",
      snippet: "",
      metadata: {},
      route: "/ontology/Trail",
    });

    const editorPolicy = buildObjectInstanceViewPolicy({
      objectType: trailType,
      principal: { user_id: "editor", roles: ["viewer"], permissions: ["datasource:dataset-trails:view"] },
    });
    expect(editorPolicy).toMatchObject({
      can_view_instances: true,
      schema_only: false,
      access_mode: "datasource_granted",
    });
    expect(redactObjectInstanceForPolicy(trailObject, editorPolicy).properties.rating).toBe(5);
  });

  it("enforces restricted-view row outcomes and propagation warnings", () => {
    const restrictedTrail = objectType({
      id: "Trail",
      backing_datasource_type: "restricted_view",
      backing_restricted_view_id: "rv-trails",
      restricted_view_storage_mode: "local_storage",
      restricted_view_policy_version: 4,
      restricted_view_registered_policy_version: 3,
      restricted_view_indexed_policy_version: 2,
      restricted_view_policy: {
        mode: "any_rule",
        allowed_groups: ["field-ops"],
        required_markings: ["public"],
        row_rules: [{ id: "east-region", property: "region", operator: "equals", value: "east" }],
      },
    });
    const missingView = buildObjectInstanceViewPolicy({
      objectType: restrictedTrail,
      principal: { user_id: "viewer", roles: ["viewer"], groups: ["field-ops"], permissions: [] },
    });
    expect(missingView).toMatchObject({
      can_view_instances: false,
      schema_only: true,
      access_mode: "restricted_view_required",
    });

    const principal = {
      user_id: "viewer",
      roles: ["viewer"],
      groups: ["field-ops"],
      permissions: ["restricted-view:rv-trails:view"],
    };
    const viewPolicy = buildObjectInstanceViewPolicy({ objectType: restrictedTrail, principal });
    expect(viewPolicy).toMatchObject({
      can_view_instances: true,
      schema_only: false,
      access_mode: "restricted_view",
      restricted_view_id: "rv-trails",
    });

    const allowedObject = {
      id: "trail-east",
      object_type_id: "Trail",
      properties: { id: "trail-east", region: "east", name: "Open trail" },
      created_by: "owner",
      marking: "public",
      created_at: now,
      updated_at: now,
    };
    const deniedObject = {
      ...allowedObject,
      id: "trail-west",
      properties: { id: "trail-west", region: "west", name: "Hidden trail" },
    };
    expect(evaluateRestrictedViewRowPolicy({ object: allowedObject, objectType: restrictedTrail, principal })).toMatchObject({
      allowed: true,
      matched_rules: ["east-region"],
    });
    expect(evaluateRestrictedViewRowPolicy({ object: deniedObject, objectType: restrictedTrail, principal })).toMatchObject({
      allowed: false,
      reason: "Restricted view row policy did not allow this row.",
    });
    expect(filterObjectsForRestrictedViewPolicy([allowedObject, deniedObject], { objectType: restrictedTrail, principal }).map((object) => object.id)).toEqual([
      "trail-east",
    ]);

    const redactedView = redactObjectViewResponseForRestrictedView({
      ...schemaOnlyObjectViewResponse({ objectType: restrictedTrail, objectId: deniedObject.id }),
      object: deniedObject,
      summary: { name: "Hidden trail" },
      neighbors: [],
      applicable_actions: [{ id: "act", name: "edit", display_name: "Edit", description: "", object_type_id: "Trail", operation_kind: "update_object", input_schema: [], form_schema: {}, config: {}, confirmation_required: false, permission_key: null, authorization_policy: {}, owner_id: "owner", created_at: now, updated_at: now }],
      matching_rules: [],
      recent_rule_runs: [],
      timeline: [{ kind: "comment", body: "sensitive" }],
    }, { objectType: restrictedTrail, principal });
    expect(redactedView.summary).toEqual({});
    expect(redactedView.applicable_actions).toEqual([]);
    expect(redactedView.timeline).toEqual([]);
    expect(redactedView.object.object_view_access).toMatchObject({ schema_only: true, restricted_view_id: "rv-trails" });

    const searchResult = {
      kind: "object_instance",
      id: "trail-west",
      object_type_id: "Trail",
      title: "Hidden trail",
      subtitle: "west",
      snippet: "region: west",
      score: 1,
      route: "/ontology/Trail?object=trail-west",
      metadata: { region: "west", marking: "public" },
    };
    expect(redactSearchResultForRestrictedViewAccess(searchResult, restrictedTrail, principal)).toMatchObject({
      title: "Restricted object",
      snippet: "",
      metadata: {},
      route: "/ontology/Trail",
    });
    expect(redactSearchResultForRestrictedViewAccess({
      ...searchResult,
      id: "trail-east",
      metadata: { region: "east", marking: "public" },
    }, restrictedTrail, principal).title).toBe("Hidden trail");

    const propagation = restrictedViewPolicyPropagationStatus({
      restricted_view_id: "rv-trails",
      storage_mode: "local_storage",
      policy_version: 4,
      registered_policy_version: 3,
      indexed_policy_version: 2,
    });
    expect(propagation).toMatchObject({
      requires_reregistration: true,
      requires_reindex: true,
    });
    expect(propagation.warnings.join(" ")).toContain("re-register");
    expect(restrictedViewPolicyPropagationStatus({ ...propagation, restricted_view_id: "rv-trails", storage_mode: "remote" }).warnings).toEqual([]);
  });

  it("requires object security policy visibility before showing policy-backed object data", () => {
    const securedType = objectType({
      backing_dataset_id: null,
      security_policy_mode: "object_policy",
      object_security_policy_id: "policy-trail",
    } as Partial<ObjectType>);
    expect(buildObjectInstanceViewPolicy({
      objectType: securedType,
      principal: { user_id: "viewer", roles: ["viewer"], permissions: [] },
    })).toMatchObject({
      can_view_definition: true,
      can_view_instances: false,
      access_mode: "object_policy_required",
    });
    expect(buildObjectInstanceViewPolicy({
      objectType: securedType,
      principal: { user_id: "viewer", roles: ["viewer"], permissions: ["object-policy:policy-trail:view"] },
    })).toMatchObject({
      can_view_instances: true,
      access_mode: "object_policy",
    });
  });

  it("blocks object and property security policy enforcement without attribute primitives and fixtures", () => {
    const securedType = objectType({
      object_security_policy: {
        id: "trail-policy",
        allowed_groups: ["field-ops"],
        row_rules: [{ id: "region", property: "region", operator: "equals", value: "emea" }],
      },
      property_security_policies: [{
        id: "pii-policy",
        property_names: ["secret"],
        allowed_groups: ["pii-cleared"],
      }],
      properties: [
        property({ name: "id" }),
        property({ name: "region" }),
        property({ name: "secret" }),
      ],
    });
    const status = objectSecurityPolicySupportStatus(securedType);
    expect(status).toMatchObject({
      configured: true,
      blocked: true,
      enforcement_state: "blocked",
      supports_attribute_evaluation: false,
      has_test_fixtures: false,
    });
    expect(status.warnings.join(" ")).toContain("object-attribute policy evaluation primitives");
    expect(buildObjectInstanceViewPolicy({
      objectType: securedType,
      principal: { user_id: "viewer", roles: ["viewer"], groups: ["field-ops"] },
    })).toMatchObject({
      can_view_instances: false,
      schema_only: true,
      access_mode: "object_policy_blocked",
    });

    const object = {
      id: "trail-1",
      object_type_id: "Trail",
      properties: { id: "trail-1", region: "emea", secret: "classified" },
      created_by: "owner",
      marking: "public",
      created_at: now,
      updated_at: now,
    };
    const redacted = redactObjectInstanceForSecurityPolicies(object, {
      objectType: securedType,
      properties: securedType.properties,
      principal: { user_id: "viewer", roles: ["viewer"], groups: ["field-ops"] },
    });
    expect(redacted.properties).toEqual({});
    expect(redacted.object_security_access).toMatchObject({
      blocked: true,
      can_read_object: false,
    });
  });

  it("distinguishes object read, protected property read, normal edits, and policy-property edits when supported", () => {
    const securedType = objectType({
      object_security_policy_support: {
        object_attribute_evaluation: true,
        property_policy_evaluation: true,
        edit_policy_evaluation: true,
        test_fixtures: true,
      },
      object_security_policy: {
        id: "trail-policy",
        allowed_groups: ["field-ops"],
        row_rules: [{ id: "region", property: "region", operator: "equals", value: "emea" }],
        edit_property_policy: { mode: "allow_all" },
        edit_policy_property_policy: { allowed_groups: ["policy-admins"] },
      },
      property_security_policies: [{
        id: "pii-policy",
        property_names: ["secret"],
        allowed_groups: ["pii-cleared"],
        edit_property_policy: { allowed_groups: ["pii-editors"] },
      }],
      properties: [
        property({ name: "id" }),
        property({ name: "region" }),
        property({ name: "secret" }),
      ],
    });
    const principal = { user_id: "viewer", roles: ["viewer"], groups: ["field-ops"] };
    const object = {
      id: "trail-1",
      object_type_id: "Trail",
      properties: { id: "trail-1", region: "emea", secret: "classified" },
      created_by: "owner",
      marking: "public",
      created_at: now,
      updated_at: now,
    };
    const evaluation = evaluateObjectAndPropertySecurityPolicies({
      object,
      objectType: securedType,
      properties: securedType.properties,
      principal,
    });
    expect(evaluation).toMatchObject({
      enforcement_state: "enforced",
      blocked: false,
      can_read_object: true,
    });
    expect(evaluation.property_decisions.find((decision) => decision.property_name === "region")).toMatchObject({
      can_read: true,
      can_edit_property: false,
      can_edit_policy_property: false,
      policy_property: true,
    });
    expect(evaluation.property_decisions.find((decision) => decision.property_name === "secret")).toMatchObject({
      can_read: false,
      can_edit_property: false,
      can_edit_policy_property: false,
      policy_id: "pii-policy",
    });

    const redacted = redactObjectInstanceForSecurityPolicies(object, {
      objectType: securedType,
      properties: securedType.properties,
      principal,
    });
    expect(redacted.properties).toMatchObject({ id: "trail-1", region: "emea", secret: null });

    const redactedSearch = redactSearchResultForObjectSecurityAccess({
      kind: "object_instance",
      id: "trail-1",
      object_type_id: "Trail",
      title: "Trail 1",
      subtitle: "secret",
      snippet: "secret: classified",
      score: 1,
      route: "/ontology/Trail?object=trail-1",
      metadata: { id: "trail-1", region: "emea", secret: "classified" },
    }, securedType, principal);
    expect(redactedSearch).toMatchObject({
      title: "Trail 1",
      subtitle: "Property values restricted",
      snippet: "",
      metadata: { id: "trail-1", region: "emea" },
    });
  });

  it("builds Object Explorer visible types, groups, and saved explorations", () => {
    const trail = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      group_names: ["Legacy Outdoors"],
      backing_dataset_id: "dataset-trails",
    });
    const campsite = objectType({
      id: "Campsite",
      name: "Campsite",
      display_name: "Campsite",
      backing_dataset_id: "dataset-camps",
    });
    const hidden = objectType({
      id: "Hidden",
      name: "Hidden",
      display_name: "Hidden",
      visibility: "hidden",
      backing_dataset_id: "dataset-hidden",
    });
    const principal = { user_id: "viewer", roles: ["viewer"], permissions: ["datasource:dataset-trails:view", "datasource:dataset-camps:view"] };
    const visibleTypes = objectExplorerVisibleObjectTypes([trail, campsite, hidden], principal);
    expect(visibleTypes.map((type) => type.id)).toEqual(["Trail", "Campsite"]);

    const groups = buildObjectExplorerTypeGroups([
      {
        id: "outdoor",
        name: "outdoor",
        display_name: "Outdoor",
        description: "Outdoor operations",
        visibility: "normal",
        status: "active",
        owner_id: "owner",
        created_at: now,
        updated_at: now,
        object_type_ids: ["Trail"],
        object_type_count: 1,
      },
    ], visibleTypes);
    expect(groups.map((group) => [group.display_name, group.object_type_ids])).toEqual([
      ["Other", ["Campsite"]],
      ["Outdoor", ["Trail"]],
    ]);

    const visibleSets = objectExplorerVisibleObjectSets([
      {
        id: "set-trails",
        name: "Trail exploration",
        description: "",
        base_object_type_id: "Trail",
        filters: [{ field: "status", operator: "equals", value: "active" }],
        traversals: [],
        join: null,
        projections: [],
        what_if_label: null,
        policy: { allowed_markings: [], minimum_clearance: null, deny_guest_sessions: false, required_restricted_view_id: null },
        materialized_snapshot: null,
        materialized_at: null,
        materialized_row_count: 0,
        owner_id: "viewer",
        created_at: now,
        updated_at: now,
      },
      {
        id: "set-hidden",
        name: "Hidden exploration",
        description: "",
        base_object_type_id: "Hidden",
        filters: [],
        traversals: [],
        join: null,
        projections: [],
        what_if_label: null,
        policy: { allowed_markings: [], minimum_clearance: null, deny_guest_sessions: false, required_restricted_view_id: null },
        materialized_snapshot: null,
        materialized_at: null,
        materialized_row_count: 0,
        owner_id: "viewer",
        created_at: now,
        updated_at: now,
      },
    ], [trail, campsite, hidden], principal);
    expect(visibleSets.map((set) => set.id)).toEqual(["set-trails"]);
  });

  it("keeps saved exploration metadata separate from object data access", () => {
    const trail = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const saved: ObjectSetDefinition = {
      id: "set-public",
      name: "Trail risk list",
      description: "",
      base_object_type_id: "Trail",
      filters: [{ field: "id", operator: "in", value: ["trail-1", "trail-2"] }],
      traversals: [],
      join: null,
      projections: ["id", "status"],
      what_if_label: null,
      policy: { allowed_markings: [], minimum_clearance: null, deny_guest_sessions: false, required_restricted_view_id: null },
      kind: "list",
      query_state: buildObjectExplorerSavedQueryState({
        query: "risk",
        search_mode: "semantic",
        object_type_id: "Trail",
        selected_object_ids: ["trail-1", "trail-1", "trail-2"],
      }),
      layout: buildObjectExplorerSavedLayout({ view: "table", columns: ["id", "status", "id", ""] }),
      privacy: "public",
      project_id: "project-field",
      folder_path: "/Field Ops/Lists",
      share_slug: "trail-risk-list",
      selected_object_ids: ["trail-1", "trail-2"],
      materialized_snapshot: null,
      materialized_at: null,
      materialized_row_count: 2,
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };

    const metadataOnly = objectExplorerSavedArtifactAccess(saved, trail, {
      user_id: "viewer",
      roles: ["viewer"],
      permissions: [],
    });
    expect(metadataOnly).toMatchObject({
      can_view_metadata: true,
      can_view_objects: false,
      schema_only: true,
      privacy: "public",
    });
    expect(objectExplorerVisibleObjectSets([saved], [trail], { user_id: "viewer", roles: ["viewer"], permissions: [] }).map((set) => set.id)).toEqual(["set-public"]);
    expect(objectExplorerSavedArtifactAccess(saved, trail, {
      user_id: "viewer",
      roles: ["viewer"],
      permissions: ["datasource:dataset-trails:view"],
    })).toMatchObject({
      can_view_metadata: true,
      can_view_objects: true,
      schema_only: false,
    });

    expect(objectExplorerSavedArtifactKind(saved)).toBe("list");
    expect(saved.query_state?.selected_object_ids).toEqual(["trail-1", "trail-2"]);
    expect(saved.layout?.columns).toEqual(["id", "status"]);
    expect(objectExplorerShareLink(saved, "https://openfoundry.example")).toBe("https://openfoundry.example/object-explorer?exploration=set-public&slug=trail-risk-list");

    const privateSaved = { ...saved, id: "set-private", privacy: "private", share_slug: "private" };
    expect(objectExplorerVisibleObjectSets([privateSaved], [trail], {
      user_id: "viewer",
      roles: ["viewer"],
      permissions: ["datasource:dataset-trails:view"],
    })).toEqual([]);
  });

  it("builds Object Explorer action prefill, open-in, export affordances, and selection limits", () => {
    const trail = objectType({
      id: "Trail",
      display_name: "Trail",
      properties: [
        property({ name: "id", display_name: "ID" }),
        property({ name: "location", display_name: "Location", property_type: "geopoint" }),
      ],
    });
    const assignAction: ActionType = {
      id: "assign-trails",
      name: "AssignTrails",
      display_name: "Assign trails",
      description: "",
      object_type_id: "Trail",
      operation_kind: "invoke_function",
      input_schema: [{ name: "targets", display_name: "Targets", property_type: "object_reference_list", required: true }],
      form_schema: {},
      config: {},
      confirmation_required: false,
      permission_key: null,
      authorization_policy: {},
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };
    const hiddenAction: ActionType = {
      ...assignAction,
      id: "hidden",
      input_schema: [{ name: "targets", property_type: "object_reference_list", required: true, type_classes: [{ kind: "hubble-oe", name: "hide-action" }] } as ActionType["input_schema"][number]],
    };
    const otherAction = { ...assignAction, id: "camp-action", object_type_id: "Campsite" };

    expect(objectExplorerApplicableActionsForContext([assignAction, hiddenAction, otherAction], { object_type_id: "Trail" }).map((action) => action.id)).toEqual(["assign-trails"]);

    const context = {
      object_type_id: "Trail",
      object_type: trail,
      selected_object_ids: ["trail-1", "trail-1", "trail-2"],
      object_set_id: "set-trails",
      object_set_name: "Trail selection",
      can_view_objects: true,
    };
    const prefill = buildObjectExplorerActionPrefill(assignAction, context, { max_action_selection_count: 1000 });
    expect(prefill).toMatchObject({
      initial_parameters: { targets: ["trail-1", "trail-2"] },
      hidden_params: ["targets"],
      batch_target_object_ids: [],
      blocked_reason: "",
      selection_count: 2,
    });

    const singleTargetAction = { ...assignAction, id: "update-trail", input_schema: [{ name: "target", property_type: "object_reference", required: true }] };
    expect(buildObjectExplorerActionPrefill(singleTargetAction, { ...context, selected_object_ids: ["trail-1"] })).toMatchObject({
      initial_parameters: { target: "trail-1" },
      target_object_id: "trail-1",
      hidden_params: ["target"],
    });
    expect(buildObjectExplorerActionPrefill(assignAction, { ...context, selected_object_ids: Array.from({ length: 1001 }, (_, index) => `trail-${index}`) }, { max_action_selection_count: 1000 }).blocked_reason).toContain("1000");

    const openIn = buildObjectExplorerOpenInAffordances(context);
    expect(openIn.find((entry) => entry.id === "map")).toMatchObject({ enabled: true, href: expect.stringContaining("/geospatial?") });
    expect(openIn.find((entry) => entry.id === "object_views")?.href).toContain("object=trail-1");

    const exports = buildObjectExplorerExportAffordances(context, { max_export_selection_count: 10 });
    expect(exports.map((entry) => [entry.id, entry.enabled])).toEqual([
      ["copy_ids", true],
      ["csv", true],
      ["json", true],
    ]);
    expect(buildObjectExplorerExportAffordances({ ...context, can_view_objects: false })[1]).toMatchObject({
      enabled: false,
      reason: "Object data is restricted for this selection.",
    });
  });

  it("builds Object Explorer linked filter, object reference, and pivot contracts", () => {
    const trailCampsite: LinkType = {
      id: "trail-campsite",
      name: "TrailCampsite",
      display_name: "Trail campsites",
      description: "",
      source_type_id: "Trail",
      target_type_id: "Campsite",
      cardinality: "one_to_many",
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };
    const hiddenLink: LinkType = {
      ...trailCampsite,
      id: "hidden-link",
      name: "HiddenLink",
      display_name: "Hidden link",
      visibility: "hidden",
    };

    expect(objectExplorerLinkedTargetForType(trailCampsite, "Trail")).toMatchObject({
      target_object_type_id: "Campsite",
      direction: "outgoing",
      reverse_direction: "incoming",
      traversal_direction: "outbound",
      reverse_traversal_direction: "inbound",
    });
    expect(objectExplorerLinksForType([trailCampsite, hiddenLink], "Trail", new Set(["Campsite"])).map((link) => link.id)).toEqual(["trail-campsite"]);

    const linkedFilter = buildObjectExplorerLinkedFilterQuery({
      base_object_type_id: "Trail",
      anchor_object_ids: ["camp-1", "camp-1", "camp-2"],
      link_type: trailCampsite,
    });
    expect(linkedFilter?.search_around).toEqual({
      source_object_ids: ["camp-1", "camp-2"],
      link_type_id: "trail-campsite",
      link_type_ids: ["trail-campsite"],
      direction: "incoming",
      depth: 1,
      target_object_type_id: "Trail",
    });

    const pivot = buildObjectExplorerPivotQuery({
      source_object_type_id: "Trail",
      source_object_ids: ["trail-1"],
      link_type: trailCampsite,
    });
    expect(pivot).toMatchObject({
      target_object_type_id: "Campsite",
      search_around: {
        source_object_ids: ["trail-1"],
        direction: "outgoing",
        target_object_type_id: "Campsite",
      },
    });

    const saved = buildObjectExplorerPivotObjectSetDraft({
      result_object_ids: ["camp-1", "camp-2"],
      result_object_type_id: "Campsite",
      source_object_type_id: "Trail",
      source_object_ids: ["trail-1"],
      link_type: trailCampsite,
    });
    expect(saved.filters).toEqual([{ field: "id", operator: "in", value: ["camp-1", "camp-2"] }]);
    expect(saved.traversals).toEqual([{ direction: "inbound", link_type_id: "trail-campsite", target_object_type_id: "Trail", max_hops: 1 }]);
  });
});

describe("interface actions and multi-datasource helpers", () => {
  it("merges interface actions and blocks primary-key interface edits", () => {
    const iface = { id: "TicketInterface", name: "Ticket", display_name: "Ticket", description: "", owner_id: "owner", created_at: now, updated_at: now };
    const objectAction = {
      id: "object-action", name: "close_case", display_name: "Close case", description: "", object_type_id: "Case", operation_kind: "update_object" as const, input_schema: [], form_schema: {}, config: {}, confirmation_required: false, permission_key: null, authorization_policy: {}, owner_id: "owner", created_at: now, updated_at: now,
    };
    const interfaceAction = {
      id: "interface-action", name: "retitle_ticket", display_name: "Retitle ticket", description: "", object_type_id: iface.id, interface_id: iface.id, operation_kind: "modify_interface" as const, input_schema: [{ name: "case_id", property_type: "string", required: true }], form_schema: {}, config: {}, confirmation_required: false, permission_key: null, authorization_policy: {}, owner_id: "owner", created_at: now, updated_at: now,
    };

    expect(mergeApplicableInterfaceActions([objectAction], [objectAction, interfaceAction], [iface]).map((action) => action.id)).toEqual(["object-action", "interface-action"]);
    expect(validateInterfaceActionRestrictions(interfaceAction, { objectType: objectType({ primary_key_property: "case_id" }) })).toMatchObject({ valid: false });

    const staticPatchAction = {
      ...interfaceAction,
      input_schema: [],
      config: { static_patch: { case_id: "new-id" } },
    };
    expect(validateInterfaceActionRestrictions(staticPatchAction, { objectType: objectType({ primary_key_property: "case_id" }) })).toMatchObject({ valid: false });
  });

  it("summarizes property provenance and validates MDO primary key consistency", () => {
    const bindings = [
      { id: "b1", object_type_id: "Case", dataset_id: "ds_cases", primary_key_column: "case_id", property_mapping: [{ source_field: "status", target_property: "status", null_when_inaccessible: true }], sync_mode: "view" as const, default_marking: "public", preview_limit: 10, owner_id: "owner", created_at: now, updated_at: now },
      { id: "b2", object_type_id: "Case", dataset_id: "ds_secure", primary_key_column: "case_key", property_mapping: [{ source_field: "risk", target_property: "risk" }], sync_mode: "view" as const, default_marking: "restricted", preview_limit: 10, owner_id: "owner", created_at: now, updated_at: now },
    ];

    expect(bindingDatasourceProvenance(bindings).get("status")?.[0]).toMatchObject({ dataset_id: "ds_cases", source_field: "status" });
    expect(validateMultiDatasourcePrimaryKeys(bindings)).toMatchObject({ valid: false, primary_key_columns: ["case_id", "case_key"] });
    expect(maskObjectPropertiesForDatasourceAccess(
      { id: "case-1", object_type_id: "Case", properties: { status: "open", risk: "high" }, created_by: "owner", created_at: now, updated_at: now },
      bindings,
      ["ds_secure"],
    ).properties.status).toBeNull();
  });
});

describe("interface modeling helpers", () => {
  it("validates required property and link constraint mappings for implementations", () => {
    const requiredProperty = {
      id: "iface-prop-status",
      interface_id: "iface-1",
      name: "status",
      display_name: "Status",
      description: "Required status",
      property_type: "string",
      required: true,
      unique_constraint: false,
      time_dependent: false,
      default_value: null,
      validation_rules: null,
      created_at: now,
      updated_at: now,
    };
    const requiredConstraint = {
      id: "constraint-owner",
      interface_id: "iface-1",
      api_name: "owner",
      display_name: "Owner",
      description: "Required owner link",
      target_kind: "object_type" as const,
      target_id: "Person",
      cardinality: "one" as const,
      required: true,
      created_at: now,
      updated_at: now,
    };

    expect(validateInterfaceImplementation({
      properties: [requiredProperty],
      linkConstraints: [requiredConstraint],
      implementation: null,
    })).toMatchObject({ valid: false, missing_properties: [requiredProperty], missing_link_constraints: [requiredConstraint] });

    expect(validateInterfaceImplementation({
      properties: [requiredProperty],
      linkConstraints: [requiredConstraint],
      implementation: {
        interface_id: "iface-1",
        object_type_id: "Case",
        property_mappings: [{ interface_property_id: requiredProperty.id, interface_property_name: "status", object_property_name: "case_status" }],
        link_mappings: [{ constraint_id: requiredConstraint.id, link_type_id: "case-owner-link" }],
        updated_at: now,
      },
    }).valid).toBe(true);
  });
});

describe("shared property and value type helpers", () => {
  it("summarizes shared property usage and warns on multi-binding edits", () => {
    const shared = {
      id: "shared-start-date",
      name: "start_date",
      display_name: "Start date",
      description: "Reusable start date",
      property_type: "date",
      required: false,
      unique_constraint: false,
      time_dependent: false,
      default_value: null,
      validation_rules: null,
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };
    const usage = sharedPropertyUsageSummary(shared.id, {
      objectTypes: [
        objectType({ id: "Employee", properties: [property({ shared_property_type_id: shared.id })] }),
        objectType({ id: "Contractor", properties: [property({ shared_property_type_id: shared.id })] }),
      ],
      interfaces: [],
    });

    expect(usage.total).toBe(2);
    expect(sharedPropertyImpactWarning(shared, usage)).toContain("affects 2");
  });

  it("validates values against reusable value type constraints and reports usage", () => {
    const valueType = {
      id: "value-type:default:email",
      name: "email",
      display_name: "Email",
      description: "Email address",
      space_id: "default",
      base_type: "string",
      semantic_type: "email",
      constraints: { regex: "^[^@]+@[^@]+\\.[^@]+$" },
      formatting: {},
      permissions: {},
      version: 1,
      versions: [],
      status: "active",
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };

    expect(validateValueAgainstValueType("bad", valueType)).toHaveLength(1);
    expect(validateValueAgainstValueType("user@example.com", valueType)).toEqual([]);
    expect(valueTypeUsageSummary(valueType.id, {
      objectTypes: [objectType({ id: "Employee", properties: [property({ value_type_id: valueType.id })] })],
      sharedPropertyTypes: [],
      interfaces: [],
    }).total).toBe(1);
  });
});

describe("object view form factor helpers", () => {
  it("derives consistent Object View titles, primary keys, and full-view URLs", () => {
    const type = objectType({
      id: "Race",
      primary_key_property: "race_id",
      title_property: "race_name",
    });
    const object = {
      id: "object-1234567890",
      object_type_id: "Race",
      properties: {
        race_id: "R-100",
        race_name: "Golden Gate Trail Run",
      },
      created_by: "tester",
      created_at: now,
      updated_at: now,
    };

    expect(objectViewTitle(object, type)).toBe("Golden Gate Trail Run");
    expect(objectViewPrimaryKey(object, type)).toBe("R-100");
    expect(objectViewFullHref(object)).toBe("/ontology/Race?object=object-1234567890");
    expect(objectViewFullHref("Race", "object-1234567890")).toBe("/ontology/Race?object=object-1234567890");
    expect(objectViewTitle({ ...object, properties: { label: "Fallback label" } }, type)).toBe("Fallback label");
  });

  it("generates Object View URLs by primary key, object ID, branch, tab, and embed mode", () => {
    const type = objectType({
      id: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const object = {
      id: "ri.object.main.001",
      object_type_id: "Trail",
      properties: {
        trail_id: "TR/001",
        name: "Highline",
      },
      created_by: "tester",
      created_at: now,
      updated_at: now,
    };

    const variants = buildObjectViewUrlVariants({
      objectType: type,
      object,
      mode: "configured",
      formFactor: "full",
      branchLabel: "feature/a",
      tabId: "overview",
      preferPrimaryKey: true,
      embedHost: "external_iframe",
    });

    expect(objectViewPrimaryKeyProperty(type)).toBe("trail_id");
    expect(objectViewPrimaryKeyValue(object, type)).toBe("TR/001");
    expect(variants.selected_locator).toBe("primary_key");
    expect(variants.by_primary_key).toBe("/object-views?type=Trail&trail_id=TR%2F001&primaryKey=trail_id&mode=configured&factor=full&branch=feature%2Fa&tab=overview");
    expect(variants.by_object_id).toBe("/object-views?type=Trail&object=ri.object.main.001&mode=configured&factor=full&branch=feature%2Fa&tab=overview");
    expect(variants.embedded_by_primary_key).toBe("/object-views?type=Trail&trail_id=TR%2F001&primaryKey=trail_id&mode=configured&factor=full&branch=feature%2Fa&tab=overview&embedded=true");
    expect(objectViewConfiguredHref({
      objectType: type,
      object,
      formFactor: "panel",
      branchLabel: "feature/a",
      tabId: "overview",
      embedded: true,
      preferPrimaryKey: false,
    })).toBe("/object-views?type=Trail&object=ri.object.main.001&mode=configured&factor=panel&branch=feature%2Fa&tab=overview&embedded=true");
  });

  it("parses Object View URL state and blocks unknown embed hosts by policy", () => {
    const type = objectType({
      id: "Trail",
      primary_key_property: "trail_id",
    });
    const state = parseObjectViewUrlSearch(
      "?type=Trail&trail_id=TR-1&primaryKey=trail_id&mode=standard&factor=panel&branch=draft&tab=details&embedded=true",
      type,
    );

    expect(state).toEqual({
      object_type_id: "Trail",
      object_id: null,
      primary_key_property: "trail_id",
      primary_key_value: "TR-1",
      mode: "standard",
      form_factor: "panel",
      branch_label: "draft",
      tab_id: "details",
      embedded: true,
    });
    expect(objectViewEmbedPolicy("external_iframe")).toMatchObject({ allowed: true, hides_workspace_chrome: true });
    expect(objectViewEmbedPolicy("unknown-host")).toMatchObject({ allowed: false, hides_workspace_chrome: false });
  });

  it("builds object-scoped comment threads with mentions, attachments, notifications, and activity", () => {
    const type = objectType({
      id: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const object = {
      id: "trail-1",
      object_type_id: "Trail",
      properties: { name: "Highline" },
      created_by: "builder",
      created_at: now,
      updated_at: now,
    };
    const principal = {
      user_id: "builder",
      email: "builder@example.com",
      roles: ["ontology-viewer"],
      permissions: ["datasource:dataset-trails:view"],
    };
    const accessPolicy = buildObjectInstanceViewPolicy({ objectType: type, principal });
    const thread = buildObjectCommentThread({
      objectType: type,
      object,
      principal,
      accessPolicy,
      commentsEnabled: true,
      surface: "object_view",
      now,
    });

    expect(thread).toMatchObject({
      id: objectCommentThreadKey("Trail", "trail-1", "object_view"),
      scope: "object",
      surface: "object_view",
      workshop_widget_thread_id: "workshop-comments:Trail:trail-1",
      permissions: {
        can_view: true,
        can_comment: true,
        object_explorer_distinct_from_workshop: true,
      },
    });
    expect(extractObjectCommentMentions("Review this @mira and @MIRA with @ops-team")).toEqual([
      { id: "mira", handle: "mira", display_name: "mira" },
      { id: "ops-team", handle: "ops-team", display_name: "ops team" },
    ]);
    expect(normalizeObjectCommentAttachments([
      { name: "screenshot.png" },
      { name: "handoff.pdf", size_bytes: 1024 },
    ]).map((attachment) => `${attachment.kind}:${attachment.name}`)).toEqual([
      "image:screenshot.png",
      "file:handoff.pdf",
    ]);

    const added = appendObjectComment(thread, {
      body: "Please review this @mira",
      principal,
      authorDisplayName: "Builder",
      attachments: [{ name: "screenshot.png" }, { name: "handoff.pdf", size_bytes: 1024 }],
      now,
    });
    expect(added.error).toBeUndefined();
    expect(added.comment?.mentions.map((mention) => mention.id)).toEqual(["mira"]);
    expect(added.comment?.attachments.map((attachment) => attachment.kind)).toEqual(["image", "file"]);
    expect(added.notifications).toMatchObject([{ recipient_id: "mira", channel: "in_app" }]);
    expect(added.thread.activity.map((event) => event.kind)).toEqual([
      "thread_created",
      "comment_created",
      "mention_added",
      "attachment_added",
      "attachment_added",
      "notification_queued",
    ]);

    const comment = added.comment!;
    expect(objectCommentEntryPermissions(added.thread, comment, principal)).toMatchObject({ can_edit: true, can_delete: true });
    expect(objectCommentEntryPermissions(added.thread, comment, { user_id: "other", roles: [], permissions: [] })).toMatchObject({ can_edit: false, can_delete: false });

    const edited = editObjectComment(added.thread, {
      commentId: comment.id,
      body: "Updated @mira",
      principal,
      now: "2026-05-11T01:00:00Z",
    });
    expect(edited.comment?.edited_at).toBe("2026-05-11T01:00:00Z");
    const deniedDelete = deleteObjectComment(edited.thread, {
      commentId: comment.id,
      principal: { user_id: "other", roles: [], permissions: [] },
      now: "2026-05-11T02:00:00Z",
    });
    expect(deniedDelete.error).toContain("author");
    const deleted = deleteObjectComment(edited.thread, {
      commentId: comment.id,
      principal,
      now: "2026-05-11T02:00:00Z",
    });
    expect(deleted.comment?.deleted_at).toBe("2026-05-11T02:00:00Z");
    expect(deleted.comment?.body).toBe("");
  });

  it("hides object comments when object data is schema-only and separates Workshop comment widgets", () => {
    const type = objectType({
      id: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const viewer = { roles: ["ontology-viewer"], permissions: [] };
    const accessPolicy = buildObjectInstanceViewPolicy({ objectType: type, principal: viewer });
    const thread = buildObjectCommentThread({
      objectType: type,
      objectId: "trail-1",
      principal: viewer,
      accessPolicy,
      commentsEnabled: true,
      surface: "object_explorer",
      now,
    });
    expect(thread.permissions).toMatchObject({
      can_view: false,
      can_comment: false,
      object_explorer_distinct_from_workshop: true,
    });
    expect(appendObjectComment(thread, { body: "hidden", principal: viewer, now }).error).toContain("Backing datasource");

    const workshopDecision = buildObjectCommentPermissionDecision({
      objectType: type,
      accessPolicy: {
        ...accessPolicy,
        can_view_instances: true,
        schema_only: false,
      },
      principal: viewer,
      commentsEnabled: true,
      surface: "workshop_widget",
    });
    expect(workshopDecision).toMatchObject({
      can_view: false,
      can_comment: false,
      object_explorer_distinct_from_workshop: false,
    });
    expect(workshopDecision.reason).toContain("Workshop Comment widgets");
  });
});

describe("ontology property formatting helpers", () => {
  it("orders prominent properties and hides hidden properties for Object Views", () => {
    const visible = objectViewVisibleProperties([
      property({ id: "normal", name: "normal", display_mode: "normal" }),
      property({ id: "hidden", name: "hidden", display_mode: "hidden" }),
      property({ id: "prominent", name: "prominent", display_mode: "prominent" }),
    ]);

    expect(visible.map((entry) => entry.name)).toEqual(["prominent", "normal"]);
  });

  it("formats values and applies conditional formatting rules", () => {
    const amount = property({
      property_type: "decimal",
      value_formatting: {
        style: "currency",
        currency: "USD",
        maximum_fraction_digits: 0,
      },
      conditional_formatting: [
        { operator: "gte", value: 1000, color: "#065f46", font_weight: "700" },
      ],
    });

    expect(formatPropertyValue(amount, 1234.5)).toBe("$1,235");
    expect(propertyConditionalStyle(amount, 1234.5)).toMatchObject({
      color: "#065f46",
      fontWeight: "700",
    });
  });
});

describe("ontology link type helpers", () => {
  it("formats cardinality, endpoint labels, and many-to-many datasource mapping state", () => {
    const link = {
      id: "link-1",
      name: "TrailRace",
      display_name: "Trail race",
      description: "",
      source_type_id: "Trail",
      target_type_id: "Race",
      cardinality: "many_to_many",
      label: "has races",
      reverse_label: "uses trail",
      link_datasource_mapping: {
        datasource_id: "dataset.links",
        source_key: "trail_id",
        target_key: "race_id",
      },
      owner_id: "owner-1",
      created_at: now,
      updated_at: now,
    };

    expect(linkTypeCardinalityLabel(link.cardinality)).toBe("Many-to-many");
    expect(linkTypeEndpointLabels(link)).toEqual({
      forward: "has races",
      reverse: "uses trail",
    });
    expect(linkTypeHasDatasourceMapping(link)).toBe(true);
    expect(
      linkTypeHasDatasourceMapping({
        cardinality: "many_to_many",
        link_datasource_mapping: { datasource_id: "dataset.links" },
      }),
    ).toBe(false);
    expect(
      linkTypeHasDatasourceMapping({
        cardinality: "one_to_many",
        link_datasource_mapping: null,
      }),
    ).toBe(true);
  });
});

describe("prominent property presentation helpers", () => {
  it("classifies prominent property renderers by semantic type", () => {
    expect(prominentPropertyPresentation(property({ property_type: "media_reference" }))).toBe("media");
    expect(prominentPropertyPresentation(property({ property_type: "time_series" }))).toBe("time_series");
    expect(prominentPropertyPresentation(property({ property_type: "geopoint" }))).toBe("map");
    expect(prominentPropertyPresentation(property({ property_type: "string" }))).toBe("card");
  });
});

describe("core object view helpers", () => {
  it("generates full and panel core views from current type metadata", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
      properties: [
        property({ name: "trail_id", display_mode: "normal" }),
        property({ name: "name", display_mode: "prominent" }),
        property({ name: "difficulty", display_mode: "normal" }),
        property({ name: "internal_note", display_mode: "hidden" }),
      ],
    });

    const views = buildCoreObjectViews({
      objectTypes: [type],
      linkTypes: [
        {
          id: "visible-link",
          name: "TrailRace",
          display_name: "Trail race",
          description: "",
          source_type_id: "Trail",
          target_type_id: "Race",
          cardinality: "many_to_many",
          visibility: "normal",
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "hidden-link",
          name: "TrailSecret",
          display_name: "Trail secret",
          description: "",
          source_type_id: "Trail",
          target_type_id: "Secret",
          cardinality: "many_to_many",
          visibility: "hidden",
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
      ],
    });

    expect(views.map((view) => view.form_factor)).toEqual(["full", "panel"]);
    expect(views.every((view) => view.mode === "standard" && view.status === "core")).toBe(true);
    expect(views[0].config?.prominent_properties).toEqual(["name"]);
    expect(views[0].config?.metadata?.normal_properties).toEqual(["trail_id", "difficulty"]);
    expect(views[0].config?.metadata?.link_type_ids).toEqual(["visible-link"]);
    expect(views[0].config?.metadata?.primary_key_property).toBe("trail_id");
  });
});

describe("default custom object view helpers", () => {
  it("generates synchronized full and panel defaults from object type metadata", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      api_name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal", required: true }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent", searchable: true }),
      property({ id: "trail-difficulty", name: "difficulty", display_name: "Difficulty", display_mode: "normal" }),
      property({ id: "trail-secret", name: "internal_note", display_name: "Internal note", display_mode: "hidden" }),
    ];
    const linkTypes: LinkType[] = [
      {
        id: "visible-link",
        name: "TrailRace",
        display_name: "Trail race",
        description: "",
        source_type_id: "Trail",
        target_type_id: "Race",
        cardinality: "many_to_many",
        visibility: "normal",
        owner_id: "owner-1",
        created_at: now,
        updated_at: now,
      },
      {
        id: "hidden-link",
        name: "TrailSecret",
        display_name: "Trail secret",
        description: "",
        source_type_id: "Trail",
        target_type_id: "Secret",
        cardinality: "many_to_many",
        visibility: "hidden",
        owner_id: "owner-1",
        created_at: now,
        updated_at: now,
      },
    ];

    const views = buildDefaultCustomObjectViews({
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes,
      now,
    });
    const full = views.find((view) => view.form_factor === "full");
    const panel = views.find((view) => view.form_factor === "panel");

    expect(views).toHaveLength(2);
    expect(full).toMatchObject({ mode: "configured", status: "default_synced", published: true });
    expect(full?.config?.prominent_properties).toEqual(["name"]);
    expect(full?.config?.panel_properties).toEqual(["name", "trail_id"]);
    expect(full?.config?.sections.map((section) => section.kind)).toEqual(["summary", "properties", "links"]);
    expect(full?.config?.metadata?.link_type_ids).toEqual(["visible-link"]);
    expect(full?.config?.default_sync).toMatchObject({
      enabled: true,
      state: "synced",
      property_names: ["name"],
      panel_property_names: ["name", "trail_id"],
      link_type_ids: ["visible-link"],
    });
    expect(full?.config?.object_view_version).toBe(1);
    expect(full?.config?.workshop_module_version).toBe(1);
    expect(full?.config?.tabs?.[0]).toMatchObject({
      id: "overview",
      title: "Overview",
      visibility: "visible",
      hidden_in_runtime_when_single: true,
      module: {
        form_factor: "full",
        object_context_parameter: "selectedObject",
        version: 1,
        source: "generated_default",
      },
    });
    expect(full?.config?.tabs?.[0]?.module.widgets.map((widget) => widget.kind)).toEqual(["summary", "properties", "links"]);
    expect(panel?.config?.sections.map((section) => section.kind)).toEqual(["summary", "properties"]);
    expect(panel?.config?.panel_properties).not.toContain("internal_note");
  });

  it("falls back to all non-hidden properties and preserves manually edited defaults", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "normal" }),
      property({ id: "trail-hidden", name: "hidden", display_name: "Hidden", display_mode: "hidden" }),
    ];
    const manualConfig = markObjectViewConfigManuallyEdited(
      buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties,
        linkTypes: [],
        formFactor: "full",
        now,
      }),
      now,
    );
    const manualFull = {
      id: "manual-full",
      name: "TrailManagedFull",
      display_name: "Trail managed full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      config: manualConfig,
      created_at: now,
      updated_at: now,
    };

    const views = buildDefaultCustomObjectViews({
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      existingViews: [manualFull],
      now,
    });
    const fullViews = views.filter((view) => view.form_factor === "full");
    const panel = views.find((view) => view.form_factor === "panel");

    expect(manualConfig.prominent_properties).toEqual(["trail_id", "name"]);
    expect(fullViews).toEqual([manualFull]);
    expect(fullViews[0].config?.default_sync?.state).toBe("manual");
    expect(panel?.status).toBe("default_synced");
    expect(panel?.config?.panel_properties).toEqual(["name", "trail_id"]);
  });

  it("hydrates the Object View editor shell around existing configured views", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [
        property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal" }),
        property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
      ],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    const shell = ensureObjectViewEditorShell({
      objectType: type,
      config: {
        ...config,
        selected_tab_id: "details",
        tabs: [
          {
            id: "overview",
            title: "Overview",
            order: 0,
            visibility: "visible",
            module: {
              id: "module-overview",
              name: "OverviewModule",
              display_name: "Overview module",
              version: 2,
              form_factor: "full",
              object_context_parameter: "selectedObject",
              source: "user_managed",
              widgets: [],
              updated_at: now,
            },
          },
          {
            id: "details",
            title: "Details",
            order: 1,
            visibility: "conditional",
            module: {
              id: "module-details",
              name: "DetailsModule",
              display_name: "Details module",
              version: 4,
              form_factor: "full",
              object_context_parameter: "selectedObject",
              source: "user_managed",
              widgets: [],
              updated_at: now,
            },
          },
        ],
      },
      formFactor: "full",
      now,
    });

    expect(shell.object_view_version).toBe(1);
    expect(shell.selected_tab_id).toBe("details");
    expect(shell.workshop_module_version).toBe(4);
    expect(shell.tabs?.map((tab) => tab.title)).toEqual(["Overview", "Details"]);
    expect(shell.tabs?.[1].module.widgets.map((widget) => widget.kind)).toEqual(["summary", "properties"]);
  });

  it("adds, reorders, renames, hides, and deletes full Object View tabs with Workshop modules", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const base = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [
        property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal" }),
        property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
      ],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    const withDetails = addObjectViewTab({ objectType: type, config: base, title: "Details", now });
    expect(withDetails.selected_tab_id).toBe("details");
    expect(withDetails.tabs?.map((tab) => tab.title)).toEqual(["Overview", "Details"]);
    expect(withDetails.tabs?.[1].module).toMatchObject({
      object_context_parameter: "selectedObject",
      source: "user_managed",
      version: 1,
    });

    const withRenamed = renameObjectViewTab({
      objectType: type,
      config: withDetails,
      tabId: "details",
      title: "Operations",
      now,
    });
    expect(withRenamed.tabs?.[1]).toMatchObject({
      id: "details",
      title: "Operations",
      module: { display_name: "Trail Operations module" },
    });

    const moved = moveObjectViewTab({
      objectType: type,
      config: withRenamed,
      tabId: "details",
      direction: "up",
      now,
    });
    expect(moved.tabs?.map((tab) => `${tab.order}:${tab.title}`)).toEqual(["0:Operations", "1:Overview"]);

    const hidden = setObjectViewTabVisibility({
      objectType: type,
      config: moved,
      tabId: "details",
      visibility: "hidden",
      now,
    });
    expect(objectViewRuntimeTabs(hidden).map((tab) => tab.title)).toEqual(["Overview"]);

    const deleted = deleteObjectViewTab({
      objectType: type,
      config: hidden,
      tabId: "details",
      now,
    });
    expect(deleted.tabs?.map((tab) => tab.title)).toEqual(["Overview"]);
    expect(deleted.selected_tab_id).toBe("overview");
  });

  it("hides single full-view tab titles only at runtime", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" })],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    expect(objectViewRuntimeTabs(config).map((tab) => tab.runtime_title_visible)).toEqual([false]);
    expect(objectViewRuntimeTabs(config, { editMode: true }).map((tab) => tab.runtime_title_visible)).toEqual([true]);

    const withSecondTab = addObjectViewTab({ objectType: type, config, title: "Details", now });
    expect(objectViewRuntimeTabs(withSecondTab).map((tab) => tab.runtime_title_visible)).toEqual([true, true]);
  });

  it("keeps panel content and embedding settings separate from full Object View tabs", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [
        property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal" }),
        property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
        property({ id: "trail-rating", name: "rating", display_name: "Rating", searchable: true }),
      ],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    expect(config.prominent_properties).toEqual(["name"]);
    expect(config.tabs?.[0]).toMatchObject({ id: "overview", module: { form_factor: "full" } });
    expect(config.panel_config).toMatchObject({
      density: "compact",
      property_names: ["name", "trail_id", "rating"],
      section_kinds: ["summary", "properties"],
      show_title: true,
      show_open_full_view: true,
      workshop_widget: {
        enabled: true,
        selected_object_parameter: "selectedObject",
      },
    });
    expect(config.panel_config?.hosts.map((host) => host.host)).toEqual([
      "object_explorer",
      "workshop",
      "map",
      "vertex",
      "gaia",
      "object_detail_drawer",
      "action_success_toast",
    ]);

    const panelOnly = ensurePanelObjectViewConfiguration({
      objectType: type,
      config: {
        ...config,
        panel_properties: ["trail_id"],
        panel_config: {
          ...config.panel_config!,
          property_names: ["trail_id"],
        },
      },
    });
    expect(panelOnly.prominent_properties).toEqual(["name"]);
    expect(panelOnly.panel_config?.property_names).toEqual(["trail_id"]);
    expect(panelOnly.tabs?.[0].module.form_factor).toBe("full");
  });

  it("builds compact panel runtime title and open-full-view behavior for embedded hosts", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [
        property({ id: "trail-id", name: "trail_id", display_name: "Trail ID", display_mode: "normal" }),
        property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
      ],
      linkTypes: [],
      formFactor: "panel",
      now,
    });
    const runtime = buildPanelObjectViewRuntimeConfig({
      objectType: type,
      config,
      object: {
        id: "trail-1",
        object_type_id: "Trail",
        properties: { trail_id: "TR-001", name: "Highline" },
        created_by: "user",
        created_at: now,
        updated_at: now,
      },
      summary: { name: "Highline", trail_id: "TR-001" },
      host: "workshop",
    });

    expect(runtime.title).toBe("Highline");
    expect(runtime.embed_supported).toBe(true);
    expect(runtime.selected_object_parameter).toBe("selectedObject");
    expect(runtime.open_full_view_href).toBe("/object-views?type=Trail&object=trail-1&mode=configured&factor=full");
    expect(runtime.workshop_widget).toMatchObject({
      enabled: true,
      widget_id: "object-view-widget:Trail:panel",
      selected_object_parameter: "selectedObject",
    });
    expect(objectViewConfiguredHref({
      objectTypeId: "Trail",
      objectId: "trail-1",
      formFactor: "panel",
      branchLabel: "draft",
      tabId: "panel",
    })).toBe("/object-views?type=Trail&object=trail-1&mode=configured&factor=panel&branch=draft&tab=panel");
  });

  it("defaults to custom Object Views while keeping core toggleable in supported hosts", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const views = [
      ...buildCoreObjectViews({ objectTypes: [type], propertiesByObjectType: { Trail: properties } }),
      ...buildDefaultCustomObjectViews({
        objectTypes: [type],
        propertiesByObjectType: { Trail: properties },
        existingViews: [],
        now,
      }),
    ];

    const defaultResolution = resolveObjectViewModeToggle({
      views,
      objectTypeId: "Trail",
      formFactor: "full",
      host: "object_explorer",
    });
    expect(defaultResolution).toMatchObject({
      supports_toggle: true,
      default_mode: "configured",
      selected_mode: "configured",
      custom_is_default: true,
      requested_mode_ignored: false,
    });
    expect(defaultResolution.options.map((option) => `${option.mode}:${option.enabled}:${option.default}`)).toEqual([
      "configured:true:true",
      "standard:true:false",
    ]);

    const coreResolution = resolveObjectViewModeToggle({
      views,
      objectTypeId: "Trail",
      formFactor: "full",
      host: "object_explorer",
      requestedMode: "standard",
    });
    expect(coreResolution.selected_mode).toBe("standard");
    expect(coreResolution.active_view?.mode).toBe("standard");
  });

  it("enforces the local Workshop core/custom toggle limitation", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const views = [
      ...buildCoreObjectViews({ objectTypes: [type] }),
      ...buildDefaultCustomObjectViews({
        objectTypes: [type],
        existingViews: [],
        now,
      }),
    ];

    const resolution = resolveObjectViewModeToggle({
      views,
      objectTypeId: "Trail",
      formFactor: "panel",
      host: "workshop",
      requestedMode: "standard",
    });

    expect(resolution.supports_toggle).toBe(false);
    expect(resolution.selected_mode).toBe("configured");
    expect(resolution.requested_mode_ignored).toBe(true);
    expect(resolution.limitation).toContain("Workshop");
    expect(resolution.options.find((option) => option.mode === "standard")).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("Workshop"),
    });
  });

  it("falls back to core Object Views when no custom view exists", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const resolution = resolveObjectViewModeToggle({
      views: buildCoreObjectViews({ objectTypes: [type] }),
      objectTypeId: "Trail",
      formFactor: "full",
      host: "vertex",
      requestedMode: "configured",
    });

    expect(resolution.default_mode).toBe("standard");
    expect(resolution.selected_mode).toBe("standard");
    expect(resolution.requested_mode_ignored).toBe(true);
    expect(resolution.options.find((option) => option.mode === "configured")).toMatchObject({
      enabled: false,
      reason: "No configured Object View is available for this form factor.",
    });
  });

  it("builds an application embedding matrix with host fallbacks and generated deep links", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const object = {
      id: "trail-1",
      object_type_id: "Trail",
      properties: { trail_id: "TR-001", name: "Highline" },
      created_by: "tester",
      created_at: now,
      updated_at: now,
    };
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const views = [
      ...buildCoreObjectViews({ objectTypes: [type], propertiesByObjectType: { Trail: properties } }),
      ...buildDefaultCustomObjectViews({
        objectTypes: [type],
        propertiesByObjectType: { Trail: properties },
        existingViews: [],
        now,
      }),
    ];

    const matrix = buildObjectViewApplicationEmbeddingMatrix({
      objectType: type,
      object,
      views,
      mode: "configured",
      formFactor: "panel",
      branchLabel: "draft",
      tabId: "overview",
    });
    const byHost = Object.fromEntries(matrix.entries.map((entry) => [entry.host, entry]));

    expect(matrix.summary).toMatchObject({
      hosts: 8,
      full_supported: 8,
      panel_supported: 8,
      host_header_fallbacks: 6,
      generated_deep_links: 3,
    });
    expect(byHost.object_explorer).toMatchObject({
      full_delivery: "embedded",
      panel_delivery: "host_panel",
      uses_host_header: true,
      supports_core_custom_toggle: true,
      selected_mode: "configured",
    });
    expect(byHost.object_explorer.embed_href).toBe("/object-views?type=Trail&object=trail-1&mode=configured&factor=panel&branch=draft&tab=overview&embedded=true");
    expect(byHost.workshop.fallbacks.map((fallback) => fallback.kind)).toEqual([
      "host_header",
      "toggle_unavailable",
      "open_full_view",
    ]);
    expect(byHost.generated_deep_link.full_href).toBe("/object-views?type=Trail&object=trail-1&mode=configured&factor=full&branch=draft&tab=overview");
    expect(byHost.action_success_toast.fallbacks.some((fallback) => fallback.kind === "deep_link_only")).toBe(true);
  });

  it("builds Object View links for action success toasts", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
    });
    const response = {
      action: actionType({ object_type_id: "Trail", operation_kind: "create_or_modify_object" }),
      target_object_id: "trail-1",
      deleted: false,
      preview: null,
      object: { id: "trail-1", object_type_id: "Trail" },
      link: null,
      result: null,
    };

    const link = buildObjectViewActionSuccessToastLink({
      result: response,
      objectTypes: [type],
      branchLabel: "feature/a",
    });

    expect(link).toMatchObject({
      object_type_id: "Trail",
      object_id: "trail-1",
      label: "Open Trail Object View",
      href: "/object-views?type=Trail&object=trail-1&mode=configured&factor=full&branch=feature%2Fa",
      panel_href: "/object-views?type=Trail&object=trail-1&mode=configured&factor=panel&branch=feature%2Fa",
    });
    expect(buildObjectViewActionSuccessToastLink({
      result: { ...response, action: actionType({ operation_kind: "delete_object" }) },
      objectTypes: [type],
    })).toBeNull();
  });

  it("tracks full Object View tabs and OV-managed modules as Global Branch resources", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const config = addObjectViewTab({
      objectType: type,
      config: buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties,
        linkTypes: [],
        formFactor: "full",
        now,
      }),
      title: "Operations",
      now,
    });
    const view = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      branch_label: "museum-branch",
      config,
      updated_at: now,
    };

    const resources = buildObjectViewGlobalBranchResources({
      branchLabel: "museum-branch",
      objectViews: [view],
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes: [],
    });

    expect(resources.map((resource) => resource.kind)).toEqual([
      "full_object_view_tabs",
      "ov_managed_module",
      "ov_managed_module",
      "ov_managed_module",
    ]);
    const tabs = resources.find((resource) => resource.kind === "full_object_view_tabs")!;
    expect(tabs.associated_resource_ids).toHaveLength(2);
    expect(resources.filter((resource) => resource.parent_resource_id === tabs.id).map((resource) => resource.tab_id)).toEqual([
      "operations",
      "overview",
    ]);
    expect(resources.find((resource) => resource.tab_id === "panel:object-instance")).toMatchObject({
      kind: "ov_managed_module",
      branch_label: "museum-branch",
      preview_status: "pending",
    });
  });

  it("runs Object View Global Branch adapter operations through preview, rebase, approval, and merge", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties,
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const view = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      branch_label: "feature/museum",
      config,
      updated_at: now,
    };
    const initial = buildObjectViewGlobalBranchAdapterState({
      branchLabel: "feature/museum",
      objectViews: [view],
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes: [],
    });

    expect(initial.resources.some((resource) => resource.requires_rebase)).toBe(true);
    expect(initial.checks.find((check) => check.id === "rebased-with-main")).toMatchObject({ status: "failed" });

    const removed = applyObjectViewGlobalBranchAdapterOperation(initial, {
      kind: "remove",
      resource_id: initial.resources.find((resource) => resource.kind === "full_object_view_tabs")?.id,
      now,
    });
    expect(removed.warnings[0]).toContain("associated OV-managed tab modules");
    expect(removed.state.resources.filter((resource) => resource.status === "removed").map((resource) => resource.kind)).toEqual([
      "full_object_view_tabs",
      "ov_managed_module",
    ]);

    const rebased = applyObjectViewGlobalBranchAdapterOperation(initial, { kind: "rebase", now });
    expect(rebased.state.resources.every((resource) => !resource.requires_rebase)).toBe(true);
    expect(rebased.state.checks.find((check) => check.id === "rebased-with-main")).toMatchObject({ status: "passed" });

    const previewed = applyObjectViewGlobalBranchAdapterOperation(rebased.state, { kind: "preview", now });
    expect(previewed.state.preview.status).toBe("ready");
    expect(previewed.state.resources.every((resource) =>
      resource.render_ontology_signature === previewed.state.latest_ontology_signature,
    )).toBe(true);

    const approved = applyObjectViewGlobalBranchAdapterOperation(previewed.state, {
      kind: "approve",
      actor_id: "reviewer",
      now,
    });
    expect(approved.state.mergeable).toBe(true);

    const merged = applyObjectViewGlobalBranchAdapterOperation(approved.state, {
      kind: "merge",
      actor_id: "reviewer",
      now,
    });
    expect(merged.errors).toEqual([]);
    expect(merged.state.resources.every((resource) => resource.merge_state === "merged")).toBe(true);
  });

  it("builds Object View rebase UX rows with main, branch, result, auto-accepts, and manual resolutions", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const baseConfig = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties,
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const mainConfig = renameObjectViewTab({
      objectType: type,
      config: { ...baseConfig, branch_label: "main" },
      tabId: "overview",
      title: "Main overview",
      now,
    });
    const branchConfig = addObjectViewTab({
      objectType: type,
      config: renameObjectViewTab({
        objectType: type,
        config: { ...baseConfig, branch_label: "feature/museum" },
        tabId: "overview",
        title: "Branch overview",
        now,
      }),
      title: "Operations",
      now,
    });
    const mainView = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      branch_label: "main",
      config: mainConfig,
      updated_at: now,
    };
    const branchView = {
      ...mainView,
      branch_label: "feature/museum",
      config: branchConfig,
    };

    const unresolved = buildObjectViewGlobalBranchRebaseModel({
      branchLabel: "feature/museum",
      mainObjectViews: [mainView],
      branchObjectViews: [branchView],
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes: [],
    });

    expect(unresolved.rows.some((row) => row.main_state && row.branch_state && row.requires_manual_resolution)).toBe(true);
    expect(unresolved.rows.some((row) => row.auto_accepted && row.branch_state?.summary.includes("Operations"))).toBe(true);
    expect(unresolved.can_finish).toBe(false);

    const resolutions = Object.fromEntries(
      unresolved.rows
        .filter((row) => row.requires_manual_resolution)
        .map((row) => [row.resource_id, "branch" as const]),
    );
    const resolved = buildObjectViewGlobalBranchRebaseModel({
      branchLabel: "feature/museum",
      mainObjectViews: [mainView],
      branchObjectViews: [branchView],
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes: [],
      resolutions,
    });
    expect(resolved.can_finish).toBe(true);
    expect(resolved.manual_resolution_count).toBeGreaterThan(0);
    expect(resolved.deployability_checks_after_rebase.find((check) => check.id === "rebased-with-main")).toMatchObject({ status: "passed" });

    const state = buildObjectViewGlobalBranchAdapterState({
      branchLabel: "feature/museum",
      objectViews: [branchView],
      mainObjectViews: [mainView],
      objectTypes: [type],
      propertiesByObjectType: { Trail: properties },
      linkTypes: [],
    });
    const blocked = completeObjectViewGlobalBranchRebase({ state, rebaseModel: unresolved, now });
    expect(blocked.errors[0]).toContain("Resolve Object View rebase conflicts");
    const completed = completeObjectViewGlobalBranchRebase({ state, rebaseModel: resolved, now });
    expect(completed.errors).toEqual([]);
    expect(completed.state.checks.find((check) => check.id === "rebased-with-main")).toMatchObject({ status: "passed" });
    expect(completed.warnings).toContain("Object View deployability checks were rerun after successful rebase.");
  });

  it("integrates ontology resources and Object Views into Global Branching proposals", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const properties = [
      property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
      property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
    ];
    const link: LinkType = {
      id: "trail-link",
      name: "TrailNeighbor",
      display_name: "Trail neighbor",
      description: "",
      source_type_id: "Trail",
      target_type_id: "Trail",
      cardinality: "many_to_many",
      link_datasource_mapping: null,
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    };
    const action = actionType({ id: "rate-trail", object_type_id: "Trail" });
    const ontologyInterface = {
      id: "asset-interface",
      name: "Asset",
      display_name: "Asset",
      description: "",
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    };
    const sharedProperty = {
      id: "shared-status",
      name: "status",
      display_name: "Status",
      description: "",
      property_type: "string",
      required: false,
      unique_constraint: false,
      time_dependent: false,
      default_value: null,
      validation_rules: null,
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    };
    const config = addObjectViewTab({
      objectType: type,
      config: buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties,
        linkTypes: [link],
        formFactor: "full",
        now,
      }),
      title: "Operations",
      now,
    });
    const view = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      branch_label: "feature/museum",
      config,
      updated_at: now,
    };
    const changes: OntologyStagedChange[] = [
      { id: "c-object", kind: "object_type", action: "update", label: "Update Trail", description: "Schema edit", targetId: "Trail", payload: { primary_key_property: "trail_id" }, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
      { id: "c-link", kind: "link_type", action: "update", label: "Update trail link", description: "Link edit", targetId: "trail-link", payload: { source_type_id: "Trail", target_type_id: "Trail" }, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
      { id: "c-action", kind: "action_type", action: "update", label: "Update action", description: "Action edit", targetId: "rate-trail", payload: { object_type_id: "Trail" }, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
      { id: "c-interface", kind: "interface", action: "update", label: "Update interface", description: "Interface edit", targetId: "asset-interface", payload: {}, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
      { id: "c-shared", kind: "shared_property_type", action: "update", label: "Update shared status", description: "Shared property edit", targetId: "shared-status", payload: {}, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
    ];

    const integration = buildOntologyBranchProposalIntegration({
      branchLabel: "feature/museum",
      changes,
      objectTypes: [type],
      linkTypes: [link],
      actionTypes: [action],
      interfaces: [ontologyInterface],
      sharedPropertyTypes: [sharedProperty],
      objectViews: [view],
      propertiesByObjectType: { Trail: properties },
    });

    expect(integration.resources.map((resource) => resource.kind)).toEqual(expect.arrayContaining([
      "object_type",
      "link_type",
      "action_type",
      "interface",
      "shared_property",
      "object_view_tabs",
      "object_view_module",
    ]));
    expect(integration.indexing_changes.some((change) => change.required && change.resource_key === "object_type:Trail")).toBe(true);
    expect(integration.proposal_tasks).toHaveLength(integration.resources.filter((resource) => resource.included).length);
    expect(integration.checks.find((check) => check.id === "object-view:rebased-with-main")).toMatchObject({ status: "failed" });
    expect(integration.preview.status).toBe("blocked");
  });

  it("allows optional proposal resources and indexing changes to be removed before merge", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const changes: OntologyStagedChange[] = [
      { id: "c-object", kind: "object_type", action: "update", label: "Update Trail", description: "", targetId: "Trail", payload: { display_name: "Trail" }, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
      { id: "c-action", kind: "action_type", action: "update", label: "Update action", description: "", targetId: "rate-trail", payload: { object_type_id: "Trail" }, warnings: [], errors: [], source: "test", author: "builder", createdAt: now },
    ];
    const integration = buildOntologyBranchProposalIntegration({
      branchLabel: "feature/museum",
      changes,
      objectTypes: [type],
      actionTypes: [actionType({ id: "rate-trail", object_type_id: "Trail" })],
    });
    const optionalIndexing = integration.indexing_changes.find((change) => change.resource_key === "object_type:Trail")!;
    const actionResource = integration.resources.find((resource) => resource.kind === "action_type")!;
    const trimmed = removeOntologyBranchProposalResources(integration, [optionalIndexing.id, actionResource.id]);

    expect(trimmed.resources.find((resource) => resource.id === actionResource.id)).toMatchObject({ included: false });
    expect(trimmed.indexing_changes.find((change) => change.id === optionalIndexing.id)).toMatchObject({
      included: false,
      status: "removed",
    });
    expect(trimmed.checks.find((check) => check.id === "indexing-changes")).toMatchObject({ status: "warning" });

    const blocked = buildOntologyBranchProposalIntegration({
      branchLabel: "feature/museum",
      changes: [
        { ...changes[0], payload: { primary_key_property: "trail_id" } },
      ],
      objectTypes: [type],
      excludedIndexingChangeIds: ["index:change:c-object"],
    });
    expect(blocked.indexing_changes[0]).toMatchObject({ required: true, included: false, status: "blocked" });
    expect(blocked.mergeable).toBe(false);
  });

  it("packages selected Workshop-backed Object View tabs as Marketplace product outputs", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" })],
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const overview = config.tabs![0];
    const configWithDependencies = {
      ...config,
      tabs: [
        {
          ...overview,
          module: {
            ...overview.module,
            widgets: [
              ...overview.module.widgets,
              {
                id: "risk-action-widget",
                kind: "actions",
                title: "Risk action",
                binding: "selectedObject",
                config: {
                  action_type_id: "rate-trail",
                  function_package_id: "logic.score-trail",
                  dataset_id: "dataset-trails",
                },
              },
            ],
          },
        },
        ...config.tabs!.slice(1),
      ],
    };
    const view = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      config: configWithDependencies,
    };

    const result = buildObjectViewMarketplaceOutput({
      objectView: view,
      objectType: type,
      actionTypes: [actionType({ id: "rate-trail", object_type_id: "Trail" })],
      selectedTabIds: [overview.id],
      availableFunctionIds: ["logic.score-trail"],
      availableDataResourceIds: ["dataset-trails"],
    });

    expect(result.valid).toBe(true);
    expect(result.output).toMatchObject({
      kind: "marketplace_object_view_output",
      name: "Trail full - Overview",
      resource_ref: "object_view:trail-full:tabs:overview",
    });
    expect(result.manifest.object_view_outputs[0]).toMatchObject({
      object_view_id: "trail-full",
      object_type_id: "Trail",
      selected_tab_ids: ["overview"],
      workshop_tab_builder_only: true,
    });
    expect(result.dependencies.map((dependency) => dependency.resource_ref)).toEqual(expect.arrayContaining([
      "object_type:Trail",
      `workshop_module:${overview.module.id}`,
      "workshop_widget:risk-action-widget",
      "action_type:rate-trail",
      "function:logic.score-trail",
      "data_resource:dataset-trails",
    ]));
  });

  it("blocks legacy Object View tab packaging and missing Marketplace dependencies", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const config = {
      ...buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties: [property({ id: "trail-name", name: "name", display_name: "Name" })],
        linkTypes: [],
        formFactor: "full",
        now,
      }),
      metadata: { legacy_builder: true },
    };
    const overview = config.tabs![0];
    const legacyConfig = {
      ...config,
      tabs: [{
        ...overview,
        module: {
          ...overview.module,
          widgets: [{
            id: "legacy-action-widget",
            kind: "actions",
            title: "Legacy action",
            binding: "selectedObject",
            config: { action_type_id: "missing-action", function_package_id: "missing-function" },
          }],
        },
      }],
    };

    const result = buildObjectViewMarketplaceOutput({
      objectView: {
        id: "legacy-view",
        name: "LegacyView",
        display_name: "Legacy view",
        object_type_id: "Trail",
        mode: "configured",
        form_factor: "full",
        config: legacyConfig,
      },
      objectType: type,
      selectedTabIds: [overview.id],
      availableActionTypeIds: [],
      availableFunctionIds: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsupported_legacy_builder",
      "missing_dependency",
    ]));
    expect(result.issues.some((issue) => issue.dependency_ref === "action_type:missing-action")).toBe(true);
    expect(result.issues.some((issue) => issue.dependency_ref === "function:missing-function")).toBe(true);
  });

  it("plans Marketplace Object View install remaps and preserves tabs, modules, permissions, and default status", () => {
    const sourceType = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
      properties: [property({ id: "trail-name", name: "name", display_name: "Name" })],
    });
    const targetType = objectType({
      id: "TrailInstalled",
      name: "Trail",
      display_name: "Trail installed",
      properties: [property({ id: "installed-name", object_type_id: "TrailInstalled", name: "name", display_name: "Name" })],
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: sourceType,
      properties: sourceType.properties || [],
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const tab = config.tabs![0];
    const view = {
      id: "trail-full",
      name: "TrailFull",
      display_name: "Trail full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      config,
    };
    const packaged = buildObjectViewMarketplaceOutput({
      objectView: view,
      objectType: sourceType,
      selectedTabIds: [tab.id],
      availableDataResourceIds: ["dataset-trails"],
    });
    const plan = buildObjectViewMarketplaceInstallPlan({
      manifest: packaged.manifest,
      packagedResources: packaged.packaged_resources,
      targetObjectTypes: [targetType],
      objectTypeRemap: { Trail: "TrailInstalled" },
      availableWorkshopModuleIds: [tab.module.id],
      availableWidgetIds: tab.module.widgets.map((widget) => widget.id),
      installedBy: "installer",
      now,
    });

    expect(plan.valid).toBe(true);
    expect(plan.remaps[0]).toMatchObject({
      source_object_type_id: "Trail",
      target_object_type_id: "TrailInstalled",
      strategy: "explicit",
    });
    expect(plan.preserved).toMatchObject({
      selected_tabs: 1,
      module_dependencies: 1,
      permissions: "object_type_managed",
      custom_view_default_count: 1,
    });
    expect(plan.outputs[0]).toMatchObject({
      target_object_type_id: "TrailInstalled",
      selected_tab_ids: ["overview"],
      permission_model: "object_type_managed",
      custom_view_default: true,
      installed_view: {
        object_type_id: "TrailInstalled",
        published: true,
        status: "default_custom",
      },
    });
    expect(plan.outputs[0].installed_view.config?.tabs?.[0].module.id).toBe(tab.module.id);
  });

  it("reports clear Marketplace Object View install failures for missing resources", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [property({ id: "trail-name", name: "name", display_name: "Name" })],
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const tab = {
      ...config.tabs![0],
      module: {
        ...config.tabs![0].module,
        widgets: [{
          id: "action-widget",
          kind: "actions",
          title: "Action",
          binding: "selectedObject",
          config: { action_type_id: "missing-action", function_package_id: "missing-function" },
        }],
      },
    };
    const packaged = buildObjectViewMarketplaceOutput({
      objectView: {
        id: "trail-full",
        name: "TrailFull",
        display_name: "Trail full",
        object_type_id: "Trail",
        mode: "configured",
        form_factor: "full",
        config: { ...config, tabs: [tab] },
      },
      objectType: type,
      selectedTabIds: [tab.id],
      availableActionTypeIds: ["missing-action"],
      availableFunctionIds: ["missing-function"],
    });
    const legacyManifest = {
      ...packaged.manifest,
      object_view_outputs: packaged.manifest.object_view_outputs.map((entry) => ({
        ...entry,
        legacy_builder_compatibility: true,
        workshop_tab_builder_only: false,
      })),
    };
    const plan = buildObjectViewMarketplaceInstallPlan({
      manifest: legacyManifest,
      packagedResources: packaged.packaged_resources,
      targetObjectTypes: [],
      availableWorkshopModuleIds: [],
      availableWidgetIds: [],
      availableFunctionIds: [],
      availableActionTypeIds: [],
    });

    expect(plan.valid).toBe(false);
    expect(plan.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "missing_object_type",
      "unsupported_tab_builder",
      "missing_workshop_module",
      "unavailable_widget",
      "missing_function",
      "missing_action",
    ]));
    expect(plan.failures.some((failure) => failure.dependency_ref === "object_type:Trail")).toBe(true);
    expect(plan.failures.some((failure) => failure.dependency_ref === "action_type:missing-action")).toBe(true);
    expect(plan.failures.some((failure) => failure.dependency_ref === "function:missing-function")).toBe(true);
  });

  it("saves Object View and active Workshop module edits as one version record", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [
        property({ id: "trail-id", name: "trail_id", display_name: "Trail ID" }),
        property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" }),
      ],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    const saved = saveObjectViewConfigVersion({
      objectType: type,
      config,
      published: true,
      author: "builder@example.com",
      changeSummary: "Add operations tab",
      now,
    });
    const history = objectViewVersionHistory(saved);

    expect(saved.object_view_version).toBe(2);
    expect(saved.workshop_module_version).toBe(2);
    expect(saved.published_version).toBe(2);
    expect(saved.version_history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      object_view_version: 2,
      workshop_module_version: 2,
      author: "builder@example.com",
      change_summary: "Add operations tab",
      publish_state: "published",
      published: true,
      tab_ids: ["overview"],
    });
    expect(history[0].snapshot.object_view_version).toBe(2);
    expect("version_history" in history[0].snapshot).toBe(false);
  });

  it("respects disabled automatic publishing and marks earlier published versions", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const config = {
      ...buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties: [property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" })],
        linkTypes: [],
        formFactor: "full",
        now,
      }),
      auto_publish: false,
    };
    const draft = saveObjectViewConfigVersion({
      objectType: type,
      config,
      author: "builder",
      changeSummary: "Draft tab work",
      now,
    });
    const published = saveObjectViewConfigVersion({
      objectType: type,
      config: draft,
      published: true,
      author: "builder",
      changeSummary: "Publish tab work",
      now: "2026-05-12T00:00:00Z",
    });
    const republished = saveObjectViewConfigVersion({
      objectType: type,
      config: published,
      published: true,
      author: "builder",
      changeSummary: "Republish with wording",
      now: "2026-05-13T00:00:00Z",
    });

    expect(draft.published_version).toBeUndefined();
    expect(objectViewVersionHistory(draft)[0]).toMatchObject({ publish_state: "draft", published: false });
    expect(republished.published_version).toBe(4);
    expect(objectViewVersionHistory(republished).map((version) => version.publish_state)).toEqual([
      "published",
      "previously_published",
      "draft",
    ]);
  });

  it("restores prior custom Object View versions as a new editable draft target", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [property({ id: "trail-name", name: "name", display_name: "Name", display_mode: "prominent" })],
      linkTypes: [],
      formFactor: "full",
      now,
    });
    const v2 = saveObjectViewConfigVersion({
      objectType: type,
      config,
      published: true,
      author: "builder",
      changeSummary: "Initial publish",
      now,
    });
    const v3 = saveObjectViewConfigVersion({
      objectType: type,
      config: {
        ...v2,
        title_template: "{{trail_id}}",
      },
      published: true,
      author: "builder",
      changeSummary: "Change title",
      now: "2026-05-12T00:00:00Z",
    });

    const restored = restoreObjectViewConfigVersion({
      objectType: type,
      config: v3,
      version: 2,
      author: "restorer",
      now: "2026-05-13T00:00:00Z",
    });
    expect(restored.title_template).toBe("{{id}}");
    expect(restored.object_view_version).toBe(3);
    expect(restored.published_version).toBe(3);
    expect(restored.rollback_target_version).toBe(2);
    expect(restored.restored_from_version).toBe(2);

    const savedRestore = saveObjectViewConfigVersion({
      objectType: type,
      config: restored,
      published: false,
      author: "restorer",
      changeSummary: "Restore prior title",
      now: "2026-05-13T01:00:00Z",
    });
    expect(objectViewVersionHistory(savedRestore)[0]).toMatchObject({
      object_view_version: 4,
      publish_state: "draft",
      rollback_target_version: 2,
      restored_from_version: 2,
    });
  });

  it("allows native Object View editing through object type Ontology edit roles", () => {
    const type = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const config = buildDefaultCustomObjectViewConfig({
      objectType: type,
      properties: [property({ id: "trail-name", name: "name", display_name: "Name" })],
      linkTypes: [],
      formFactor: "full",
      now,
    });

    const decision = buildObjectViewEditPermissionDecision({
      objectType: type,
      config,
      principal: { roles: ["ontology-editor"], permissions: [] },
    });

    expect(decision).toMatchObject({
      compatibility_mode: "native",
      allowed: true,
      can_edit_object_type: true,
      can_edit_object_view_resource: true,
    });
    expect(decision.requirements).toHaveLength(1);
  });

  it("requires Object View admin plus datasource editor permission for datasource-derived editing", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const config = {
      ...buildDefaultCustomObjectViewConfig({
        objectType: type,
        properties: [property({ id: "trail-name", name: "name", display_name: "Name" })],
        linkTypes: [],
        formFactor: "full",
        now,
      }),
      compatibility_mode: "datasource_derived" as const,
      input_datasource_ids: ["dataset-trails"],
    };

    const missingAdmin = buildObjectViewEditPermissionDecision({
      objectType: type,
      config,
      principal: {
        roles: ["ontology-editor"],
        permissions: ["datasource:dataset-trails:edit"],
      },
    });
    expect(missingAdmin.allowed).toBe(false);
    expect(missingAdmin.requirements.find((requirement) => requirement.kind === "object_view_admin")).toMatchObject({
      allowed: false,
    });

    const allowed = buildObjectViewEditPermissionDecision({
      objectType: type,
      config,
      principal: {
        roles: ["ontology-editor", "object-view-admin"],
        permissions: ["datasource:dataset-trails:edit"],
      },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.editable_input_datasource_ids).toEqual(["dataset-trails"]);
  });

  it("keeps Object View runtime in schema-only mode when backing object data is not viewable", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
    });
    const response: ObjectViewResponse = {
      object: {
        id: "trail-1",
        object_type_id: "Trail",
        properties: { name: "Highline", rating: 5 },
        created_by: "builder",
        created_at: now,
        updated_at: now,
      },
      summary: { name: "Highline", rating: 5 },
      neighbors: [],
      graph: graphResponse(),
      applicable_actions: [actionType()],
      matching_rules: [],
      recent_rule_runs: [],
      timeline: [{ event: "loaded" }],
    };

    const redacted = redactObjectViewResponseForObjectViewPermissions(response, {
      objectType: type,
      principal: { roles: ["ontology-viewer"], permissions: [] },
    });
    const decision = buildObjectViewRuntimePermissionDecision({
      response,
      objectType: type,
      principal: { roles: ["ontology-viewer"], permissions: [] },
    });

    expect(redacted.object.properties).toEqual({});
    expect(redacted.summary).toEqual({});
    expect(redacted.applicable_actions).toEqual([]);
    expect(redacted.timeline).toEqual([]);
    expect(redacted.graph.mode).toBe("schema_only");
    expect(decision).toMatchObject({
      schema_only: true,
      can_view_definition: true,
      can_view_instances: false,
      redacted_property_names: ["name", "rating"],
    });
  });

  it("nulls Object View properties from inaccessible datasource bindings without hiding allowed values", () => {
    const type = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-public",
    });
    const response: ObjectViewResponse = {
      object: {
        id: "trail-1",
        object_type_id: "Trail",
        properties: { name: "Highline", secret_score: 99 },
        created_by: "builder",
        created_at: now,
        updated_at: now,
      },
      summary: { name: "Highline", secret_score: 99 },
      neighbors: [],
      graph: graphResponse(),
      applicable_actions: [],
      matching_rules: [],
      recent_rule_runs: [],
      timeline: [],
    };
    const bindings = [{
      id: "binding-public",
      object_type_id: "Trail",
      dataset_id: "dataset-public",
      primary_key_column: "id",
      property_mapping: [
        { source_field: "name", target_property: "name" },
        { source_field: "secret_score", target_property: "secret_score", datasource_id: "dataset-secret", null_when_inaccessible: true },
      ],
      sync_mode: "snapshot" as const,
      default_marking: "public",
      preview_limit: 100,
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    }];

    const redacted = redactObjectViewResponseForObjectViewPermissions(response, {
      objectType: type,
      objectTypeBindings: bindings,
      accessibleDatasourceIds: ["dataset-public"],
      principal: { roles: ["ontology-viewer"], permissions: ["datasource:dataset-public:view"] },
    });
    const decision = buildObjectViewRuntimePermissionDecision({
      response,
      objectType: type,
      objectTypeBindings: bindings,
      accessibleDatasourceIds: ["dataset-public"],
      principal: { roles: ["ontology-viewer"], permissions: ["datasource:dataset-public:view"] },
    });

    expect(redacted.object.properties).toEqual({ name: "Highline", secret_score: null });
    expect(redacted.summary).toEqual({ name: "Highline", secret_score: null });
    expect(decision.redacted_property_names).toEqual(["secret_score"]);
  });
});

describe("ontology space-scoped artifact helpers", () => {
  it("derives private ontology metadata from a single owning space project", () => {
    const ontology = deriveOntologyArtifact({
      projects: [
        {
          id: "project-1",
          slug: "trail-running",
          display_name: "Trail Running",
          description: "Demo ontology placement",
          workspace_slug: "trail-space",
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
      ],
      objectTypeCount: 2,
      linkTypeCount: 1,
    });

    expect(ontology).toMatchObject({
      id: "ontology.trail-space",
      display_name: "Trail Running",
      owning_space_slug: "trail-space",
      access_mode: "private",
      placement: {
        project_id: "project-1",
        folder_path: "/trail-space/ontology",
      },
    });
    expect(ontology.organizations).toEqual([
      {
        id: "org.trail-space",
        display_name: "Trail Space organization",
        marking: "trail-space",
      },
    ]);
    expect(ontology.linked_resources).toEqual([
      { resource_kind: "link_type", count: 1 },
      { resource_kind: "object_type", count: 2 },
    ]);
  });

  it("marks an ontology as shared when visible projects span organizations", () => {
    const ontology = deriveOntologyArtifact({
      projects: [
        {
          id: "p1",
          slug: "core",
          display_name: "Core",
          description: "",
          workspace_slug: "alpha",
          owner_id: "u1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "p2",
          slug: "shared",
          display_name: "Shared",
          description: "",
          workspace_slug: "beta",
          owner_id: "u2",
          created_at: now,
          updated_at: now,
        },
      ],
      resourceBindings: [
        {
          project_id: "p1",
          resource_kind: "object_type",
          resource_id: "ot1",
          bound_by: "u1",
          created_at: now,
        },
        {
          project_id: "p1",
          resource_kind: "object_type",
          resource_id: "ot2",
          bound_by: "u1",
          created_at: now,
        },
      ],
      interfaceCount: 1,
    });

    expect(ontology.access_mode).toBe("shared");
    expect(ontology.organizations.map((org) => org.marking)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(ontology.linked_resources).toContainEqual({
      resource_kind: "object_type",
      count: 2,
    });
    expect(ontology.linked_resources).toContainEqual({
      resource_kind: "interface",
      count: 1,
    });
  });
});

describe("ontology resource registry helpers", () => {
  it("normalizes ontology resources into first-class registry entries", () => {
    const project = {
      id: "project-1",
      slug: "trail-running",
      display_name: "Trail Running",
      description: "",
      workspace_slug: "trail-space",
      owner_id: "owner-1",
      created_at: now,
      updated_at: now,
    };
    const ontology = deriveOntologyArtifact({ projects: [project] });
    const trailType = objectType({
      id: "Trail",
      name: "TrailApi",
      display_name: "Trail",
      plural_display_name: "Trails",
      description: "Trail object type",
      backing_dataset_id: "dataset-1",
      status: "experimental",
    });
    const bindings = [
      {
        project_id: "project-1",
        resource_kind: "object_type",
        resource_id: "Trail",
        bound_by: "owner-1",
        created_at: now,
      },
    ];

    const registry = buildOntologyResourceRegistry({
      ontology,
      projects: [project],
      resourceBindings: bindings,
      objectTypes: [trailType],
      linkTypes: [
        {
          id: "link-1",
          name: "TrailToRace",
          display_name: "Trail to Race",
          description: "",
          source_type_id: "Trail",
          target_type_id: "Race",
          cardinality: "many_to_many",
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
      ],
      actionTypes: [
        {
          id: "action-1",
          name: "UpdateTrail",
          display_name: "Update trail",
          description: "",
          object_type_id: "Trail",
          operation_kind: "update_object",
          input_schema: [],
          form_schema: {},
          config: {},
          confirmation_required: false,
          permission_key: null,
          authorization_policy: {},
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
      ],
      interfaces: [],
      sharedPropertyTypes: [],
      objectTypeGroups: [
        {
          id: "group-1",
          name: "trail_assets",
          display_name: "Trail assets",
          description: "Trail operating model",
          visibility: "normal",
          status: "active",
          owner_id: "owner-1",
          object_type_ids: ["Trail"],
          object_type_count: 1,
          created_at: now,
          updated_at: now,
        },
      ],
      objectViews: [
        {
          id: "view-1",
          name: "TrailFullView",
          display_name: "Trail full view",
          object_type_id: "Trail",
          mode: "standard",
          form_factor: "full",
          published: true,
          owner_id: "owner-1",
          created_at: now,
          updated_at: now,
        },
      ],
    });

    expect(registry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource_kind: "object_type",
          resource_id: "Trail",
          api_name: "TrailApi",
          display_name: "Trail",
          plural_display_name: "Trails",
          project_id: "project-1",
          project_display_name: "Trail Running",
          status: "experimental",
          usage_count: 3,
          backing_datasource_id: "dataset-1",
        }),
        expect.objectContaining({
          resource_kind: "datasource_registration",
          resource_id: "Trail:dataset-1",
          display_name: "Trail datasource",
          backing_datasource_id: "dataset-1",
        }),
        expect.objectContaining({
          resource_kind: "object_type_group",
          resource_id: "group-1",
          usage_count: 1,
          linked_resource_count: 1,
        }),
        expect.objectContaining({
          resource_kind: "core_object_view",
          resource_id: "view-1",
          linked_resource_count: 1,
        }),
      ]),
    );
  });

  it("indexes ontology resources incrementally with fuzzy, API, group, pagination, and permission-aware search", () => {
    const project: OntologyProject = {
      id: "project-field",
      slug: "field-ops",
      display_name: "Field Ops",
      description: "",
      workspace_slug: "workspace",
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };
    const trailType = objectType({
      id: "Trail",
      name: "Trail",
      api_name: "TrailApi",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
      properties: [
        property({ id: "trail-id", object_type_id: "Trail", name: "id", display_name: "ID" }),
        property({ id: "trail-condition", object_type_id: "Trail", name: "condition", display_name: "Condition", description: "Trail condition score" }),
      ],
    });
    const hiddenType = objectType({
      id: "Secret",
      name: "Secret",
      display_name: "Secret route",
      visibility: "hidden",
      properties: [property({ id: "secret-id", object_type_id: "Secret", name: "id", display_name: "ID" })],
    });
    const group: OntologyObjectTypeGroup = {
      id: "group-field",
      name: "field_assets",
      display_name: "Field assets",
      description: "Field operating resources",
      visibility: "normal",
      status: "active",
      owner_id: "owner",
      created_at: now,
      updated_at: now,
      object_type_ids: ["Trail"],
      object_type_count: 1,
      project_id: "project-field",
    };
    const view = {
      id: "view-trail",
      name: "TrailConfiguredView",
      display_name: "Trail configured view",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      published: true,
      owner_id: "owner",
      created_at: now,
      updated_at: now,
      config: buildDefaultCustomObjectViewConfig({ objectType: trailType, linkTypes: [], formFactor: "full" }),
    };
    const saved: ObjectSetDefinition = {
      id: "saved-trails",
      name: "Trail operations board",
      description: "Live trail operations exploration",
      base_object_type_id: "Trail",
      filters: [{ field: "condition", operator: "equals", value: "open" }],
      traversals: [],
      join: null,
      projections: ["id", "condition"],
      what_if_label: null,
      policy: { allowed_markings: [], minimum_clearance: null, deny_guest_sessions: false, required_restricted_view_id: null },
      kind: "exploration",
      query_state: buildObjectExplorerSavedQueryState({ query: "open trails", object_type_id: "Trail" }),
      layout: buildObjectExplorerSavedLayout({ view: "table", columns: ["id", "condition"] }),
      privacy: "public",
      project_id: "project-field",
      folder_path: "/Field Ops/Explorations",
      share_slug: "trail-operations",
      materialized_snapshot: null,
      materialized_at: null,
      materialized_row_count: 0,
      owner_id: "owner",
      created_at: now,
      updated_at: now,
    };
    const registry = buildOntologyResourceRegistry({
      ontology: deriveOntologyArtifact({ projects: [project] }),
      projects: [project],
      resourceBindings: [
        { project_id: "project-field", resource_kind: "object_type", resource_id: "Trail", bound_by: "owner", created_at: now },
        { project_id: "project-field", resource_kind: "object_type_group", resource_id: "group-field", bound_by: "owner", created_at: now },
      ],
      objectTypes: [trailType, hiddenType],
      linkTypes: [],
      actionTypes: [],
      interfaces: [],
      sharedPropertyTypes: [],
      objectTypeGroups: [group],
      objectViews: [view],
    });
    const usage = buildOntologyUsageImpactAnalysis({
      objectTypes: [trailType, hiddenType],
      objectViews: [view],
      externalSources: [{
        product: "object_explorer",
        consumer_id: "explorer-condition",
        consumer_label: "Condition dashboard",
        consumer_kind: "Saved Object Explorer exploration",
        payload: { object_type_id: "Trail", property_name: "condition" },
        last_used_at: now,
      }],
    });
    const permissionAnalysis = buildOntologyPermissionAnalysis({
      registry,
      projects: [project],
      objectTypes: [trailType, hiddenType],
      linkTypes: [],
      actionTypes: [],
      interfaces: [],
      sharedPropertyTypes: [],
      objectViews: [view],
      principal: {
        user_id: "viewer",
        roles: ["viewer"],
        permissions: ["datasource:dataset-trails:view"],
      },
    });
    const index = buildOntologyResourceSearchIndex({
      registry,
      objectTypes: [trailType, hiddenType],
      objectTypeGroups: [group],
      objectViews: [view],
      savedExplorations: [saved],
      usageReferences: usage.references,
      permissionAnalysis,
      principal: {
        user_id: "viewer",
        roles: ["viewer"],
        permissions: ["datasource:dataset-trails:view"],
      },
      now,
    });

    expect(index.documents.map((document) => document.resource_kind)).toEqual(expect.arrayContaining([
      "property",
      "usage_edge",
      "saved_exploration",
      "custom_object_view",
    ]));
    expect(searchOntologyResourceIndex(index, { query: "conditon", resource_kinds: ["property"] }).data[0]).toMatchObject({
      resource_kind: "property",
      resource_id: "Trail.condition",
    });
    expect(searchOntologyResourceIndex(index, { query: "TrailApi.condition", api_name_only: true }).data[0]).toMatchObject({
      api_name: "TrailApi.condition",
    });
    const groupResult = searchOntologyResourceIndex(index, { query: "trail", group_ids: ["group-field"], per_page: 100 });
    expect(groupResult.total).toBeGreaterThan(1);
    expect(groupResult.data.every((document) => document.group_ids.includes("group-field"))).toBe(true);
    const paged = searchOntologyResourceIndex(index, { query: "trail", page: 1, per_page: 2 });
    expect(paged.total).toBeGreaterThan(2);
    expect(paged.data).toHaveLength(2);
    expect(searchOntologyResourceIndex(index, { query: "Secret" })).toMatchObject({
      total: 0,
      hidden_results: expect.any(Number),
    });
    expect(searchOntologyResourceIndex(index, { query: "Secret", permission_filter: "all" }).data[0].permission.can_view).toBe(false);

    const rebuilt = buildOntologyResourceSearchIndex({
      registry,
      objectTypes: [trailType, hiddenType],
      objectTypeGroups: [group],
      objectViews: [view],
      savedExplorations: [saved],
      usageReferences: usage.references,
      permissionAnalysis,
      principal: {
        user_id: "viewer",
        roles: ["viewer"],
        permissions: ["datasource:dataset-trails:view"],
      },
      previousIndex: index,
      now: "2026-05-12T00:00:00Z",
    });
    expect(rebuilt.incremental.reused_documents).toBe(index.documents.length);
    expect(rebuilt.incremental.upserted_documents).toBe(0);
  });
});

describe("object view runtime performance budgets", () => {
  function trailType() {
    return objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
    });
  }

  function trailProperties(): Property[] {
    return [
      property({ id: "trail_id", name: "trail_id", property_type: "string", display_mode: "normal", required: true }),
      property({ id: "name", name: "name", property_type: "string", display_mode: "prominent" }),
      property({ id: "image", name: "image", property_type: "media_reference", display_mode: "normal" }),
      property({ id: "location", name: "location", property_type: "geo_point", display_mode: "normal" }),
      property({ id: "elevation_series", name: "elevation_series", property_type: "time_series", display_mode: "normal" }),
      property({
        id: "rating",
        name: "rating",
        property_type: "double",
        display_mode: "normal",
        value_formatting: { source: "function", function_id: "logic.trail-rating" } as Record<string, unknown>,
      }),
    ];
  }

  function trailLinkTypes(): LinkType[] {
    return [
      {
        id: "trail-route",
        name: "TrailRoute",
        display_name: "Trail route",
        description: "",
        source_type_id: "Trail",
        target_type_id: "Route",
        cardinality: "many_to_many",
        visibility: "normal",
        owner_id: "builder",
        created_at: now,
        updated_at: now,
      },
    ];
  }

  function buildResponse(neighborCount: number): ObjectViewResponse {
    return {
      object: {
        id: "trail-1",
        object_type_id: "Trail",
        properties: {
          trail_id: "T1",
          name: "Highline",
          image: "media://highline.jpg",
          location: { lat: 0, lon: 0 },
          elevation_series: "ts://elev",
          rating: 4.5,
        },
        created_by: "builder",
        created_at: now,
        updated_at: now,
      },
      summary: { name: "Highline" },
      neighbors: Array.from({ length: neighborCount }).map((_, index) => ({
        direction: "outbound" as const,
        link_id: `link-${index}`,
        link_type_id: "TrailRoute",
        link_name: "TrailRoute",
        object: {
          id: `route-${index}`,
          object_type_id: "Route",
          properties: {},
          created_by: "builder",
          created_at: now,
          updated_at: now,
        },
      })),
      graph: graphResponse(),
      applicable_actions: [],
      matching_rules: [{ rule_id: "r1" } as never],
      recent_rule_runs: [],
      timeline: [{ event: "loaded" }],
    };
  }

  it("returns defaults when no runtime_budgets is set and respects overrides", () => {
    const defaults = defaultObjectViewRuntimeBudgets();
    expect(defaults.enabled).toBe(true);
    expect(defaults.per_render.max_queries).toBeGreaterThan(0);

    const config = buildDefaultCustomObjectViewConfig({
      objectType: trailType(),
      properties: trailProperties(),
      linkTypes: trailLinkTypes(),
      formFactor: "full",
    });
    const fromConfig = objectViewRuntimeBudgets(config);
    expect(fromConfig).toEqual(defaults);

    const customized = setObjectViewRuntimeBudgets({
      config,
      budgets: {
        enabled: true,
        per_render: {
          ...defaults.per_render,
          max_queries: 3,
          max_linked_object_loads: 5,
        },
        per_tab: { max_workshop_widget_executions: 2 },
        per_panel: { max_queries: 1 },
      },
    });
    expect(customized.runtime_budgets?.per_render.max_queries).toBe(3);
    expect(customized.runtime_budgets?.per_tab?.max_workshop_widget_executions).toBe(2);
    expect(customized.runtime_budgets?.per_panel?.max_queries).toBe(1);
  });

  it("measures queries, linked objects, media, maps, time-series, widgets, and function-backed values", () => {
    const config = buildDefaultCustomObjectViewConfig({
      objectType: trailType(),
      properties: trailProperties(),
      linkTypes: trailLinkTypes(),
      formFactor: "full",
    });
    const usage = measureObjectViewRuntimeUsage({
      config,
      properties: trailProperties(),
      response: buildResponse(7),
      formFactor: "full",
    });
    expect(usage.queries).toBeGreaterThan(0);
    expect(usage.linked_object_loads).toBe(7);
    expect(usage.media_loads).toBeGreaterThan(0);
    expect(usage.map_loads).toBeGreaterThan(0);
    expect(usage.time_series_loads).toBeGreaterThan(0);
    expect(usage.workshop_widget_executions).toBeGreaterThan(0);
    expect(usage.function_backed_display_values).toBeGreaterThan(0);
    expect(usage.per_tab.length).toBeGreaterThan(0);
  });

  it("emits render and tab warnings when a budget is exceeded and stays silent within budget", () => {
    const config = setObjectViewRuntimeBudgets({
      config: buildDefaultCustomObjectViewConfig({
        objectType: trailType(),
        properties: trailProperties(),
        linkTypes: trailLinkTypes(),
        formFactor: "full",
      }),
      budgets: {
        enabled: true,
        per_render: {
          max_queries: 100,
          max_linked_object_loads: 2,
          max_media_loads: 100,
          max_map_loads: 100,
          max_time_series_loads: 100,
          max_workshop_widget_executions: 100,
          max_function_backed_display_values: 100,
        },
        per_tab: { max_linked_object_loads: 1 },
      },
    });
    const usage = measureObjectViewRuntimeUsage({
      config,
      properties: trailProperties(),
      response: buildResponse(5),
      formFactor: "full",
    });
    const evaluation = evaluateObjectViewRuntimeBudgets({
      config,
      usage,
      formFactor: "full",
      editorMode: true,
    });
    expect(evaluation.exceeded).toBe(true);
    const renderWarning = evaluation.warnings.find(
      (warning) => warning.scope === "render" && warning.metric === "linked_object_loads",
    );
    expect(renderWarning).toBeDefined();
    expect(renderWarning?.budget).toBe(2);
    const tabWarning = evaluation.warnings.find((warning) => warning.scope === "tab");
    expect(tabWarning).toBeDefined();

    const lenient = setObjectViewRuntimeBudgets({
      config,
      budgets: {
        enabled: true,
        per_render: {
          max_queries: 100,
          max_linked_object_loads: 100,
          max_media_loads: 100,
          max_map_loads: 100,
          max_time_series_loads: 100,
          max_workshop_widget_executions: 100,
          max_function_backed_display_values: 100,
        },
        per_tab: { max_linked_object_loads: 100 },
      },
    });
    const lenientUsage = measureObjectViewRuntimeUsage({
      config: lenient,
      properties: trailProperties(),
      response: buildResponse(5),
      formFactor: "full",
    });
    const lenientEval = evaluateObjectViewRuntimeBudgets({
      config: lenient,
      usage: lenientUsage,
      formFactor: "full",
      editorMode: true,
    });
    expect(lenientEval.exceeded).toBe(false);
    expect(lenientEval.warnings).toHaveLength(0);
  });

  it("skips warnings when budgets are disabled", () => {
    const config = setObjectViewRuntimeBudgets({
      config: buildDefaultCustomObjectViewConfig({
        objectType: trailType(),
        properties: trailProperties(),
        formFactor: "full",
      }),
      budgets: {
        ...defaultObjectViewRuntimeBudgets(),
        enabled: false,
      },
    });
    const usage = measureObjectViewRuntimeUsage({
      config,
      properties: trailProperties(),
      response: buildResponse(200),
      formFactor: "full",
    });
    const evaluation = evaluateObjectViewRuntimeBudgets({
      config,
      usage,
      formFactor: "full",
    });
    expect(evaluation.enabled).toBe(false);
    expect(evaluation.warnings).toHaveLength(0);
  });

  it("caches safe metadata per permission context and invalidates on object view id", () => {
    const config = buildDefaultCustomObjectViewConfig({
      objectType: trailType(),
      properties: trailProperties(),
      linkTypes: trailLinkTypes(),
      formFactor: "full",
    });
    const view = {
      id: "view-trail-full",
      name: "trail-full",
      object_type_id: "Trail",
      mode: "configured" as const,
      form_factor: "full" as const,
      config,
    };
    const principalA = { user_id: "alice", roles: ["editor"], permissions: ["object-view:edit"] };
    const principalB = { user_id: "bob", roles: ["viewer"], permissions: [] };
    const metadataA = buildObjectViewSafeMetadata({ view, config, principal: principalA });
    const metadataB = buildObjectViewSafeMetadata({ view, config, principal: principalB });
    expect(metadataA.permission_context_key).not.toBe(metadataB.permission_context_key);
    expect(objectViewPermissionContextKey(principalA)).not.toBe(objectViewPermissionContextKey(principalB));

    let cache = emptyObjectViewMetadataCache();
    cache = cacheObjectViewSafeMetadata({ cache, metadata: metadataA });
    cache = cacheObjectViewSafeMetadata({ cache, metadata: metadataB });
    expect(
      getObjectViewSafeMetadata({
        cache,
        objectViewId: view.id,
        formFactor: "full",
        principal: principalA,
      })?.permission_context_key,
    ).toBe(metadataA.permission_context_key);
    expect(
      getObjectViewSafeMetadata({
        cache,
        objectViewId: view.id,
        formFactor: "full",
        principal: principalB,
      })?.permission_context_key,
    ).toBe(metadataB.permission_context_key);

    const invalidated = invalidateObjectViewMetadataCache({ cache, objectViewId: view.id });
    expect(
      getObjectViewSafeMetadata({
        cache: invalidated,
        objectViewId: view.id,
        formFactor: "full",
        principal: principalA,
      }),
    ).toBeNull();

    const safeMetadata = buildObjectViewSafeMetadata({ view, config, principal: principalA });
    expect(Object.keys(safeMetadata)).not.toContain("object");
    expect(Object.keys(safeMetadata)).not.toContain("summary");
    expect(Object.keys(safeMetadata)).not.toContain("neighbors");
  });
});

describe("ontology cleanup assistant", () => {
  function unusedTrail() {
    return objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      primary_key_property: "trail_id",
      title_property: "name",
      properties: [
        property({ name: "trail_id", display_mode: "normal" }),
        property({ name: "name", display_mode: "prominent" }),
        property({ name: "deprecated_score", display_mode: "normal" }),
      ],
    });
  }

  it("detects unused properties, link types, empty groups, and orphan Object Views", () => {
    const trail = unusedTrail();
    const orphanView: ObjectViewDefinition = {
      id: "view-ghost",
      name: "ghost_view",
      display_name: "Ghost view",
      object_type_id: "Phantom",
      mode: "configured",
      form_factor: "full",
      published: false,
      status: "draft",
      config: buildDefaultCustomObjectViewConfig({
        objectType: trail,
        properties: trail.properties,
        formFactor: "full",
      }),
    };
    const emptyGroup: OntologyObjectTypeGroup = {
      id: "group-empty",
      name: "EmptyGroup",
      display_name: "Empty Group",
      description: "",
      visibility: "normal",
      status: "active",
      owner_id: "builder",
      created_at: now,
      updated_at: now,
      object_type_ids: [],
      object_type_count: 0,
    };
    const linkTypeNoUse: LinkType = {
      id: "trail-route-unused",
      name: "TrailRouteUnused",
      display_name: "Trail route (unused)",
      description: "",
      source_type_id: "Route",
      target_type_id: "Route",
      cardinality: "many_to_many",
      visibility: "normal",
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    };
    const cleanup = buildOntologyCleanupAssistant({
      objectTypes: [trail],
      linkTypes: [linkTypeNoUse],
      actionTypes: [],
      interfaces: [],
      sharedPropertyTypes: [],
      valueTypes: [],
      objectViews: [orphanView],
      objectTypeGroups: [emptyGroup],
    });
    expect(cleanup.totals.candidates).toBeGreaterThan(0);
    const kinds = cleanup.candidates.map((candidate) => candidate.kind);
    expect(kinds).toContain("link_type");
    expect(kinds).toContain("object_type_group");
    expect(kinds).toContain("property");
    const orphanCandidate = cleanup.candidates.find(
      (candidate) => candidate.kind === "object_view" && candidate.resource_id === "view-ghost",
    );
    expect(orphanCandidate?.severity).toBe("high");
    expect(orphanCandidate?.delete_supported).toBe(true);
  });

  it("flags legacy Object View fragments without auto-deleting them", () => {
    const trail = unusedTrail();
    const config = buildDefaultCustomObjectViewConfig({
      objectType: trail,
      properties: trail.properties,
      formFactor: "full",
    });
    const legacyView: ObjectViewDefinition = {
      id: "legacy-view",
      name: "legacy_view",
      display_name: "Legacy view",
      object_type_id: trail.id,
      mode: "configured",
      form_factor: "full",
      published: false,
      status: "draft",
      config: {
        ...config,
        metadata: { ...config.metadata, legacy_builder: true },
      },
    };
    const cleanup = buildOntologyCleanupAssistant({
      objectTypes: [trail],
      objectViews: [legacyView],
    });
    const legacyCandidate = cleanup.candidates.find(
      (candidate) => candidate.kind === "legacy_object_view_fragment",
    );
    expect(legacyCandidate).toBeDefined();
    expect(legacyCandidate?.delete_supported).toBe(false);
    expect(legacyCandidate?.severity).toBe("warning");
  });

  it("requires explicit confirmation and converts selected candidates into staged delete changes", () => {
    const trail = unusedTrail();
    const orphanView: ObjectViewDefinition = {
      id: "view-ghost",
      name: "ghost_view",
      display_name: "Ghost view",
      object_type_id: "Phantom",
      mode: "configured",
      form_factor: "full",
      published: false,
      status: "draft",
      config: buildDefaultCustomObjectViewConfig({
        objectType: trail,
        properties: trail.properties,
        formFactor: "full",
      }),
    };
    const cleanup = buildOntologyCleanupAssistant({
      objectTypes: [trail],
      objectViews: [orphanView],
    });
    const propertyCandidate = cleanup.candidates.find((candidate) => candidate.kind === "property");
    const orphanCandidate = cleanup.candidates.find(
      (candidate) => candidate.kind === "object_view" && candidate.resource_id === "view-ghost",
    );
    expect(propertyCandidate).toBeDefined();
    expect(orphanCandidate).toBeDefined();
    const selected = [propertyCandidate!.id, orphanCandidate!.id];

    const blocked = createOntologyCleanupStagedChanges({
      candidates: cleanup.candidates,
      selectedCandidateIds: selected,
      confirmed: false,
      currentUserId: "builder",
      now,
    });
    expect(blocked.confirmation_required).toBe(true);
    expect(blocked.errors).toHaveLength(1);
    expect(blocked.changes).toHaveLength(0);

    const result = createOntologyCleanupStagedChanges({
      candidates: cleanup.candidates,
      selectedCandidateIds: selected,
      confirmed: true,
      currentUserId: "builder",
      now,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.changes.length).toBe(2);
    expect(result.changes.every((change) => change.action === "delete")).toBe(true);
    expect(result.changes.every((change) => change.source === "ontology_cleanup_assistant")).toBe(true);
    expect(result.changes.every((change) => (change.warnings || []).length > 0)).toBe(true);

    const review = reviewUnsavedOntologyChanges(result.changes, "builder");
    expect(review.total).toBe(2);
    expect(review.errors).toBe(0);
  });
});

describe("ontology audit event log", () => {
  it("synthesizes audit events from saved changes, working changes, publish history, and rebases", () => {
    const trail = objectType({ id: "Trail", name: "Trail", display_name: "Trail" });
    const saved: OntologySavedChangeRecord = {
      id: "rec-1",
      project_id: "proj-1",
      change_ids: ["change-1"],
      resources: [{ kind: "object_type", id: "Trail", label: "Trail" }],
      changes: [
        {
          id: "change-1",
          kind: "object_type",
          action: "update",
          label: "Update Trail",
          description: "Updated description.",
          payload: { id: "Trail", permission_key: "trail.editor" },
          warnings: [],
          errors: [],
          source: "ontology_editor",
          author: "alice",
          createdAt: "2026-05-12T09:00:00Z",
        },
      ],
      branch_id: null,
      proposal_id: null,
      status: "saved",
      validation_errors: [],
      saved_by: "alice",
      saved_at: "2026-05-12T09:01:00Z",
    };
    const pending: OntologyStagedChange = {
      id: "pending-1",
      kind: "object_type_binding",
      action: "update",
      label: "Update Trail binding",
      description: "Adjust source field mapping.",
      payload: {
        id: "Trail:dataset-trails",
        source_field: "trail_id",
        target_property: "trail_id",
        property_mapping: [
          { source_field: "trail_id", target_property: "trail_id" },
          { source_field: "name", target_property: "name" },
        ],
      },
      warnings: [],
      errors: [],
      source: "ontology_editor",
      author: "bob",
      createdAt: "2026-05-13T11:00:00Z",
    };
    const config = buildDefaultCustomObjectViewConfig({
      objectType: trail,
      properties: trail.properties,
      formFactor: "full",
    });
    const view: ObjectViewDefinition = {
      id: "view-trail",
      name: "trail_view",
      display_name: "Trail view",
      object_type_id: trail.id,
      mode: "configured",
      form_factor: "full",
      published: true,
      status: "published",
      config: {
        ...config,
        version_history: [
          {
            id: "version-1",
            object_view_version: 2,
            workshop_module_version: 2,
            author: "carol",
            timestamp: "2026-05-11T12:00:00Z",
            change_summary: "Published initial Object View.",
            publish_state: "published",
            published: true,
            published_at: "2026-05-11T12:00:00Z",
            tab_ids: ["overview"],
            module_ids: ["module-overview"],
            snapshot: { ...config },
          },
        ],
        metadata: {
          ...config.metadata,
          branch_rebased_at: "2026-05-10T08:00:00Z",
          branch_rebased_ontology_signature: "sig-1",
        },
      },
    };
    const log = buildOntologyAuditEventLog({
      savedChanges: [saved],
      workingChanges: [pending],
      objectViews: [view],
      marketplacePackagings: [
        {
          id: "mkt-1",
          label: "Trail starter pack",
          object_view_id: view.id,
          object_type_id: trail.id,
          actor: "dora",
          packaged_at: "2026-05-09T15:30:00Z",
        },
      ],
    });
    expect(log.totals.events).toBeGreaterThanOrEqual(5);
    const categories = log.events.map((event) => event.category);
    expect(categories).toContain("permission_change");
    expect(categories).toContain("datasource_mapping");
    expect(categories).toContain("object_view_publish");
    expect(categories).toContain("branch_rebase");
    expect(categories).toContain("marketplace_packaging");
    const statuses = log.events.map((event) => event.status);
    expect(statuses).toContain("saved");
    expect(statuses).toContain("pending");
    expect(log.totals.unique_actors).toBeGreaterThan(0);
  });

  it("filters audit events by category, status, and actor", () => {
    const saved: OntologySavedChangeRecord = {
      id: "rec-1",
      project_id: "proj-1",
      change_ids: ["change-1", "change-2"],
      resources: [],
      changes: [
        {
          id: "change-1",
          kind: "object_type",
          action: "update",
          label: "Edit Trail",
          description: "",
          payload: { id: "Trail" },
          warnings: [],
          errors: [],
          source: "ontology_editor",
          author: "alice",
          createdAt: "2026-05-12T09:00:00Z",
        },
        {
          id: "change-2",
          kind: "core_object_view",
          action: "update",
          label: "Edit Object View",
          description: "",
          payload: { id: "view-trail" },
          warnings: [],
          errors: [],
          source: "ontology_editor",
          author: "bob",
          createdAt: "2026-05-12T09:00:00Z",
        },
      ],
      branch_id: null,
      proposal_id: null,
      status: "saved",
      validation_errors: [],
      saved_by: "alice",
      saved_at: "2026-05-12T09:01:00Z",
    };
    const filtered = buildOntologyAuditEventLog({
      savedChanges: [saved],
      filters: { category: "object_view_edit", actor: "alice" },
    });
    expect(filtered.events).toHaveLength(0);
    const onlyViews = buildOntologyAuditEventLog({
      savedChanges: [saved],
      filters: { category: "object_view_edit" },
    });
    expect(onlyViews.events).toHaveLength(1);
    expect(onlyViews.events[0].resource_label).toContain("Object View");
  });
});

describe("ontology operational health report", () => {
  it("detects broken links, indexing lag, missing value types, and permission mismatches", () => {
    const trail = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
      restricted_view_id: "rv-trail",
      restricted_view_policy_version: 5,
      restricted_view_registered_policy_version: 5,
      restricted_view_indexed_policy_version: 3,
      properties: [
        property({ name: "trail_id", display_mode: "normal", value_type_id: "vt-missing" }),
      ],
    });
    const orphanLink: LinkType = {
      id: "trail-route",
      name: "TrailRoute",
      display_name: "Trail route",
      description: "",
      source_type_id: "Trail",
      target_type_id: "Phantom",
      cardinality: "many_to_many",
      visibility: "normal",
      owner_id: "builder",
      created_at: now,
      updated_at: now,
    };
    const config = buildDefaultCustomObjectViewConfig({
      objectType: trail,
      properties: trail.properties,
      formFactor: "full",
    });
    const legacyView: ObjectViewDefinition = {
      id: "view-trail",
      name: "trail_view",
      display_name: "Trail view",
      object_type_id: trail.id,
      mode: "configured",
      form_factor: "full",
      published: false,
      status: "draft",
      config: {
        ...config,
        tabs: (config.tabs ?? []).map((tab, index) =>
          index === 0
            ? {
                ...tab,
                visibility: "visible",
                module: { ...tab.module, widgets: [] },
              }
            : tab,
        ),
        metadata: { ...config.metadata, legacy_builder: true },
      },
    };
    const report = buildOntologyHealthReport({
      objectTypes: [trail],
      linkTypes: [orphanLink],
      objectViews: [legacyView],
      valueTypes: [],
      permissionAnalysis: {
        resources: [
          {
            resource_key: "object_type:Trail",
            resource_kind: "object_type",
            resource_id: "Trail",
            display_name: "Trail",
            project_id: null,
            project_display_name: "",
            folder_path: "",
            owner_id: "alice",
            effective_level: "view" as const,
            can_view_definition: true,
            can_view_instances: false,
            can_edit: false,
            can_manage: false,
            is_owner: true,
            object_instance_access: "definition_not_viewable" as const,
            reasons: ["Restricted view inaccessible to owner."],
          },
        ],
        change_checks: [
          {
            change_id: "change-1",
            change_label: "Update Trail",
            change_kind: "object_type",
            allowed: false,
            requirements: [
              {
                resource_key: "object_type:Trail",
                resource_kind: "object_type",
                resource_id: "Trail",
                resource_label: "Trail",
                required_level: "edit" as const,
                effective_level: "view" as const,
                allowed: false,
                reason: "Missing edit role.",
              },
            ],
          },
        ],
        blocked_changes: 1,
        totals: {
          resources: 1,
          viewable_definitions: 1,
          viewable_instances: 0,
          editable: 0,
          manageable: 0,
          owned: 1,
        },
      },
      now: "2026-05-14T00:00:00Z",
    });
    const categories = report.issues.map((issue) => issue.category);
    expect(categories).toContain("broken_link");
    expect(categories).toContain("indexing_lag");
    expect(categories).toContain("missing_value_type");
    expect(categories).toContain("widget_load_failure");
    expect(categories).toContain("permission_mismatch");
    expect(categories).toContain("inaccessible_backing_data");
    const brokenLink = report.issues.find((issue) => issue.category === "broken_link");
    expect(brokenLink?.severity).toBe("critical");
    const blockedChange = report.issues.find(
      (issue) => issue.category === "permission_mismatch" && issue.resource_id === "change-1",
    );
    expect(blockedChange?.severity).toBe("critical");
    const summary = report.by_category.find((entry) => entry.category === "broken_link");
    expect(summary?.total).toBeGreaterThan(0);
  });

  it("returns an empty issue list when the ontology has no detectable problems", () => {
    const trail = objectType({
      id: "Trail",
      name: "Trail",
      display_name: "Trail",
      backing_dataset_id: "dataset-trails",
      updated_at: new Date().toISOString(),
      properties: [property({ name: "trail_id", display_mode: "normal" })],
    });
    const report = buildOntologyHealthReport({
      objectTypes: [trail],
      linkTypes: [],
      objectViews: [],
      valueTypes: [],
      permissionAnalysis: {
        resources: [],
        change_checks: [],
        blocked_changes: 0,
        totals: {
          resources: 0,
          viewable_definitions: 0,
          viewable_instances: 0,
          editable: 0,
          manageable: 0,
          owned: 0,
        },
      },
      now: new Date().toISOString(),
    });
    expect(report.totals.issues).toBe(0);
    expect(report.totals.critical).toBe(0);
  });
});
