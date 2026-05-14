package repo

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

func TestBuildLogicVersionChangeSummaryTracksComponentPromptAndModelChanges(t *testing.T) {
	t.Parallel()
	base := json.RawMessage(`{
	  "inputs":[{"id":"input-1","apiName":"complaintText","type":"string"},{"id":"input-2","apiName":"customer","type":"object"}],
	  "blocks":[
	    {"id":"llm-risk","name":"Summarize risk","kind":"use_llm","systemPrompt":"Be brief","taskPrompt":"Summarize {{complaintText}}","modelBinding":{"mode":"fixed","providerId":"gpt-4.1-mini"}},
	    {"id":"calc-score","name":"Score","kind":"calculator","expression":"baseRisk + 1"}
	  ],
	  "outputs":[{"id":"out-final","apiName":"finalAnswer","outputType":"string","sourceId":"llm.text"}]
	}`)
	head := json.RawMessage(`{
	  "inputs":[{"id":"input-1","apiName":"complaintText","type":"string"},{"id":"input-3","apiName":"delayHours","type":"double"}],
	  "blocks":[
	    {"id":"llm-risk","name":"Summarize risk","kind":"use_llm","systemPrompt":"Be precise","taskPrompt":"Summarize {{complaintText}} and delay","modelBinding":{"mode":"fixed","providerId":"gpt-4.1"}},
	    {"id":"loop-shipments","name":"Loop shipments","kind":"loop","inputApiName":"relatedShipments"}
	  ],
	  "outputs":[{"id":"out-final","apiName":"finalAnswer","outputType":"json","sourceId":"llm.structured"}]
	}`)

	summary := BuildLogicVersionChangeSummary(base, head)

	assert.Contains(t, summary.Inputs, logicComponentChange(logicComponentSnapshot{ID: "input-3", Name: "delayHours", Kind: "double"}, "added"))
	assert.Contains(t, summary.Inputs, logicComponentChange(logicComponentSnapshot{ID: "input-2", Name: "customer", Kind: "object"}, "removed"))
	assert.Contains(t, summary.Blocks, logicComponentChange(logicComponentSnapshot{ID: "llm-risk", Name: "Summarize risk", Kind: "use_llm"}, "edited"))
	assert.Contains(t, summary.Blocks, logicComponentChange(logicComponentSnapshot{ID: "loop-shipments", Name: "Loop shipments", Kind: "loop"}, "added"))
	assert.Contains(t, summary.Blocks, logicComponentChange(logicComponentSnapshot{ID: "calc-score", Name: "Score", Kind: "calculator"}, "removed"))
	assert.Contains(t, summary.Outputs, logicComponentChange(logicComponentSnapshot{ID: "out-final", Name: "finalAnswer", Kind: "json"}, "edited"))
	require.Len(t, summary.PromptChanges, 1)
	assert.Equal(t, "llm-risk", summary.PromptChanges[0].BlockID)
	require.Len(t, summary.ModelChanges, 1)
	assert.JSONEq(t, `{"modelBinding":{"mode":"fixed","providerId":"gpt-4.1"}}`, string(summary.ModelChanges[0].NewValue))
}

func TestNormalizeJSONObjectRejectsArraysAndUsesFallback(t *testing.T) {
	t.Parallel()
	got, err := normalizeJSONObject(nil, defaultLogicDefinition)
	require.NoError(t, err)
	assert.JSONEq(t, `{"inputs":[],"blocks":[],"outputs":[]}`, string(got))

	_, err = normalizeJSONObject(json.RawMessage(`[{"not":"an object"}]`), nil)
	assert.Error(t, err)
}

func TestDefaultLogicPermissionsSeparateResourceAndInvocationAccess(t *testing.T) {
	t.Parallel()
	ownerID := uuid.New()
	permissions := defaultLogicPermissions(ownerID, nil)

	assert.JSONEq(t, `{
	  "owners":["`+ownerID.String()+`"],
	  "managers":[],
	  "editors":[],
	  "viewers":[],
	  "invokers":["`+ownerID.String()+`"]
	}`, string(permissions))
}

func TestDeriveLogicSignatureUsesInputsAndOutputs(t *testing.T) {
	t.Parallel()
	signature := deriveLogicSignature(json.RawMessage(`{
	  "inputs":[{"apiName":"question","type":"string"}],
	  "blocks":[{"id":"llm"}],
	  "outputs":[{"apiName":"answer","outputType":"string","final":true}]
	}`))
	assert.JSONEq(t, `{"inputs":[{"apiName":"question","type":"string"}],"outputs":[{"apiName":"answer","outputType":"string","final":true}]}`, string(signature))
}

