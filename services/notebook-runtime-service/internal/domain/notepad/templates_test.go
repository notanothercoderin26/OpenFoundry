package notepad

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

func TestSubstituteTokensReplacesKnownInputs(t *testing.T) {
	t.Parallel()
	out := SubstituteTokens("Welcome to {{input.airport_name}} in {{input.year}}", map[string]string{
		"airport_name": "Chicago O'Hare",
		"year":         "2026",
	})
	if out != "Welcome to Chicago O'Hare in 2026" {
		t.Fatalf("substitution drift: %q", out)
	}
}

func TestSubstituteTokensKeepsUnknownTokens(t *testing.T) {
	t.Parallel()
	out := SubstituteTokens("Hello {{input.missing}}", map[string]string{})
	if !strings.Contains(out, "{{input.missing}}") {
		t.Fatalf("expected unknown token to survive; got %q", out)
	}
}

func TestSubstituteTokensIgnoresOtherDoubleBraces(t *testing.T) {
	t.Parallel()
	out := SubstituteTokens("{{widget:airline}} stays", map[string]string{"airline": "JAL"})
	if out != "{{widget:airline}} stays" {
		t.Fatalf("widget marker should not be touched; got %q", out)
	}
}

func TestSubstituteJSONWalksTextLeaves(t *testing.T) {
	t.Parallel()
	raw := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Region {{input.region}} report"}]}]}`)
	out, err := SubstituteJSON(raw, map[string]string{"region": "EMEA"})
	if err != nil {
		t.Fatalf("SubstituteJSON: %v", err)
	}
	if !strings.Contains(string(out), "Region EMEA report") {
		t.Fatalf("expected substitution in JSON; got %s", out)
	}
}

func TestValidateInputsAppliesDefaults(t *testing.T) {
	t.Parallel()
	schema := []models.NotepadTemplateInput{
		{Key: "region", Type: models.NotepadTemplateInputString, Default: "EMEA"},
		{Key: "year", Type: models.NotepadTemplateInputNumber, Default: "2026"},
	}
	out, err := ValidateInputs(schema, map[string]string{"year": "2030"})
	if err != nil {
		t.Fatalf("ValidateInputs: %v", err)
	}
	if out["region"] != "EMEA" || out["year"] != "2030" {
		t.Fatalf("defaults / overrides drifted: %+v", out)
	}
}

func TestValidateInputsRequiresMissingRequired(t *testing.T) {
	t.Parallel()
	schema := []models.NotepadTemplateInput{
		{Key: "region", Type: models.NotepadTemplateInputString, Required: true},
	}
	_, err := ValidateInputs(schema, map[string]string{})
	if !errors.Is(err, ErrTemplateMissingRequiredInput) {
		t.Fatalf("expected ErrTemplateMissingRequiredInput, got %v", err)
	}
}

func TestValidateInputsAllowsExtras(t *testing.T) {
	t.Parallel()
	schema := []models.NotepadTemplateInput{
		{Key: "region", Type: models.NotepadTemplateInputString, Default: "EMEA"},
	}
	out, err := ValidateInputs(schema, map[string]string{"region": "APAC", "extra_param": "value"})
	if err != nil {
		t.Fatalf("ValidateInputs: %v", err)
	}
	if out["extra_param"] != "value" {
		t.Fatalf("extra input dropped: %+v", out)
	}
}

func TestInstantiateRunsFullSubstitution(t *testing.T) {
	t.Parallel()
	tpl := &models.NotepadTemplate{
		Content:    "Airport: {{input.airport_name}}",
		ContentDoc: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Title {{input.airport_name}}"}]}]}`),
		Widgets:    json.RawMessage(`[{"title":"Charts for {{input.airport_name}}"}]`),
		InputsSchema: []models.NotepadTemplateInput{
			{Key: "airport_name", Type: models.NotepadTemplateInputString, Required: true},
		},
	}
	content, contentDoc, widgets, err := Instantiate(tpl, map[string]string{"airport_name": "Chicago O'Hare"})
	if err != nil {
		t.Fatalf("Instantiate: %v", err)
	}
	if content != "Airport: Chicago O'Hare" {
		t.Fatalf("content drift: %q", content)
	}
	if !strings.Contains(string(contentDoc), "Title Chicago O'Hare") {
		t.Fatalf("contentDoc drift: %s", contentDoc)
	}
	if !strings.Contains(string(widgets), "Charts for Chicago O'Hare") {
		t.Fatalf("widgets drift: %s", widgets)
	}
}

func TestInstantiateFailsOnRequiredMissing(t *testing.T) {
	t.Parallel()
	tpl := &models.NotepadTemplate{
		InputsSchema: []models.NotepadTemplateInput{
			{Key: "airport_name", Type: models.NotepadTemplateInputString, Required: true},
		},
	}
	_, _, _, err := Instantiate(tpl, map[string]string{})
	if !errors.Is(err, ErrTemplateMissingRequiredInput) {
		t.Fatalf("expected ErrTemplateMissingRequiredInput, got %v", err)
	}
}

func TestSubstituteTokensWithUnderscoreAndDashKeys(t *testing.T) {
	t.Parallel()
	out := SubstituteTokens("{{input.my-key}} and {{input.my_key2}}", map[string]string{
		"my-key":  "X",
		"my_key2": "Y",
	})
	if out != "X and Y" {
		t.Fatalf("keys with - and _ should both substitute; got %q", out)
	}
}
