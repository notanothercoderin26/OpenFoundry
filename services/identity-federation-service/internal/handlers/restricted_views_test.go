package handlers

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
)

func TestValidateCreateRestrictedViewRequestMatchesRustContract(t *testing.T) {
	t.Parallel()

	enabled := true
	body := &models.CreateRestrictedViewRequest{
		Name:            " confidential redaction ",
		Resource:        " datasets ",
		Action:          " read ",
		HiddenColumns:   json.RawMessage(`["ssn"]`),
		AllowedOrgIDs:   json.RawMessage(`["` + uuid.NewString() + `"]`),
		AllowedMarkings: json.RawMessage(`["public","pii"]`),
		Enabled:         &enabled,
	}

	require.NoError(t, validateCreateRestrictedViewRequest(body))
	require.Equal(t, "confidential redaction", body.Name)
	require.Equal(t, "datasets", body.Resource)
	require.Equal(t, "read", body.Action)
}

func TestValidateRestrictedViewRejectsInvalidHiddenColumn(t *testing.T) {
	t.Parallel()

	enabled := true
	body := &models.CreateRestrictedViewRequest{
		Name:          "redaction",
		Resource:      "datasets",
		Action:        "read",
		HiddenColumns: json.RawMessage(`["ssn", " "]`),
		Enabled:       &enabled,
	}

	require.ErrorContains(t, validateCreateRestrictedViewRequest(body), "hidden_columns cannot contain empty values")
}

func TestValidateRestrictedViewRejectsInvalidMarking(t *testing.T) {
	t.Parallel()

	body := &models.UpdateRestrictedViewRequest{
		AllowedMarkings: json.RawMessage(`["secret"]`),
	}

	require.ErrorContains(t, validateUpdateRestrictedViewRequest(body, false), "invalid marking 'secret'")
	require.ErrorContains(t, validateUpdateRestrictedViewRequest(body, false), "expected a marking UUID")
}

func TestValidateRestrictedViewRejectsInvalidAllowedOrgID(t *testing.T) {
	t.Parallel()

	body := &models.UpdateRestrictedViewRequest{
		AllowedOrgIDs: json.RawMessage(`["not-a-uuid"]`),
	}

	require.ErrorContains(t, validateUpdateRestrictedViewRequest(body, false), "allowed_org_ids must be an array of UUIDs")
}

func TestValidateRestrictedViewPUTRequiresFullRustUpsertShape(t *testing.T) {
	t.Parallel()

	body := &models.UpdateRestrictedViewRequest{}

	require.ErrorContains(t, validateUpdateRestrictedViewRequest(body, true), "name, resource, action and enabled required")
}

func TestValidateRestrictedViewAcceptsMarkingColumnsWithSchemaHint(t *testing.T) {
	t.Parallel()

	enabled := true
	body := &models.CreateRestrictedViewRequest{
		Name:                 "case access",
		Resource:             "datasets",
		Action:               "read",
		MarkingColumns:       json.RawMessage(`["data_markings"]`),
		AllowedMarkings:      json.RawMessage(`["` + uuid.NewString() + `"]`),
		BackingDatasetSchema: json.RawMessage(`{"fieldSchemaList":[{"name":"data_markings","type":"ARRAY","arraySubtype":{"type":"STRING"},"customMetadata":{"typeclasses":["marking_type.mandatory"]}}]}`),
		Enabled:              &enabled,
	}

	require.NoError(t, validateCreateRestrictedViewRequest(body))
}

func TestValidateRestrictedViewRejectsUnsupportedMarkingColumnType(t *testing.T) {
	t.Parallel()

	body := &models.UpdateRestrictedViewRequest{
		MarkingColumns:       json.RawMessage(`["data_markings"]`),
		BackingDatasetSchema: json.RawMessage(`{"fields":[{"name":"data_markings","type":"STRING","customMetadata":{"typeclasses":["marking_type.mandatory"]}}]}`),
	}

	require.ErrorContains(t, validateUpdateRestrictedViewRequest(body, false), `marking column "data_markings" must be ARRAY<STRING>`)
}