func TestLogicUsageSurfacesExposePublishedFunctionSnippets(t *testing.T) {
	t.Parallel()
	versionID := uuid.New()
	fn := models.LogicFunction{
		PublishedVersionID: versionID,
		FunctionRID:        "logic.customer-triage",
		Signature: json.RawMessage(`{
		  "inputs":[
		    {"apiName":"customerRecord","type":"object","objectTypeId":"Customer"},
		    {"apiName":"complaintText","type":"string","defaultValue":"Late shipment"}
		  ],
		  "outputs":[{"apiName":"finalAnswer","outputType":"string","final":true}]
		}`),
		Definition: json.RawMessage(`{
		  "inputs":[{"apiName":"customerRecord","type":"object","objectTypeId":"Customer"},{"apiName":"complaintText","type":"string"}],
		  "outputs":[
		    {"apiName":"finalAnswer","outputType":"string","final":true},
		    {"apiName":"actionPreview","outputType":"ontology_edit_bundle","source":"ontology_edit_bundle","final":false}
		  ]
		}`),
	}

	surfaces := buildLogicUsageSurfaces(fn, logicDefinitionReturnsOntologyEdits(fn.Definition), "https://example.openfoundry.dev")

	require.Len(t, surfaces, 6)
	assert.Equal(t, "available", surfaceByID(t, surfaces, "workshop").Status)
	assert.Contains(t, surfaceByID(t, surfaces, "workshop").Snippet.Body, `"function_package_id": "logic.customer-triage"`)
	assert.Equal(t, "available", surfaceByID(t, surfaces, "api_curl").Status)
	assert.Contains(t, surfaceByID(t, surfaces, "api_curl").Snippet.Body, "https://example.openfoundry.dev/api/v1/agent-runtime/logic/functions/logic.customer-triage/invoke")
	assert.Contains(t, surfaceByID(t, surfaces, "action_workflow").Href, "/action-types?source=logic")
	assert.Contains(t, surfaceByID(t, surfaces, "action_workflow").Snippet.Body, `"operation_kind": "invoke_function"`)
	assert.Contains(t, surfaceByID(t, surfaces, "action_workflow").Snippet.Body, `"function_kind": "logic"`)
	assert.Contains(t, surfaceByID(t, surfaces, "logic_function").Snippet.Body, `"functionKind": "existing_logic"`)
	assert.Contains(t, surfaceByID(t, surfaces, "automate").Snippet.Body, `"invoke_logic_function"`)
}

func TestLogicUsageBlocksAPICurlForFinalOntologyEdits(t *testing.T) {
	t.Parallel()
	definition := json.RawMessage(`{
	  "outputs":[
	    {"apiName":"editBundle","outputType":"ontology_edit_bundle","source":"ontology_edit_bundle","final":true}
	  ]
	}`)
	fn := models.LogicFunction{
		PublishedVersionID: uuid.New(),
		FunctionRID:        "logic.apply-edits",
		Signature:          deriveLogicSignature(definition),
		Definition:         definition,
	}

	assert.True(t, logicDefinitionReturnsOntologyEdits(definition))
	api := surfaceByID(t, buildLogicUsageSurfaces(fn, true, "https://example.openfoundry.dev"), "api_curl")

	assert.Equal(t, "blocked", api.Status)
	require.NotNil(t, api.BlockedReason)
	assert.Contains(t, *api.BlockedReason, "Ontology edits")
	assert.Nil(t, api.Snippet)
}

func TestUserScopedExecutionContextUsesInitiatingUserAnd24HourRetention(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)

	context := logicExecutionContext("user_scoped", actorID, projectID, now)

	assert.Equal(t, "user_scoped", context.ExecutionMode)
	assert.Equal(t, "user", context.PermissionSubjectKind)
	assert.Equal(t, actorID, context.PermissionSubjectID)
	assert.Equal(t, actorID, context.InitiatingUserID)
	assert.Equal(t, "initiating_user", context.LogsVisibleTo)
	assert.Equal(t, int32(24), context.RetentionHours)
	assert.Equal(t, now.Add(24*time.Hour), context.RetentionExpiresAt)
	assert.Nil(t, context.RunHistoryDatasetRID)
	assert.Zero(t, context.RunHistoryMaxRows)
}

func TestProjectScopedExecutionContextConfiguresRunHistoryDataset(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)

	context := logicExecutionContext("project_scoped", actorID, projectID, now)

	require.NotNil(t, context.RunHistoryDatasetRID)
	assert.Equal(t, "project_scoped", context.ExecutionMode)
	assert.Equal(t, "project", context.PermissionSubjectKind)
	assert.Equal(t, projectID, context.PermissionSubjectID)
	assert.Equal(t, actorID, context.InitiatingUserID)
	assert.Equal(t, projectID, context.ProjectID)
	assert.Equal(t, "project_viewers", context.LogsVisibleTo)
	assert.Equal(t, int32(0), context.RetentionHours)
	assert.Equal(t, logicProjectScopedRunHistoryDatasetRID(projectID), *context.RunHistoryDatasetRID)
	assert.Equal(t, int32(10000), context.RunHistoryMaxRows)
	assert.True(t, context.RetentionExpiresAt.After(now.AddDate(99, 0, 0)))
}

