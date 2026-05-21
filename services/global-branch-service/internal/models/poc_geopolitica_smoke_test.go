package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestGeopoliticaBranchDemoAssetRoundTrips smoke-tests that the PoC's
// branch-demo YAML round-trips into a valid CreateBranchRequest plus
// AddParticipantRequest list, and that the 12 candidates carry the
// fields the run script needs to assemble per-candidate action bodies.
//
// Also guards the legal pitfall (per the asset's header comment): the
// 12 display names MUST stay fictitious — no overlap with the
// well-known real OFAC SDN entity tokens listed below.
func TestGeopoliticaBranchDemoAssetRoundTrips(t *testing.T) {
	t.Parallel()

	repoRoot, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	path := filepath.Join(repoRoot, "PoC/geopolitica/assets/branch-demo-geopolitica.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	var doc struct {
		BranchDemo struct {
			Branch struct {
				Name        string `yaml:"name"`
				BaseRef     string `yaml:"base_ref"`
				Description string `yaml:"description"`
			} `yaml:"branch"`
			Participants []struct {
				ServiceName    string `yaml:"service_name"`
				LocalBranchRef string `yaml:"local_branch_ref"`
			} `yaml:"participants"`
			Candidates []struct {
				ID           int    `yaml:"id"`
				ActorID      string `yaml:"actor_id"`
				DisplayName  string `yaml:"display_name"`
				Kind         string `yaml:"kind"`
				CountryISO3  string `yaml:"country_iso3"`
				WikidataQID  string `yaml:"wikidata_qid"`
				Rationale    string `yaml:"rationale"`
			} `yaml:"candidates"`
			Finalisation struct {
				Mode             string `yaml:"mode"`
				DryRunMergeFirst bool   `yaml:"dry_run_merge_first"`
			} `yaml:"finalisation"`
		} `yaml:"branch_demo"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("yaml: %v", err)
	}

	bd := doc.BranchDemo

	// 1. CreateBranchRequest round-trip.
	if bd.Branch.Name == "" || bd.Branch.BaseRef == "" {
		t.Fatalf("branch missing name/base_ref")
	}
	req := CreateBranchRequest{
		Name:        bd.Branch.Name,
		BaseRef:     bd.Branch.BaseRef,
		Description: bd.Branch.Description,
	}
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal branch req: %v", err)
	}
	var back CreateBranchRequest
	if err := json.Unmarshal(body, &back); err != nil {
		t.Fatalf("re-unmarshal branch req: %v", err)
	}
	if back.Name != "sanctions-extension-2026Q3" {
		t.Fatalf("branch name drifted: %s", back.Name)
	}

	// 2. AddParticipantRequest round-trip per participant.
	if got := len(bd.Participants); got != 6 {
		t.Fatalf("want 6 participants, got %d", got)
	}
	wantServices := map[string]bool{
		"dataset-versioning-service":      false,
		"pipeline-build-service":          false,
		"ontology-definition-service":     false,
		"object-database-service":         false,
		"ontology-actions-service":        false,
		"application-composition-service": false,
	}
	for _, p := range bd.Participants {
		if p.ServiceName == "" || p.LocalBranchRef == "" {
			t.Fatalf("participant missing fields: %+v", p)
		}
		if _, ok := wantServices[p.ServiceName]; ok {
			wantServices[p.ServiceName] = true
		}
		preq := AddParticipantRequest{ServiceName: p.ServiceName, LocalBranchRef: p.LocalBranchRef}
		if _, err := json.Marshal(preq); err != nil {
			t.Fatalf("marshal participant %s: %v", p.ServiceName, err)
		}
	}
	for svc, seen := range wantServices {
		if !seen {
			t.Fatalf("expected participant %q missing from asset", svc)
		}
	}

	// 3. Candidate sanity — 12 rows, all required fields populated,
	// IDs monotonic from 1..12, actor_id pattern matches, wikidata
	// QIDs in the reserved demo range.
	if got := len(bd.Candidates); got != 12 {
		t.Fatalf("want 12 candidates, got %d", got)
	}
	actorPat := regexp.MustCompile(`^actor:demo:fict-org:0\d{2}$`)
	qidPat := regexp.MustCompile(`^Q9999000\d{3}$`)
	seenActorIDs := map[string]bool{}
	seenQIDs := map[string]bool{}
	for i, c := range bd.Candidates {
		if c.ID != i+1 {
			t.Fatalf("candidates[%d]: id=%d (want %d)", i, c.ID, i+1)
		}
		if !actorPat.MatchString(c.ActorID) {
			t.Fatalf("candidates[%d] actor_id %q does not match demo pattern", i, c.ActorID)
		}
		if !qidPat.MatchString(c.WikidataQID) {
			t.Fatalf("candidates[%d] wikidata_qid %q outside reserved Q999900xxxx range", i, c.WikidataQID)
		}
		if c.DisplayName == "" || c.CountryISO3 == "" || c.Rationale == "" || c.Kind == "" {
			t.Fatalf("candidates[%d] missing required fields: %+v", i, c)
		}
		if seenActorIDs[c.ActorID] {
			t.Fatalf("candidates[%d] duplicate actor_id %q", i, c.ActorID)
		}
		seenActorIDs[c.ActorID] = true
		if seenQIDs[c.WikidataQID] {
			t.Fatalf("candidates[%d] duplicate wikidata_qid %q", i, c.WikidataQID)
		}
		seenQIDs[c.WikidataQID] = true
	}

	// 4. Legal pitfall guard — substring match against well-known
	// real OFAC entity tokens. If a future editor accidentally pastes
	// a real name into the candidate list, this test fails before
	// the demo box reaches a customer. List is non-exhaustive on
	// purpose: a true denylist is the operator's job at ingest time.
	bannedSubstrings := []string{
		"wagner", "rosneft", "gazprom", "putin", "lukashenko",
		"hezbollah", "hamas", "isis", "al-qaeda", "al qaeda",
		"taliban", "iran revolutionary guard", "irgc",
	}
	for _, c := range bd.Candidates {
		lower := strings.ToLower(c.DisplayName)
		for _, b := range bannedSubstrings {
			if strings.Contains(lower, b) {
				t.Fatalf("candidates id=%d display_name %q contains banned real-OFAC token %q — keep candidates fictitious per the asset header",
					c.ID, c.DisplayName, b)
			}
		}
	}

	// 5. Finalisation default — demo script discards.
	if bd.Finalisation.Mode != "discard" {
		t.Fatalf("finalisation.mode = %q; demo script ends with discard", bd.Finalisation.Mode)
	}
}
