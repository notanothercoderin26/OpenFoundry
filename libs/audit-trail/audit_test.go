package audittrail_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	audittrail "github.com/openfoundry/openfoundry-go/libs/audit-trail"
)

func TestEventKindAndCategoriesMatchRustMapping(t *testing.T) {
	t.Parallel()
	cases := []struct {
		evt     audittrail.AuditEvent
		want    audittrail.EventKind
		wantCat audittrail.AuditCategory
	}{
		{audittrail.NewMediaSetCreated("rid", "p", []string{"public"}, "n", "IMAGE", "open", false), audittrail.KindMediaSetCreated, audittrail.CategoryDataCreate},
		{audittrail.NewMediaSetDeleted("rid", "p", nil), audittrail.KindMediaSetDeleted, audittrail.CategoryDataDelete},
		{audittrail.NewMediaSetMarkingsChanged("rid", "p", []string{"a"}, []string{"b"}), audittrail.KindMediaSetMarkingsChanged, audittrail.CategoryManagementMarkings},
		{audittrail.NewMediaSetRetentionChanged("rid", "p", nil, 100, 200), audittrail.KindMediaSetRetentionChanged, audittrail.CategoryDataUpdate},
		{audittrail.NewMediaSetTransactionOpened("rid", "p", nil, "tx", "main"), audittrail.KindMediaSetTransactionOpened, audittrail.CategoryDataUpdate},
		{audittrail.NewMediaSetAccessPatternInvoked("rid", "p", nil, "thumbnail", "ephemeral"), audittrail.KindMediaSetAccessPatternInvoked, audittrail.CategoryDataLoad},
		{audittrail.NewMediaItemUploaded("itm", "ms", "p", nil, "/x", "image/png", 100, "deadbeef", ""), audittrail.KindMediaItemUploaded, audittrail.CategoryDataImport},
		{audittrail.NewMediaItemDownloaded("itm", "ms", "p", nil, 100, 60), audittrail.KindMediaItemDownloaded, audittrail.CategoryDataExport},
		{audittrail.NewVirtualMediaItemRegistered("itm", "ms", "p", nil, "s3://x", "/p"), audittrail.KindVirtualMediaItemRegistered, audittrail.CategoryDataCreate},
		{audittrail.NewCompassResourceCreated("ri.compass.main.project.p", "ri.compass.main.project.p", nil, "project", "Ops"), audittrail.KindCompassResourceCreated, audittrail.CategoryDataCreate},
		{audittrail.NewCompassResourceMoved("ri.compass.main.folder.f", "ri.compass.main.project.p2", nil, "folder", "Docs", "ri.compass.main.project.p1", "ri.compass.main.project.p2", "ri.compass.main.folder.a", "ri.compass.main.folder.b"), audittrail.KindCompassResourceMoved, audittrail.CategoryDataUpdate},
		{audittrail.NewCompassResourceRenamed("ri.compass.main.folder.f", "ri.compass.main.project.p", nil, "folder", "Old", "New"), audittrail.KindCompassResourceRenamed, audittrail.CategoryDataUpdate},
		{audittrail.NewCompassResourceTrashed("ri.compass.main.folder.f", "ri.compass.main.project.p", nil, "folder", "Docs", "2026-05-17T00:00:00Z", "user-a", 30, "2026-06-16T00:00:00Z"), audittrail.KindCompassResourceTrashed, audittrail.CategoryDataDelete},
		{audittrail.NewCompassResourceRestored("ri.compass.main.folder.f", "ri.compass.main.project.p", nil, "folder", "Docs", "user-a", "original_path", true), audittrail.KindCompassResourceRestored, audittrail.CategoryDataUpdate},
		{audittrail.NewCompassResourcePurged("ri.compass.main.folder.f", "ri.compass.main.project.p", []string{"public"}, "folder", "Docs", "2026-05-17T00:00:00Z", "user-a", "admin-a", 30, "2026-06-16T00:00:00Z", "admin_override", nil, false), audittrail.KindCompassResourcePurged, audittrail.CategoryDataDelete},
		{audittrail.NewCompassResourceShareChanged("ri.compass.main.folder.f", "ri.compass.main.project.p", nil, "folder", "Docs", "share-1", "granted", "user", "user-a", "viewer"), audittrail.KindCompassResourceShareChanged, audittrail.CategoryDataUpdate},
		{audittrail.NewCompassResourceBulkOperation("018f2f1c-aaaa-7bbb-8ccc-000000000021", nil, false), audittrail.KindCompassResourceBulkOperation, audittrail.CategoryDataUpdate},
		{audittrail.NewCompassResourceMarkingsChanged("ri.compass.main.project.p", "ri.compass.main.project.p", []string{"new"}, []string{"old"}, "project", "Ops"), audittrail.KindCompassResourceMarkingsChanged, audittrail.CategoryManagementMarkings},
		{audittrail.NewCompassViewRequirementsPropagated("ri.compass.main.project.p", "ri.compass.main.project.p", []string{"public"}, nil, "project", "job-1", 3, 2, 1, 1, nil, false), audittrail.KindCompassViewReqPropagated, audittrail.CategoryManagementMarkings},
	}

	for _, c := range cases {
		assert.Equal(t, c.want, c.evt.Kind)
		assert.Contains(t, c.evt.Categories(), c.wantCat)
	}
}