func TestProjectScopedExecutionContextRespectsConfigurableRunHistorySettings(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	override := "ri.foundry.dataset.logic-run-history.custom-rid"

	context := logicExecutionContextWithSettings("project_scoped", actorID, projectID, now, 250, &override)

	require.NotNil(t, context.RunHistoryDatasetRID)
	assert.Equal(t, override, *context.RunHistoryDatasetRID)
	assert.Equal(t, int32(250), context.RunHistoryMaxRows)
	assert.Equal(t, "project", context.PermissionSubjectKind)
	assert.Equal(t, projectID, context.PermissionSubjectID)
	assert.Equal(t, "project_viewers", context.LogsVisibleTo)

	// Configured value falls back to the documented default if zero/negative,
	// and clamps to 1,000,000 if too large.
	zero := logicExecutionContextWithSettings("project_scoped", actorID, projectID, now, 0, nil)
	assert.Equal(t, logicProjectScopedRunHistoryMaxRows, zero.RunHistoryMaxRows)
	require.NotNil(t, zero.RunHistoryDatasetRID)
	assert.Equal(t, logicProjectScopedRunHistoryDatasetRID(projectID), *zero.RunHistoryDatasetRID)

	tooLarge := logicExecutionContextWithSettings("project_scoped", actorID, projectID, now, 5_000_000, nil)
	assert.Equal(t, int32(1_000_000), tooLarge.RunHistoryMaxRows)

	emptyOverride := "   "
	emptyOverrideCtx := logicExecutionContextWithSettings("project_scoped", actorID, projectID, now, 1234, &emptyOverride)
	require.NotNil(t, emptyOverrideCtx.RunHistoryDatasetRID)
	assert.Equal(t, logicProjectScopedRunHistoryDatasetRID(projectID), *emptyOverrideCtx.RunHistoryDatasetRID)
}

func TestUserScopedExecutionContextIgnoresConfigurableRunHistorySettings(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	override := "ri.foundry.dataset.logic-run-history.custom-rid"

	context := logicExecutionContextWithSettings("user_scoped", actorID, projectID, now, 9000, &override)

	assert.Nil(t, context.RunHistoryDatasetRID)
	assert.Zero(t, context.RunHistoryMaxRows)
	assert.Equal(t, "user", context.PermissionSubjectKind)
	assert.Equal(t, actorID, context.PermissionSubjectID)
}

func TestLogicSecurityBoundaryLimitsLLMAccessToConfiguredPermissionedResources(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	definition := json.RawMessage(`{
	  "security":{
	    "allowed_object_types":["Customer"],
	    "readable_properties_by_object_type":{"Customer":["name","tier"]},
	    "allowed_action_type_ids":["create-service-case"],
	    "allowed_function_rids":["fn.slaImpact.ts"],
	    "allowed_media_set_rids":["media.set.demo"],
	    "allowed_result_dataset_rids":["ri.foundry.dataset.logic-run-history.` + projectID.String() + `"],
	    "project_imported_resource_ids":["object_type:Customer","action_type:create-service-case","function:fn.slaImpact.ts","media_set:media.set.demo"],
	    "marking_accessible_resource_ids":["object_type:Customer","action_type:create-service-case","function:fn.slaImpact.ts","media_set:media.set.demo"]
	  },
	  "inputs":[
	    {"apiName":"customer","type":"object","objectTypeId":"Customer"},
	    {"apiName":"referenceMedia","type":"media_reference","mediaSetRid":"media.set.demo"}
	  ],
	  "blocks":[{
	    "id":"llm",
	    "kind":"use_llm",
	    "toolAccess":[
	      {"kind":"query_objects","name":"Customer facts","objectTypeId":"Customer","readableObjectTypeIds":["Customer"],"selectedProperties":["name"],"readablePropertiesByObjectType":{"Customer":["name","tier"]}},
	      {"kind":"apply_action","name":"Open case","actionTypeId":"create-service-case","allowedActionTypeIds":["create-service-case"]},
	      {"kind":"execute_function","name":"SLA impact","functionRid":"fn.slaImpact.ts","allowedFunctionRids":["fn.slaImpact.ts"]}
	    ]
	  }]
	}`)
	context := logicExecutionContext("project_scoped", actorID, projectID, now)

	boundary := logicSecurityBoundary(definition, context)

	assert.True(t, boundary.Ready)
	assert.Empty(t, boundary.Issues)
	assert.Equal(t, "project", boundary.PermissionSubjectKind)
	assert.Contains(t, boundary.LLMAccessibleResourceIDs, "object_type:Customer")
	assert.Contains(t, boundary.LLMAccessibleResourceIDs, "action_type:create-service-case")
	assert.Contains(t, boundary.LLMAccessibleResourceIDs, "function:fn.slaImpact.ts")
	assert.Contains(t, boundary.LLMAccessibleResourceIDs, "media_set:media.set.demo")
}

