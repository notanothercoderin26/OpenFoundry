package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestGeopoliticaWorkshopModuleValidates smoke-tests that the PoC's
// declarative Workshop module JSON normalizes without errors against
// the contract validator. Keeps the asset honest: any drift between
// the JSON and the schema is caught at `make test` rather than at the
// operator's terminal.
func TestGeopoliticaWorkshopModuleValidates(t *testing.T) {
	t.Parallel()

	repoRoot, err := filepath.Abs("../../../..")
	if err != nil { t.Fatalf("abs: %v", err) }
	path := filepath.Join(repoRoot, "PoC/geopolitica/assets/workshop-module.json")
	data, err := os.ReadFile(path)
	if err != nil { t.Fatalf("read %s: %v", path, err) }

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil { t.Fatalf("unmarshal: %v", err) }

	contract, err := NormalizeAppContract(
		"Geopolitical Intel Workbench",
		"geopolitical-intel-workbench",
		"draft",
		raw["pages"], raw["theme"], raw["settings"],
	)
	if err != nil {
		if ve := AsValidationError(err); ve != nil {
			t.Fatalf("validation: code=%s path=%s msg=%s", ve.Code, ve.Path, ve.Message)
		}
		t.Fatalf("normalize: %v", err)
	}

	var pages []AppPage
	if err := json.Unmarshal(contract.Pages, &pages); err != nil { t.Fatalf("re-unmarshal pages: %v", err) }
	if len(pages) != 1 { t.Fatalf("want 1 page, got %d", len(pages)) }
	if pages[0].ID != "workbench" { t.Fatalf("page id %q", pages[0].ID) }
	wantHeader := 2
	if len(pages[0].Widgets) != wantHeader { t.Fatalf("want %d header widgets, got %d", wantHeader, len(pages[0].Widgets)) }
	if len(pages[0].Sections) != 3 { t.Fatalf("want 3 sections, got %d", len(pages[0].Sections)) }
}