func TestEnvelopeJSONShape(t *testing.T) {
	t.Parallel()
	evt := audittrail.NewMediaSetCreated("ri.foundry.main.media_set.x", "ri.foundry.main.project.p",
		[]string{"public"}, "demo", "IMAGE", "open", false)
	ctx := audittrail.AuditContext{ActorID: "user-1", RequestID: "req-1"}
	env, err := audittrail.Build(evt, ctx, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)

	out, err := json.Marshal(env)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))

	for _, k := range []string{
		"event_id", "at", "kind", "categories", "resource_rid", "project_rid",
		"markings_at_event", "actor_id", "request_id", "occurred_at", "payload",
	} {
		assert.Contains(t, view, k, "envelope must carry %q", k)
	}
	assert.Equal(t, "media_set.created", view["kind"])
	assert.Equal(t, []any{"dataCreate"}, view["categories"])
}

func TestCompassResourceLifecyclePayloads(t *testing.T) {
	t.Parallel()
	moved := audittrail.NewCompassResourceMoved(
		"ri.compass.main.folder.f",
		"ri.compass.main.project.new",
		[]string{"ri.marking.main.marking.public"},
		"folder",
		"Runbooks",
		"ri.compass.main.project.old",
		"ri.compass.main.project.new",
		"ri.compass.main.folder.old-parent",
		"ri.compass.main.folder.new-parent",
	)
	renamed := audittrail.NewCompassResourceRenamed(
		"ri.compass.main.folder.f",
		"ri.compass.main.project.new",
		nil,
		"folder",
		"Runbooks",
		"Operations runbooks",
	)
	share := audittrail.NewCompassResourceShareChanged(
		"ri.compass.main.folder.f",
		"ri.compass.main.project.new",
		nil,
		"folder",
		"Operations runbooks",
		"share-1",
		"granted",
		"group",
		"group-a",
		"viewer",
	)

	out, err := json.Marshal([]audittrail.AuditEvent{moved, renamed, share})
	require.NoError(t, err)
	var events []map[string]any
	require.NoError(t, json.Unmarshal(out, &events))

	assert.Equal(t, "compass.resource.moved", events[0]["kind"])
	assert.Equal(t, "ri.compass.main.project.old", events[0]["previous_project_rid"])
	assert.Equal(t, "ri.compass.main.folder.new-parent", events[0]["new_parent_rid"])
	assert.Equal(t, "compass.resource.renamed", events[1]["kind"])
	assert.Equal(t, "Runbooks", events[1]["previous_display_name"])
	assert.Equal(t, "Operations runbooks", events[1]["new_display_name"])
	assert.Equal(t, "compass.resource.share_changed", events[2]["kind"])
	assert.Equal(t, "granted", events[2]["share_change_type"])
	assert.Equal(t, "group", events[2]["share_principal_kind"])
}

func TestCompassResourceBulkOperationPayload(t *testing.T) {
	t.Parallel()
	retentionDays := 30
	evt := audittrail.NewCompassResourceBulkOperation(
		"018f2f1c-aaaa-7bbb-8ccc-000000000021",
		[]audittrail.BulkResourceAction{
			{
				Op:              "trash",
				ResourceKind:    "ontology_folder",
				ResourceID:      "018f2f1c-aaaa-7bbb-8ccc-000000000001",
				ResourceRID:     "ri.compass.main.folder.018f2f1c-aaaa-7bbb-8ccc-000000000001",
				ProjectRID:      "ri.compass.main.project.018f2f1c-aaaa-7bbb-8ccc-000000000002",
				MarkingsAtEvent: []string{"ri.marking.main.marking.public"},
				Status:          "succeeded",
				RetentionDays:   &retentionDays,
			},
			{
				Op:           "share",
				ResourceKind: "dataset",
				ResourceID:   "018f2f1c-aaaa-7bbb-8ccc-000000000003",
				ResourceRID:  "ri.foundry.main.dataset.018f2f1c-aaaa-7bbb-8ccc-000000000003",
				Status:       "preflight_failed",
				Error:        "only an admin may bulk-share externally owned resources",
			},
		},
		true,
	)

	out, err := json.Marshal(evt)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))

	assert.Equal(t, "compass.resource.bulk_operation", view["kind"])
	assert.Equal(t, "mixed", view["batch_operation"])
	assert.Equal(t, float64(2), view["batch_total"])
	assert.Equal(t, float64(1), view["batch_succeeded"])
	assert.Equal(t, float64(1), view["batch_failed"])
	assert.Equal(t, true, view["batch_preflight_failed"])
	assert.Equal(t, "ri.compass.main.bulk-operation.018f2f1c-aaaa-7bbb-8ccc-000000000021", view["resource_rid"])
	actions, ok := view["batch_actions"].([]any)
	require.True(t, ok)
	require.Len(t, actions, 2)
	first, ok := actions[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "trash", first["op"])
	assert.Equal(t, float64(30), first["retention_days"])
	second, ok := actions[1].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "preflight_failed", second["status"])
	assert.Contains(t, second["error"], "externally owned resources")
}