func TestLogicSecurityBoundaryBlocksUnconfiguredResourcesAndProjectScopeGaps(t *testing.T) {
	t.Parallel()
	actorID := uuid.New()
	projectID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	definition := json.RawMessage(`{
	  "security":{
	    "allowed_object_types":["Customer"],
	    "readable_properties_by_object_type":{"Customer":["name"]},
	    "allowed_function_rids":["fn.slaImpact.ts"],
	    "allowed_media_set_rids":["media.set.demo"],
	    "allowed_result_dataset_rids":["ri.foundry.dataset.allowed"],
	    "project_imports":["object_type:Customer"],
	    "marking_access":["object_type:Customer"]
	  },
	  "inputs":[{"apiName":"referenceMedia","type":"media_reference","mediaSetRid":"media.private"}],
	  "blocks":[{
	    "id":"llm",
	    "kind":"use_llm",
	    "toolAccess":[
	      {"kind":"query_objects","name":"Customer facts","objectTypeId":"Customer","readableObjectTypeIds":["Customer"],"selectedProperties":["name","ssn"],"readablePropertiesByObjectType":{"Customer":["name"]}},
	      {"kind":"execute_function","name":"Private function","functionRid":"fn.private.py","allowedFunctionRids":["fn.slaImpact.ts"]}
	    ]
	  }]
	}`)
	context := logicExecutionContext("project_scoped", actorID, projectID, now)

	boundary := logicSecurityBoundary(definition, context)

	assert.False(t, boundary.Ready)
	fields := make([]string, 0, len(boundary.Issues))
	for _, issue := range boundary.Issues {
		fields = append(fields, issue.Field)
	}
	assert.Contains(t, fields, "inputs[0].mediaSetRid")
	assert.Contains(t, fields, "blocks[0].toolAccess[0].selectedProperties.ssn")
	assert.Contains(t, fields, "blocks[0].toolAccess[1].functionRid")
	assert.Contains(t, fields, "runHistoryDatasetRid")
	assert.Contains(t, fields, "inputs[0].imported")
	assert.Contains(t, fields, "blocks[0].toolAccess[1].imported")
}

func TestLogicRunHistoryDatasetRowIncludesProjectScopedExecutionDetails(t *testing.T) {
	t.Parallel()
	runID := uuid.New()
	actorID := uuid.New()
	projectID := uuid.New()
	versionID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	fn := models.LogicFunction{
		LogicFileID:            uuid.New(),
		PublishedVersionID:     versionID,
		PublishedVersionNumber: 9,
		FunctionRID:            "logic.customer-triage",
		Definition: json.RawMessage(`{
		  "branchName":"main",
		  "blocks":[{"id":"llm","modelBinding":{"mode":"model_variable","modelVariableApiName":"responseModel"}}]
		}`),
	}
	context := logicExecutionContext("project_scoped", actorID, projectID, now)
	inputs := json.RawMessage(`{"complaintText":"Late shipment","responseModel":"gpt-4.1-mini"}`)
	outputs := json.RawMessage(`{"finalAnswer":"Escalate"}`)
	traceRefs := logicRunTraceRefs(fn, context, runID)
	serviceContext := logicRunServiceContext(context, "automate")
	modelProviderID := logicInvocationModel(fn.Definition, inputs)
	branchName := logicDefinitionBranchName(fn.Definition)

	row := logicRunHistoryDatasetRow(runID, fn, context, "automate", "succeeded", inputs, outputs, nil, 321, modelProviderID, branchName, traceRefs, serviceContext, now, now.Add(321*time.Millisecond))

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(row, &decoded))
	assert.Equal(t, runID.String(), decoded["run_id"])
	assert.Equal(t, "logic.customer-triage", decoded["function_rid"])
	assert.Equal(t, "succeeded", decoded["status"])
	assert.Equal(t, "gpt-4.1-mini", decoded["model"])
	assert.Equal(t, "main", decoded["branch_name"])
	assert.Equal(t, versionID.String(), decoded["published_version_id"])
	assert.Equal(t, float64(9), decoded["published_version_number"])
	assert.Equal(t, actorID.String(), decoded["actor_id"])
	assert.Equal(t, projectID.String(), decoded["permission_subject_id"])
	assert.Equal(t, "project_viewers", decoded["visible_to"])
	assert.Contains(t, string(row), `"inputs":{"complaintText":"Late shipment","responseModel":"gpt-4.1-mini"}`)
	assert.Contains(t, string(row), `"outputs":{"finalAnswer":"Escalate"}`)
	assert.Contains(t, string(row), `"trace_refs":[{"href":"/logic/files/`)
	assert.Contains(t, string(row), `"service_context":{"execution_mode":"project_scoped"`)
}

func TestLogicRunVisibilityKeepsUserScopedLogsPrivate(t *testing.T) {
	t.Parallel()
	ownerID := uuid.New()
	otherID := uuid.New()
	userScopedRun := models.LogicRun{ActorID: ownerID, ExecutionMode: "user_scoped"}
	projectScopedRun := models.LogicRun{ActorID: ownerID, ExecutionMode: "project_scoped"}

	assert.True(t, logicRunVisibleToActor(userScopedRun, ownerID, false))
	assert.False(t, logicRunVisibleToActor(userScopedRun, otherID, true))
	assert.True(t, logicRunVisibleToActor(projectScopedRun, otherID, true))
}

