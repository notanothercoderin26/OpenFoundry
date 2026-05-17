package workspace

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/libs/core-models/rid"
)

func TestCompassSearchResponseJSONShapeCMP8(t *testing.T) {
	projectID := uuid.New()
	projectRID := "ri.compass.main.project." + projectID.String()
	ownerID := uuid.New()
	out, err := json.Marshal(CompassSearchResponse{
		Data: []CompassSearchResult{{
			ResourceSearchEntry: ResourceSearchEntry{
				ResourceRID:      projectRID,
				ResourceType:     ResourceSearchTypeProject,
				DisplayName:      "Operations",
				OwningProjectID:  &projectID,
				OwningProjectRID: &projectRID,
				OrganizationRIDs: []string{"ri.compass.main.organization.org-a"},
				MarkingRIDs:      []string{"ri.security.main.marking.internal"},
				LastModifiedAt:   time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC),
				OwnerID:          &ownerID,
				Tags:             []string{"ops"},
				Summary:          "Daily operations project",
				OpenURL:          "/projects/" + projectRID,
			},
			Score: 0.75,
		}},
		NextCursor: stringPtr("cursor-token"),
		Limit:      50,
	})
	require.NoError(t, err)

	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	assert.Contains(t, view, "data")
	assert.Contains(t, view, "next_cursor")
	assert.Contains(t, view, "limit")

	first := view["data"].([]any)[0].(map[string]any)
	for _, key := range []string{
		"rid", "type", "display_name", "owning_project_id",
		"owning_project_rid", "organization_rids", "marking_rids",
		"last_modified_at", "owner_id", "tags", "summary",
		"open_url", "is_deleted", "score",
	} {
		assert.Contains(t, first, key)
	}
}

func TestCompassSearchCursorRoundTripCMP8(t *testing.T) {
	cursor := compassSearchCursor{
		Score:          0.42,
		LastModifiedAt: time.Date(2026, 5, 17, 12, 1, 2, 0, time.UTC),
		ResourceRID:    "ri.compass.main.folder.018f3f3f-2ccf-7b1a-9e1b-7246dfe8c111",
	}
	token, err := encodeCompassSearchCursor(cursor)
	require.NoError(t, err)

	got, err := decodeCompassSearchCursor(token)
	require.NoError(t, err)
	assert.Equal(t, cursor.Score, got.Score)
	assert.Equal(t, cursor.ResourceRID, got.ResourceRID)
	assert.True(t, cursor.LastModifiedAt.Equal(got.LastModifiedAt))
}

func TestParseCompassSearchParamsCMP8(t *testing.T) {
	projectID := uuid.MustParse("018f3f3f-2ccf-7b1a-9e1b-7246dfe8c111")
	projectRID := rid.MustNewUUID("compass", rid.DefaultInstance, "project", projectID).String()
	ownerID := uuid.New()
	cursorToken, err := encodeCompassSearchCursor(compassSearchCursor{
		Score:          1,
		LastModifiedAt: time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC),
		ResourceRID:    "ri.compass.main.project." + projectID.String(),
	})
	require.NoError(t, err)

	params, status, msg := parseCompassSearchParams(url.Values{
		"q":       {"operations"},
		"type":    {"ontology_folder"},
		"project": {projectRID},
		"owner":   {ownerID.String()},
		"marking": {"internal", "internal", " regulated "},
		"limit":   {"999"},
		"cursor":  {cursorToken},
	})

	require.Zero(t, status, msg)
	assert.Equal(t, "operations", params.Query)
	require.NotNil(t, params.Type)
	assert.Equal(t, ResourceSearchTypeFolder, *params.Type)
	require.NotNil(t, params.ProjectID)
	assert.Equal(t, projectID, *params.ProjectID)
	require.NotNil(t, params.OwnerID)
	assert.Equal(t, ownerID, *params.OwnerID)
	assert.Equal(t, []string{"internal", "regulated"}, params.MarkingRIDs)
	assert.Equal(t, maxCompassSearchLimit, params.Limit)
	require.NotNil(t, params.Cursor)
	assert.Equal(t, cursorToken, mustEncodeCursor(t, *params.Cursor))
}

func TestParseCompassSearchParamsRejectsInvalidCMP8(t *testing.T) {
	_, status, msg := parseCompassSearchParams(url.Values{"limit": {"0"}})
	assert.Equal(t, 400, status)
	assert.Contains(t, msg, "limit")

	_, status, msg = parseCompassSearchParams(url.Values{"project": {"ri.compass.main.folder." + uuid.New().String()}})
	assert.Equal(t, 400, status)
	assert.Contains(t, msg, "project")

	_, status, msg = parseCompassSearchParams(url.Values{"owner": {"not-a-uuid"}})
	assert.Equal(t, 400, status)
	assert.Contains(t, msg, "owner")

	_, status, msg = parseCompassSearchParams(url.Values{"cursor": {"not-base64"}})
	assert.Equal(t, 400, status)
	assert.Contains(t, msg, "cursor")
}

func TestSearchCompassRequiresAuthCMP8(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest("GET", "/api/v1/compass/search?q=ops", nil)
	rec := httptest.NewRecorder()
	h.SearchCompass(rec, req)
	assert.Equal(t, 401, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func mustEncodeCursor(t *testing.T, cursor compassSearchCursor) string {
	t.Helper()
	token, err := encodeCompassSearchCursor(cursor)
	require.NoError(t, err)
	return token
}

func stringPtr(value string) *string { return &value }
