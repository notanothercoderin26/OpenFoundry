package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestGeopoliticaWorkflowsParseAsCreateRequests smoke-tests that each
// workflow definition in the PoC asset YAML round-trips into a valid
// CreateWorkflowRequest. Keeps the asset honest: any drift between
// the YAML shape and the wire schema breaks `make test` rather than
// the operator's terminal.
func TestGeopoliticaWorkflowsParseAsCreateRequests(t *testing.T) {
	t.Parallel()

	repoRoot, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	path := filepath.Join(repoRoot, "PoC/geopolitica/assets/workflows-geopolitica.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	var doc struct {
		Workflows struct {
			Definitions []struct {
				Name          string         `yaml:"name"`
				Description   string         `yaml:"description"`
				Status        string         `yaml:"status"`
				TriggerType   string         `yaml:"trigger_type"`
				TriggerConfig map[string]any `yaml:"trigger_config"`
				Steps         []struct {
					ID          string         `yaml:"id"`
					Name        string         `yaml:"name"`
					StepType    string         `yaml:"step_type"`
					Description string         `yaml:"description"`
					Config      map[string]any `yaml:"config"`
					NextStepID  string         `yaml:"next_step_id"`
				} `yaml:"steps"`
			} `yaml:"definitions"`
		} `yaml:"workflows"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("yaml: %v", err)
	}
	if got := len(doc.Workflows.Definitions); got != 3 {
		t.Fatalf("want 3 workflow definitions, got %d", got)
	}

	wantNames := map[string]bool{
		"actor-watchlist-alert":        false,
		"actor-alert-escalation":       false,
		"investigation-case-creation":  false,
	}

	for i, def := range doc.Workflows.Definitions {
		if def.Name == "" {
			t.Fatalf("definitions[%d]: empty name", i)
		}
		if def.TriggerType == "" {
			t.Fatalf("definitions[%d] %q: empty trigger_type", i, def.Name)
		}
		if _, ok := wantNames[def.Name]; ok {
			wantNames[def.Name] = true
		}

		steps := make([]WorkflowStep, 0, len(def.Steps))
		seen := map[string]bool{}
		for j, s := range def.Steps {
			if s.ID == "" {
				t.Fatalf("definitions[%d].steps[%d]: empty id", i, j)
			}
			if seen[s.ID] {
				t.Fatalf("definitions[%d] %q: duplicate step id %q", i, def.Name, s.ID)
			}
			seen[s.ID] = true
			if s.StepType == "" {
				t.Fatalf("definitions[%d] %q: steps[%d] %q empty step_type", i, def.Name, j, s.ID)
			}
			cfgRaw, err := json.Marshal(s.Config)
			if err != nil {
				t.Fatalf("definitions[%d] %q: marshal step config: %v", i, def.Name, err)
			}
			var next *string
			if s.NextStepID != "" {
				v := s.NextStepID
				next = &v
			}
			steps = append(steps, WorkflowStep{
				ID:          s.ID,
				Name:        s.Name,
				StepType:    s.StepType,
				Description: s.Description,
				Config:      cfgRaw,
				NextStepID:  next,
			})
		}

		// next_step_id targets must resolve within the same definition.
		for _, s := range steps {
			if s.NextStepID != nil && !seen[*s.NextStepID] {
				t.Fatalf("definitions %q: step %q next_step_id %q does not exist in this workflow",
					def.Name, s.ID, *s.NextStepID)
			}
		}

		triggerCfg, err := json.Marshal(def.TriggerConfig)
		if err != nil {
			t.Fatalf("definitions %q: marshal trigger_config: %v", def.Name, err)
		}
		req := CreateWorkflowRequest{
			Name:          def.Name,
			TriggerType:   def.TriggerType,
			TriggerConfig: triggerCfg,
			Steps:         steps,
		}
		// Round-trip — proves the JSON tags match the service's wire shape.
		body, err := json.Marshal(req)
		if err != nil {
			t.Fatalf("definitions %q: marshal CreateWorkflowRequest: %v", def.Name, err)
		}
		var back CreateWorkflowRequest
		if err := json.Unmarshal(body, &back); err != nil {
			t.Fatalf("definitions %q: re-unmarshal: %v", def.Name, err)
		}
		if back.Name != def.Name || len(back.Steps) != len(steps) {
			t.Fatalf("definitions %q: round-trip mismatch", def.Name)
		}
	}

	for name, seen := range wantNames {
		if !seen {
			t.Fatalf("expected workflow definition %q missing from asset", name)
		}
	}
}