func TestBuildLogicMetricsCountsFailuresCategoriesRecentRunsAndP95(t *testing.T) {
	t.Parallel()
	fileID := uuid.New()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	permissionMessage := "Permission denied for Customer.ssn"
	validationMessage := "Validation failed: invalid input schema"
	runs := []models.LogicRun{
		{ID: uuid.New(), LogicFileID: fileID, Status: "succeeded", DurationMS: 100, CreatedAt: now.Add(-10 * time.Minute)},
		{ID: uuid.New(), LogicFileID: fileID, Status: "failed", DurationMS: 220, ErrorMessage: &permissionMessage, Logs: json.RawMessage(`[]`), CreatedAt: now.Add(-20 * time.Minute)},
		{ID: uuid.New(), LogicFileID: fileID, Status: "failed", DurationMS: 310, ErrorMessage: &validationMessage, Logs: json.RawMessage(`[]`), CreatedAt: now.Add(-30 * time.Minute)},
		{ID: uuid.New(), LogicFileID: fileID, Status: "succeeded", DurationMS: 480, CreatedAt: now.Add(-40 * time.Minute)},
	}

	metrics := buildLogicMetrics(fileID, runs, "24h", now.Add(-24*time.Hour), now)

	assert.Equal(t, int32(2), metrics.SuccessCount)
	assert.Equal(t, int32(2), metrics.FailureCount)
	assert.Equal(t, []models.LogicFailureCategory{
		{Category: "permission_error", Count: 1},
		{Category: "validation_error", Count: 1},
	}, metrics.FailureCategories)
	require.NotNil(t, metrics.P95DurationMS)
	assert.Equal(t, int32(480), *metrics.P95DurationMS)
	assert.Equal(t, runs, metrics.RecentRuns)
	assert.True(t, metrics.ViewerPermissionRequired)
}

func TestLogicMetricsWindowDefaultsTo30Days(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)

	label, start := logicMetricsWindow("unknown", now)

	assert.Equal(t, "30d", label)
	assert.Equal(t, now.AddDate(0, 0, -30), start)
}

func TestNormalizeJSONArrayRejectsObjectsAndUsesFallback(t *testing.T) {
	t.Parallel()
	got, err := normalizeJSONArray(nil, defaultEvalArray)
	require.NoError(t, err)
	assert.JSONEq(t, `[]`, string(got))

	got, err = normalizeJSONArray(json.RawMessage(`[{"name":"input"}]`), defaultEvalArray)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"name":"input"}]`, string(got))

	_, err = normalizeJSONArray(json.RawMessage(`{"not":"an array"}`), defaultEvalArray)
	assert.Error(t, err)
}

func TestNormalizeEvalTargetFunctionsSupportsMultipleTargetKinds(t *testing.T) {
	t.Parallel()
	raw := json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"finalAnswer","outputType":"string"}]
	    }
	  },
	  {
	    "id":"chatbot.support-agent",
	    "kind":"agent_like",
	    "version":"current",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"answer","outputType":"string"}]
	    }
	  },
	  {
	    "id":"fn.route-ticket.py",
	    "kind":"code_function",
	    "version":"specific",
	    "version_id":"v2026-05-13",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"route","outputType":"string"}]
	    }
	  }
	]`)

	normalized, targets, err := normalizeEvalTargetFunctions(raw)

	require.NoError(t, err)
	assert.JSONEq(t, string(raw), string(normalized))
	require.Len(t, targets, 3)
	assert.Equal(t, "logic", targets[0].Kind)
	assert.Equal(t, "agent_like", targets[1].Kind)
	assert.Equal(t, "code_function", targets[2].Kind)
	assert.Contains(t, targets[2].Outputs, "route")
}

func TestNormalizeEvalTargetFunctionsRejectsUnavailableVersionsAndBadSignatures(t *testing.T) {
	t.Parallel()
	_, _, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"specific",
	    "signature":{"inputs":[],"outputs":[{"apiName":"finalAnswer","type":"string"}]}
	  }
	]`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unavailable version")

	_, _, err = normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"fn.route-ticket.py",
	    "kind":"code_function",
	    "version":"published",
	    "signature":{"inputs":[{"apiName":"complaintText"}],"outputs":[]}
	  }
	]`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "type/outputType")
}

func TestNormalizeEvalEvaluatorsRequiresTargetSpecificMappingsForMultipleTargets(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{"inputs":[{"apiName":"complaintText","type":"string"}],"outputs":[{"apiName":"finalAnswer","type":"string"}]}
	  },
	  {
	    "id":"fn.route-ticket.py",
	    "kind":"code_function",
	    "version":"published",
	    "signature":{"inputs":[{"apiName":"complaintText","type":"string"}],"outputs":[{"apiName":"route","type":"string"}]}
	  }
	]`))
	require.NoError(t, err)
	columns := json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"}
	]`)
	_, columnDefs, err := normalizeEvalColumns(columns, targets)
	require.NoError(t, err)

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {"id":"exact-string-match","kind":"built_in","evaluator":"exact_string_match","mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}}
	]`), targets, columnDefs)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "target-specific mappings")

	normalized, err := normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"exact-string-match",
	    "kind":"built_in",
	    "evaluator":"exact_string_match",
	    "target_mappings":{
	      "logic.customer-triage":{"actual":"finalAnswer","expected":"expectedAnswer"},
	      "fn.route-ticket.py":{"actual":"route","expected":"expectedAnswer"}
	    }
	  }
	]`), targets, columnDefs)
	require.NoError(t, err)
	assert.Contains(t, string(normalized), "target_mappings")

	_, badColumnDefs, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"expectedAnswer","type":"double","role":"expected_output"}
	]`), targets)
	require.NoError(t, err)
	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"exact-string-match",
	    "kind":"built_in",
	    "evaluator":"exact_string_match",
	    "target_mappings":{
	      "logic.customer-triage":{"actual":"finalAnswer","expected":"expectedAnswer"},
	      "fn.route-ticket.py":{"actual":"route","expected":"expectedAnswer"}
	    }
	  }
	]`), targets, badColumnDefs)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not compatible")
}

