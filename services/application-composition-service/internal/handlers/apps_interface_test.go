package handlers

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractInterfaceVariables_ReturnsOnlyEnabledInterfaceVariables(t *testing.T) {
	t.Parallel()

	settings := json.RawMessage(`{
		"workshop_variables": [
			{"id":"a","kind":"string","name":"Selected","external_id":"selectedFlight",
			 "interface":{"enabled":true,"display_name":"Selected Flight","description":"Currently selected flight"}},
			{"id":"b","kind":"string","name":"Filter","external_id":"filterStatus",
			 "interface":{"enabled":false},
			 "routing":{"enabled":true}},
			{"id":"c","kind":"string","name":"Plain"},
			{"id":"d","kind":"string","name":"WithExtIDNoInterface","external_id":"justRouting",
			 "routing":{"enabled":true}}
		]
	}`)

	got, err := extractInterfaceVariables(settings)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "selectedFlight", got[0].ExternalID)
	require.Equal(t, "string", got[0].Kind)
	require.Equal(t, "Selected Flight", got[0].DisplayName)
	require.Equal(t, "Currently selected flight", got[0].Description)
}

func TestExtractInterfaceVariables_TransformationExposesOutputKind(t *testing.T) {
	t.Parallel()

	settings := json.RawMessage(`{
		"workshop_variables": [
			{"id":"g","kind":"transformation","name":"Greeting","external_id":"greeting",
			 "interface":{"enabled":true,"display_name":"Greeting"},
			 "transformation":{
				"output_kind":"string",
				"steps":[{"id":"c","op":"current_date","inputs":{}}]
			 }}
		]
	}`)

	got, err := extractInterfaceVariables(settings)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "greeting", got[0].ExternalID)
	require.Equal(t, "transformation", got[0].Kind)
	require.Equal(t, "string", got[0].OutputKind)
}

func TestExtractInterfaceVariables_EmptyAndNil(t *testing.T) {
	t.Parallel()

	got, err := extractInterfaceVariables(nil)
	require.NoError(t, err)
	require.Empty(t, got)

	got, err = extractInterfaceVariables(json.RawMessage("null"))
	require.NoError(t, err)
	require.Empty(t, got)

	got, err = extractInterfaceVariables(json.RawMessage("{}"))
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestExtractInterfaceVariables_RejectsMalformedSettings(t *testing.T) {
	t.Parallel()
	_, err := extractInterfaceVariables(json.RawMessage(`{not valid json`))
	require.Error(t, err)
}
