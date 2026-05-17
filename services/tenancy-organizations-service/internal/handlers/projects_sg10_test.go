package handlers

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/models"
)

func TestSG10MarkingRequirementMatchesIDOrName(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	reqs := []models.PermissionMarkingRequirement{{
		MarkingID:   &id,
		MarkingName: "PII",
		Source:      "project_required_marking",
	}}

	byID := evaluateMarkingRequirement(
		models.PermissionRequirementMarking,
		"Mandatory markings",
		reqs,
		stringTokenSet([]string{id.String()}),
	)
	require.True(t, byID.Satisfied)
	assert.Equal(t, models.PermissionRequirementStatusPassed, byID.Status)

	byName := evaluateMarkingRequirement(
		models.PermissionRequirementMarking,
		"Mandatory markings",
		reqs,
		stringTokenSet([]string{"pii"}),
	)
	require.True(t, byName.Satisfied)

	missing := evaluateMarkingRequirement(
		models.PermissionRequirementMarking,
		"Mandatory markings",
		reqs,
		stringTokenSet([]string{"confidential"}),
	)
	require.False(t, missing.Satisfied)
	assert.Equal(t, models.PermissionRequirementStatusFailed, missing.Status)
	assert.Len(t, missing.Missing, 1)
}

func TestSG10ScopedSessionReportsMissingOrgMarkingAndRestrictedView(t *testing.T) {
	t.Parallel()
	orgID := uuid.New()
	viewID := uuid.New()
	otherView := uuid.New()
	markingID := uuid.New()
	session := &models.PermissionCheckSessionInput{
		AllowedMethods:      []string{"GET"},
		AllowedPathPrefixes: []string{"/api/v1/projects"},
		AllowedOrgIDs:       []uuid.UUID{uuid.New()},
		AllowedMarkings:     []string{"confidential"},
		RestrictedViewIDs:   []uuid.UUID{otherView},
	}
	result := evaluateScopedSessionRequirement(
		session,
		"POST",
		"/api/v1/admin",
		&orgID,
		[]models.PermissionMarkingRequirement{{
			MarkingID:   &markingID,
			MarkingName: "PII",
		}},
		[]models.PermissionRestrictedViewRequirement{{
			RestrictedViewID: viewID,
		}},
	)
	require.False(t, result.Satisfied)
	assert.Equal(t, models.PermissionRequirementStatusFailed, result.Status)
	assert.Contains(t, result.Missing, "method:POST")
	assert.Contains(t, result.Missing, "path:/api/v1/admin")
	assert.Contains(t, result.Missing, "org:"+orgID.String())
	assert.Contains(t, result.Missing, "restricted_view:"+viewID.String())
}

func TestSG10LineageRequirementExplainsAdditionalDataAccess(t *testing.T) {
	t.Parallel()
	sourceID := uuid.New()
	targetID := uuid.New()
	markingID := uuid.New()
	result, explanations := evaluateLineageRequirements(
		[]models.PermissionLineageRequirement{{
			SourceResourceKind: "dataset",
			SourceResourceID:   sourceID,
			TargetResourceKind: "dataset",
			TargetResourceID:   &targetID,
			RelationKind:       "derived_from",
			MarkingID:          &markingID,
			MarkingName:        "PII",
			Path:               []string{sourceID.String(), targetID.String()},
		}},
		stringTokenSet([]string{"confidential"}),
	)
	require.False(t, result.Satisfied)
	assert.Equal(t, models.PermissionRequirementStatusFailed, result.Status)
	require.Len(t, explanations, 1)
	assert.Equal(t, "dataset", explanations[0].SourceResourceKind)
	assert.Equal(t, "derived_from", explanations[0].RelationKind)
	assert.Equal(t, models.PermissionRequirementStatusFailed, explanations[0].Status)
}

func TestSG10ParseUUIDListParam(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	got, err := parseUUIDListParam(" "+id.String()+" , ", "group_ids")
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, id, got[0])

	_, err = parseUUIDListParam("nope", "group_ids")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "group_ids")
}