func TestNormalizeEvalEvaluatorsValidatesBuiltInEvaluatorObjectives(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"finalAnswer","type":"string"},{"apiName":"score","type":"double"},{"apiName":"dueDate","type":"date"}]
	    }
	  }
	]`))
	require.NoError(t, err)
	_, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"},
	  {"apiName":"expectedRange","type":"double","role":"expected_output"},
	  {"apiName":"expectedDate","type":"date","role":"expected_output"}
	]`), targets)
	require.NoError(t, err)

	normalized, err := normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"regex-route",
	    "kind":"built_in",
	    "evaluator":"regex",
	    "config":{"pattern":"Escalate|Recover"},
	    "objective":{"metric":"matches_regex","target":true},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  },
	  {
	    "id":"distance-route",
	    "kind":"built_in",
	    "evaluator":"levenshtein_distance",
	    "objective":{"metric":"distance","direction":"minimize","threshold":2},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  },
	  {
	    "id":"range-score",
	    "kind":"built_in",
	    "evaluator":"floating_point_range",
	    "config":{"min":0,"max":10},
	    "objective":{"metric":"in_range","target":true},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"score","expected":"expectedRange"}
	  },
	  {
	    "id":"temporal-window",
	    "kind":"built_in",
	    "evaluator":"temporal_range",
	    "config":{"min":"2026-05-01","max":"2026-05-31"},
	    "objective":{"metric":"in_temporal_range","target":true},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"dueDate","expected":"expectedDate"}
	  }
	]`), targets, columns)
	require.NoError(t, err)
	assert.Contains(t, string(normalized), "floating_point_range")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"bad-builtin",
	    "kind":"built_in",
	    "evaluator":"not_a_builtin",
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "supported built-in")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"bad-objective",
	    "kind":"built_in",
	    "evaluator":"distance",
	    "objective":{"metric":"distance","direction":"sideways","threshold":2},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "maximize or minimize")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"bad-config",
	    "kind":"built_in",
	    "evaluator":"integer_range",
	    "config":{"min":0.5},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"score","expected":"expectedRange"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "must be an integer")
}

func TestNormalizeEvalEvaluatorsValidatesCustomEvaluationFunctions(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"finalAnswer","type":"string"}]
	    }
	  }
	]`))
	require.NoError(t, err)
	_, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"}
	]`), targets)
	require.NoError(t, err)

	normalized, err := normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"custom-quality",
	    "kind":"custom_function",
	    "evaluator":"fn.eval-response-quality.ts",
	    "function_rid":"fn.eval-response-quality.ts",
	    "function_kind":"typescript",
	    "version":"published",
	    "return_signature":{
	      "outputs":[
	        {
	          "apiName":"quality",
	          "type":"struct",
	          "fields":[
	            {"apiName":"isCorrect","type":"boolean"},
	            {"apiName":"qualityScore","type":"double"},
	            {"apiName":"debugNotes","type":"string"}
	          ]
	        },
	        {"apiName":"traceSummary","type":"string"}
	      ]
	    },
	    "metric_objectives":{
	      "quality.isCorrect":{"target":true},
	      "quality.qualityScore":{"direction":"maximize","threshold":0.5}
	    },
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.NoError(t, err)
	assert.Contains(t, string(normalized), "custom_function")
	assert.Contains(t, string(normalized), "debugNotes")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"debug-only",
	    "kind":"custom_function",
	    "evaluator":"fn.debug-only.py",
	    "function_rid":"fn.debug-only.py",
	    "function_kind":"python",
	    "version":"published",
	    "return_signature":{"outputs":[{"apiName":"reason","type":"string"}]},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Boolean or numeric metric")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"draft-custom",
	    "kind":"custom_function",
	    "evaluator":"logic.eval-response-quality",
	    "function_rid":"logic.eval-response-quality",
	    "function_kind":"logic",
	    "version":"draft",
	    "return_signature":{"outputs":[{"apiName":"passed","type":"boolean"}]},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "published function version")
}

func TestNormalizeEvalEvaluatorsRequiresCustomFunctionForOntologyEdits(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.service-case-editor",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[
	        {"apiName":"actionEditPreview","type":"ontology_edit_bundle"},
	        {"apiName":"riskScore","type":"double"}
	      ]
	    }
	  }
	]`))
	require.NoError(t, err)
	_, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"riskScore","type":"double","role":"intermediate_parameter"},
	  {"apiName":"expectedOntologyEdits","type":"json","role":"expected_output"},
	  {"apiName":"expectedRiskScore","type":"double","role":"expected_output"}
	]`), targets)
	require.NoError(t, err)

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"exact-edits",
	    "kind":"built_in",
	    "evaluator":"exact_match",
	    "target_id":"logic.service-case-editor",
	    "mappings":{"actual":"actionEditPreview","expected":"expectedOntologyEdits"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "custom evaluator function")

	normalized, err := normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"custom-ontology-edits",
	    "kind":"custom_function",
	    "evaluator":"fn.eval-ontology-edits.ts",
	    "function_rid":"fn.eval-ontology-edits.ts",
	    "function_kind":"typescript",
	    "version":"published",
	    "return_signature":{"outputs":[{"apiName":"createdObjectFound","type":"boolean"}]},
	    "target_id":"logic.service-case-editor",
	    "mappings":{"actual":"actionEditPreview","expected":"expectedOntologyEdits"}
	  },
	  {
	    "id":"risk-score",
	    "kind":"built_in",
	    "evaluator":"numeric_range",
	    "config":{"min":0,"max":1},
	    "target_id":"logic.service-case-editor",
	    "mappings":{"actual":"riskScore","expected":"expectedRiskScore"}
	  }
	]`), targets, columns)
	require.NoError(t, err)
	assert.Contains(t, string(normalized), "custom-ontology-edits")
	assert.Contains(t, string(normalized), "risk-score")
}