func TestCompassResourcePurgedPayloadListsDependents(t *testing.T) {
	t.Parallel()
	evt := audittrail.NewCompassResourcePurged(
		"ri.compass.main.project.p",
		"ri.compass.main.project.p",
		[]string{"ri.security.main.marking.public"},
		"project",
		"Operations",
		"2026-05-17T10:00:00Z",
		"user-a",
		"admin-a",
		30,
		"2026-06-16T10:00:00Z",
		"admin_override",
		[]audittrail.AffectedDependent{{
			Kind:         "folder",
			RID:          "ri.compass.main.folder.f",
			Relationship: "project_child",
			Action:       "cascade_delete",
		}},
		false,
	)

	out, err := json.Marshal(evt)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	assert.Equal(t, "compass.resource.purged", view["kind"])
	assert.Equal(t, "project", view["resource_type"])
	assert.Equal(t, "Operations", view["display_name"])
	assert.Equal(t, "admin_override", view["purge_mode"])
	assert.Equal(t, float64(30), view["retention_days"])
	assert.Equal(t, false, view["dependent_list_truncated"])
	dependents, ok := view["affected_dependents"].([]any)
	require.True(t, ok)
	require.Len(t, dependents, 1)
	dep, ok := dependents[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "folder", dep["kind"])
	assert.Equal(t, "cascade_delete", dep["action"])
}

func TestCompassViewRequirementsPropagatedPayload(t *testing.T) {
	t.Parallel()
	evt := audittrail.NewCompassViewRequirementsPropagated(
		"ri.compass.main.project.p",
		"ri.compass.main.project.p",
		[]string{"ri.marking.main.marking.pii"},
		[]string{"ri.marking.main.marking.old"},
		"project",
		"018f2f1c-aaaa-7bbb-8ccc-000000000019",
		3,
		2,
		1,
		1,
		[]audittrail.AffectedDependent{{
			Kind:         "folder",
			RID:          "ri.compass.main.folder.f",
			Relationship: "view_requirements_child_folder",
			Action:       "view_requirements_updated",
		}},
		false,
	)

	out, err := json.Marshal(evt)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	assert.Equal(t, "compass.view_requirements.propagated", view["kind"])
	assert.Equal(t, "project", view["parent_resource_kind"])
	assert.Equal(t, "018f2f1c-aaaa-7bbb-8ccc-000000000019", view["propagation_job_id"])
	assert.Equal(t, float64(3), view["total_folders"])
	assert.Equal(t, float64(2), view["changed_folders"])
	assert.Equal(t, false, view["dependent_list_truncated"])
	dependents, ok := view["affected_dependents"].([]any)
	require.True(t, ok)
	require.Len(t, dependents, 1)
}

func TestEventIDIsDeterministic(t *testing.T) {
	t.Parallel()
	evt := audittrail.NewMediaSetCreated("rid", "p", nil, "n", "IMAGE", "open", false)
	ctx := audittrail.AuditContext{RequestID: "req-1"}
	env1, err := audittrail.Build(evt, ctx, time.Now())
	require.NoError(t, err)
	env2, err := audittrail.Build(evt, ctx, time.Now().Add(time.Hour))
	require.NoError(t, err)

	assert.Equal(t, env1.EventID, env2.EventID,
		"same (kind, resource_rid, identity_seed) MUST yield the same event_id")
}

func TestEventIDDifferentRequestIDDifferentID(t *testing.T) {
	t.Parallel()
	evt := audittrail.NewMediaSetCreated("rid", "p", nil, "n", "IMAGE", "open", false)
	id1, err := audittrail.Build(evt, audittrail.AuditContext{RequestID: "req-1"}, time.Now())
	require.NoError(t, err)
	id2, err := audittrail.Build(evt, audittrail.AuditContext{RequestID: "req-2"}, time.Now())
	require.NoError(t, err)
	assert.NotEqual(t, id1.EventID, id2.EventID)
}

// TestEventIDMatchesCrossLanguageGolden locks the v5 derivation
// against a stable RFC 4122 SHA-1 namespace/name combination. The
// expected UUIDs were computed with Python's uuid.uuid5 (RFC 4122
// SHA-1) — a regression here means producers in any language would
// compute different event_ids and outbox idempotency would silently
// break.
func TestEventIDMatchesCrossLanguageGolden(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind, rid, seed, want string
	}{
		{"media_set.created", "rid", "seed", "69a92f8b-8a2e-562e-b7e2-5011a4154773"},
		{"media_item.uploaded", "itm", "req-99", "7b0c0923-7fb3-5446-9b88-322af1e08bc9"},
	}
	for _, c := range cases {
		got := audittrail.DeriveEventID(c.kind, c.rid, c.seed).String()
		assert.Equal(t, c.want, got, "kind=%s rid=%s seed=%s", c.kind, c.rid, c.seed)
	}
}