func TestNormalizeEvalEvaluatorsValidatesMarketplaceEvaluatorHandoff(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"finalAnswer","type":"string"}]
	    }
	  }
	]`))
	require.NoError(t, err)
	_, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"}
	]`), targets)
	require.NoError(t, err)

	normalized, err := normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"marketplace-rubric",
	    "kind":"marketplace_function",
	    "evaluator":"logic.marketplace.rubric-grader",
	    "function_rid":"logic.marketplace.rubric-grader",
	    "function_kind":"logic",
	    "version":"published",
	    "marketplace_product_slug":"rubric-grader",
	    "marketplace_listing_id":"0196f31e-0000-7000-8000-000000310001",
	    "marketplace_install_status":"installed",
	    "marketplace_dependency_plan":[{"package_slug":"openfoundry-llm-judge-runtime","version_req":"^1.2","required":true}],
	    "return_signature":{
	      "outputs":[
	        {
	          "apiName":"rubric",
	          "type":"struct",
	          "fields":[
	            {"apiName":"passed","type":"boolean"},
	            {"apiName":"score","type":"double"},
	            {"apiName":"rationale","type":"string"}
	          ]
	        }
	      ]
	    },
	    "metric_objectives":{
	      "rubric.passed":{"target":true},
	      "rubric.score":{"direction":"maximize","threshold":0.8}
	    },
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.NoError(t, err)
	assert.Contains(t, string(normalized), "marketplace_function")
	assert.Contains(t, string(normalized), "marketplace_dependency_plan")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"marketplace-missing-install",
	    "kind":"marketplace_function",
	    "evaluator":"logic.marketplace.contains-key-details",
	    "function_rid":"logic.marketplace.contains-key-details",
	    "function_kind":"logic",
	    "version":"published",
	    "marketplace_product_slug":"contains-key-details",
	    "marketplace_listing_id":"0196f31e-0000-7000-8000-000000310002",
	    "marketplace_install_status":"setup_required",
	    "return_signature":{"outputs":[{"apiName":"containsAll","type":"boolean"}]},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "installed before it can run")

	_, err = normalizeEvalEvaluators(json.RawMessage(`[
	  {
	    "id":"marketplace-missing-package",
	    "kind":"marketplace_function",
	    "evaluator":"logic.marketplace.rubric-grader",
	    "function_rid":"logic.marketplace.rubric-grader",
	    "function_kind":"logic",
	    "version":"published",
	    "marketplace_install_status":"installed",
	    "return_signature":{"outputs":[{"apiName":"passed","type":"boolean"}]},
	    "target_id":"logic.customer-triage",
	    "mappings":{"actual":"finalAnswer","expected":"expectedAnswer"}
	  }
	]`), targets, columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Marketplace product packaging metadata")
}

func TestNormalizeEvalColumnsValidatesTargetInputTypesAndRoles(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{"inputs":[{"apiName":"complaintText","type":"string"},{"apiName":"delayHours","type":"double"}],"outputs":[{"apiName":"finalAnswer","type":"string"}]}
	  }
	]`))
	require.NoError(t, err)

	normalized, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"delayHours","type":"integer","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"},
	  {"apiName":"scenario","type":"string","role":"metadata"}
	]`), targets)

	require.NoError(t, err)
	assert.JSONEq(t, `[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"delayHours","type":"integer","role":"input"},
	  {"apiName":"expectedAnswer","type":"string","role":"expected_output"},
	  {"apiName":"scenario","type":"string","role":"metadata"}
	]`, string(normalized))
	assert.Equal(t, "expected_output", columns["expectedAnswer"].Role)

	_, _, err = normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"double","role":"input"},
	  {"apiName":"delayHours","type":"double","role":"input"}
	]`), targets)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not compatible")
}

func TestNormalizeEvalColumnsSupportsIntermediateParameters(t *testing.T) {
	t.Parallel()
	_, targets, err := normalizeEvalTargetFunctions(json.RawMessage(`[
	  {
	    "id":"logic.customer-triage",
	    "kind":"logic",
	    "version":"published",
	    "signature":{
	      "inputs":[{"apiName":"complaintText","type":"string"}],
	      "outputs":[{"apiName":"finalAnswer","type":"string"},{"apiName":"riskScore","type":"double"}]
	    }
	  }
	]`))
	require.NoError(t, err)

	normalized, columns, err := normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"riskScore","type":"double","role":"intermediate_parameter"},
	  {"apiName":"expectedRiskScore","type":"double","role":"expected_output"}
	]`), targets)

	require.NoError(t, err)
	assert.Contains(t, string(normalized), "intermediate_parameter")
	assert.Equal(t, "intermediate_parameter", columns["riskScore"].Role)

	_, _, err = normalizeEvalColumns(json.RawMessage(`[
	  {"apiName":"complaintText","type":"string","role":"input"},
	  {"apiName":"missingBlockValue","type":"double","role":"intermediate_parameter"}
	]`), targets)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not map to any target function output")
}

func TestNormalizeEvalTestCasesValidatesNamesValuesAndTypes(t *testing.T) {
	t.Parallel()
	columns := map[string]evalColumnDefinition{
		"complaintText":  {APIName: "complaintText", Type: "string", Role: "input"},
		"delayHours":     {APIName: "delayHours", Type: "double", Role: "input"},
		"expectedAnswer": {APIName: "expectedAnswer", Type: "string", Role: "expected_output"},
		"riskScore":      {APIName: "riskScore", Type: "double", Role: "intermediate_parameter"},
		"scenario":       {APIName: "scenario", Type: "string", Role: "metadata"},
	}
	raw := json.RawMessage(`[
	  {
	    "id":"case-1",
	    "name":"Late shipment escalation",
	    "source":"manual",
	    "generated_name_hint":"SLA Miss With Recovery",
	    "values":{"complaintText":"Shipment missed SLA","delayHours":6,"expectedAnswer":"Escalate","scenario":"sla"},
	    "metadata":{"priority":"high"}
	  }
	]`)

	normalized, err := normalizeEvalTestCases(raw, columns)

	require.NoError(t, err)
	assert.JSONEq(t, string(raw), string(normalized))

	_, err = normalizeEvalTestCases(json.RawMessage(`[
	  {"id":"case-2","name":"Bad numeric","values":{"complaintText":"x","delayHours":"six","expectedAnswer":"Escalate"}}
	]`), columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not compatible")

	_, err = normalizeEvalTestCases(json.RawMessage(`[
	  {"id":"case-2b","name":"Bad intermediate","values":{"complaintText":"x","delayHours":6,"expectedAnswer":"Escalate","riskScore":"high"}}
	]`), columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not compatible")

	_, err = normalizeEvalTestCases(json.RawMessage(`[
	  {"id":"case-3","name":"Missing expected","values":{"complaintText":"x","delayHours":6}}
	]`), columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing value")
}

func TestNormalizeEvalTestCasesAllowsObjectSetBackedRows(t *testing.T) {
	t.Parallel()
	columns := map[string]evalColumnDefinition{
		"complaintText":  {APIName: "complaintText", Type: "string", Role: "input"},
		"expectedAnswer": {APIName: "expectedAnswer", Type: "string", Role: "expected_output"},
		"customerObject": {APIName: "customerObject", Type: "object", Role: "metadata"},
		"relatedOrders":  {APIName: "relatedOrders", Type: "object_set", Role: "metadata"},
	}

	raw := json.RawMessage(`[
	  {
	    "id":"object-set-open-customers-customer-1",
	    "name":"Acme Logistics",
	    "source":"object_set",
	    "object_set_backing_id":"backing-open-customers",
	    "values":{
	      "complaintText":"Shipment missed SLA",
	      "expectedAnswer":"Escalate",
	      "customerObject":{"id":"customer-1","objectTypeId":"Customer"},
	      "relatedOrders":[{"id":"order-1","objectTypeId":"Order"}]
	    },
	    "metadata":{
	      "object_set_id":"object-set-open-customers",
	      "object_set_backing_id":"backing-open-customers",
	      "object_id":"customer-1",
	      "refresh_mode":"snapshot"
	    }
	  }
	]`)

	normalized, err := normalizeEvalTestCases(raw, columns)

	require.NoError(t, err)
	assert.JSONEq(t, string(raw), string(normalized))

	_, err = normalizeEvalTestCases(json.RawMessage(`[
	  {
	    "id":"object-set-missing-metadata",
	    "name":"Bad object set case",
	    "source":"object_set",
	    "values":{"complaintText":"x","expectedAnswer":"y"},
	    "metadata":{"object_set_id":"object-set-open-customers"}
	  }
	]`), columns)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "object_id")
}

func TestNormalizeEvalSourceSurfaceDefaultsInvalidValues(t *testing.T) {
	t.Parallel()
	logicPreview := "logic_preview"
	bad := "not_real"

	assert.Equal(t, "aip_evals_app", normalizeEvalSourceSurface(nil))
	assert.Equal(t, "logic_preview", normalizeEvalSourceSurface(&logicPreview))
	assert.Equal(t, "aip_evals_app", normalizeEvalSourceSurface(&bad))
}

func surfaceByID(t *testing.T, surfaces []models.LogicUsageSurface, id string) models.LogicUsageSurface {
	t.Helper()
	for _, surface := range surfaces {
		if surface.ID == id {
			return surface
		}
	}
	require.Failf(t, "surface not found", "id=%s", id)
	return models.LogicUsageSurface{}
}
