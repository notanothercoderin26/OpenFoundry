package retentionpolicy

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/audit-compliance-service/internal/models"
)

func mkPolicy(t *testing.T, system bool, sel models.RetentionSelector) models.RetentionPolicy {
	t.Helper()
	selJSON, _ := json.Marshal(sel)
	critJSON, _ := json.Marshal(models.RetentionCriteria{})
	return models.RetentionPolicy{
		ID:                 uuid.New(),
		Name:               "p",
		Scope:              "",
		TargetKind:         "transaction",
		RetentionDays:      0,
		LegalHold:          false,
		PurgeMode:          "hard-delete-after-ttl",
		Rules:              json.RawMessage(`[]`),
		UpdatedBy:          "system",
		Active:             true,
		IsSystem:           system,
		Selector:           selJSON,
		Criteria:           critJSON,
		GracePeriodMinutes: 60,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
}

func TestEmptyQueryReturnsAll(t *testing.T) {
	t.Parallel()
	p := []models.RetentionPolicy{mkPolicy(t, false, models.RetentionSelector{})}
	got := FilterPolicies(p, &models.ListRetentionPoliciesQuery{})
	if len(got) != len(p) {
		t.Fatalf("got %d, want %d", len(got), len(p))
	}
}

func TestAllDatasetsSelectorMatchesAny(t *testing.T) {
	t.Parallel()
	p := []models.RetentionPolicy{mkPolicy(t, true, models.RetentionSelector{AllDatasets: true})}
	rid := "ri.x"
	q := &models.ListRetentionPoliciesQuery{DatasetRid: &rid}
	if got := FilterPolicies(p, q); len(got) != 1 {
		t.Fatalf("got %d", len(got))
	}
}

func TestExplicitDatasetRidFiltersOut(t *testing.T) {
	t.Parallel()
	matchRID := "ri.match"
	otherRID := "ri.other"
	policies := []models.RetentionPolicy{
		mkPolicy(t, false, models.RetentionSelector{DatasetRid: &matchRID}),
		mkPolicy(t, false, models.RetentionSelector{DatasetRid: &otherRID}),
	}
	q := &models.ListRetentionPoliciesQuery{DatasetRid: &matchRID}
	got := FilterPolicies(policies, q)
	if len(got) != 1 {
		t.Fatalf("got %d", len(got))
	}
	if sel, _ := models.SelectorFromRaw(got[0].Selector); sel.DatasetRid == nil || *sel.DatasetRid != matchRID {
		t.Fatalf("wrong policy returned")
	}
}

func TestSystemOnlyFiltersUserPolicies(t *testing.T) {
	t.Parallel()
	policies := []models.RetentionPolicy{
		mkPolicy(t, true, models.RetentionSelector{}),
		mkPolicy(t, false, models.RetentionSelector{}),
	}
	yes := true
	q := &models.ListRetentionPoliciesQuery{SystemOnly: &yes}
	got := FilterPolicies(policies, q)
	if len(got) != 1 || !got[0].IsSystem {
		t.Fatalf("expected one system policy, got %v", got)
	}
}

func TestResolveApplicableExplicitWinsOverInherited(t *testing.T) {
	t.Parallel()
	rid := "ri.foundry.dataset"
	projectID := uuid.New()
	explicitSelector := models.RetentionSelector{DatasetRid: &rid}
	projectSelector := models.RetentionSelector{ProjectID: &projectID}
	allSelector := models.RetentionSelector{AllDatasets: true}
	policies := []models.RetentionPolicy{
		mkPolicy(t, false, explicitSelector),
		mkPolicy(t, false, projectSelector),
		mkPolicy(t, true, allSelector),
	}
	resolved := ResolveApplicable(policies, rid, &models.ResolutionContext{ProjectID: &projectID})
	if len(resolved.Explicit) != 1 {
		t.Fatalf("expected 1 explicit, got %d", len(resolved.Explicit))
	}
	if len(resolved.Inherited.Project) != 1 {
		t.Fatalf("expected 1 inherited.project, got %d", len(resolved.Inherited.Project))
	}
	if len(resolved.Inherited.Org) != 1 {
		t.Fatalf("expected 1 inherited.org, got %d", len(resolved.Inherited.Org))
	}
	if resolved.Effective == nil {
		t.Fatal("effective must not be nil")
	}
	if resolved.Effective.ID != policies[0].ID {
		t.Fatalf("explicit policy must win, got %v", resolved.Effective.ID)
	}
}

func TestResolveApplicableLegalHoldWins(t *testing.T) {
	t.Parallel()
	rid := "ri.x"
	hold := mkPolicy(t, false, models.RetentionSelector{DatasetRid: &rid})
	hold.LegalHold = true
	hold.RetentionDays = 365
	short := mkPolicy(t, false, models.RetentionSelector{DatasetRid: &rid})
	short.RetentionDays = 7
	resolved := ResolveApplicable([]models.RetentionPolicy{short, hold}, rid, &models.ResolutionContext{})
	if resolved.Effective == nil || !resolved.Effective.LegalHold {
		t.Fatal("legal_hold must win the resolution")
	}
}

func TestResolveApplicableUsesStructuredDatasetAndSpaceSelectors(t *testing.T) {
	t.Parallel()
	rid := "ri.foundry.main.dataset.structured"
	spaceID := uuid.New()
	explicit := mkPolicy(t, false, models.RetentionSelector{})
	explicit.DatasetSelectors = []models.RetentionDatasetSelector{{Mode: "select", Kind: "dataset_rids", DatasetRIDs: []string{rid}}}
	space := mkPolicy(t, false, models.RetentionSelector{})
	space.SpaceID = &spaceID
	space.DatasetSelectors = []models.RetentionDatasetSelector{{Mode: "select", Kind: "all"}}
	org := mkPolicy(t, false, models.RetentionSelector{})
	org.DatasetSelectors = []models.RetentionDatasetSelector{{Mode: "select", Kind: "all"}}

	resolved := ResolveApplicable([]models.RetentionPolicy{org, space, explicit}, rid, &models.ResolutionContext{SpaceID: &spaceID})
	if len(resolved.Explicit) != 1 || resolved.Explicit[0].ID != explicit.ID {
		t.Fatalf("explicit structured selector did not match dataset: %#v", resolved.Explicit)
	}
	if len(resolved.Inherited.Space) != 1 || resolved.Inherited.Space[0].ID != space.ID {
		t.Fatalf("space structured selector did not inherit: %#v", resolved.Inherited.Space)
	}
	if len(resolved.Inherited.Org) != 1 || resolved.Inherited.Org[0].ID != org.ID {
		t.Fatalf("org structured selector did not inherit: %#v", resolved.Inherited.Org)
	}
}

func TestValidateRetentionPolicyShapeRequiresDangerAcknowledgement(t *testing.T) {
	t.Parallel()
	policy := mkPolicy(t, false, models.RetentionSelector{})
	policy.PolicyType = RetentionPolicyTypeCustom
	policy.TargetKind = "transaction"
	policy.AllowLatestViewDeletion = true

	if err := ValidateRetentionPolicyShape(&policy); err == nil {
		t.Fatal("expected missing danger acknowledgement to be rejected")
	}
	policy.DangerAcknowledgement = RetentionDangerAcknowledgement
	if err := ValidateRetentionPolicyShape(&policy); err != nil {
		t.Fatalf("valid acknowledgement rejected: %v", err)
	}
}

func TestValidateRetentionPolicyShapeSupportsStructuredSelectors(t *testing.T) {
	t.Parallel()
	policy := mkPolicy(t, false, models.RetentionSelector{})
	policy.PolicyType = RetentionPolicyTypeCustom
	policy.TargetKind = "transaction"
	policy.DatasetSelectors = []models.RetentionDatasetSelector{
		{Mode: "select", Kind: "dataset_rids", DatasetRIDs: []string{"ri.foundry.main.dataset.123"}},
		{Mode: "exclude", Kind: "trash"},
	}
	policy.TransactionSelectors = []models.RetentionTransactionSelector{
		{Kind: "only_branch", Branch: "master"},
		{Kind: "older_than", DurationSeconds: 90 * 24 * 60 * 60},
		{Kind: "transaction_count", Count: 20},
	}

	if err := ValidateRetentionPolicyShape(&policy); err != nil {
		t.Fatalf("structured selectors rejected: %v", err)
	}

	policy.DatasetSelectors[0].DatasetRIDs = nil
	if err := ValidateRetentionPolicyShape(&policy); err == nil {
		t.Fatal("dataset_rids selector without dataset_rids must be rejected")
	}
}

func TestRetentionPolicyWarningsExposeRecommendedLegacyAndDanger(t *testing.T) {
	t.Parallel()
	policy := mkPolicy(t, true, models.RetentionSelector{AllDatasets: true})
	policy.PolicyType = RetentionPolicyTypeRecommended
	policy.LegacyDeprecationStatus = ""
	policy.AllowLatestViewDeletion = true
	policy.AbortOpenTransactions = true

	warnings := RetentionPolicyWarnings(&policy)
	codes := map[string]bool{}
	for _, warning := range warnings {
		codes[warning.Code] = true
	}
	for _, code := range []string{"recommended-policy-managed", "no-select-dataset-selector", "current-view-transaction-deletion", "abort-open-transactions"} {
		if !codes[code] {
			t.Fatalf("missing warning code %s in %#v", code, warnings)
		}
	}

	policy.IsSystem = false
	policy.PolicyType = RetentionPolicyTypeLegacy
	warnings = RetentionPolicyWarnings(&policy)
	foundLegacy := false
	for _, warning := range warnings {
		if warning.Code == "legacy-retention-policy-deprecated" {
			foundLegacy = true
		}
	}
	if !foundLegacy {
		t.Fatalf("legacy warning missing in %#v", warnings)
	}
}

func TestMatchesTransactionDoesNotAbortOpenByDefault(t *testing.T) {
	t.Parallel()
	policy := mkPolicy(t, false, models.RetentionSelector{})
	policy.PolicyType = RetentionPolicyTypeCustom
	policy.RetentionDays = 0
	txn := transactionPreviewRow{
		ID:        uuid.New(),
		TxType:    "APPEND",
		Status:    "OPEN",
		StartedAt: time.Now().UTC().Add(-48 * time.Hour),
	}

	if _, ok := matchesTransaction(&policy, &txn, time.Now().UTC()); ok {
		t.Fatal("open transaction must not match unless abort_open_transactions is enabled")
	}
	policy.AbortOpenTransactions = true
	policy.DangerAcknowledgement = RetentionDangerAcknowledgement
	if reason, ok := matchesTransaction(&policy, &txn, time.Now().UTC()); !ok || !strings.Contains(reason, "abort_open_transactions=true") {
		t.Fatalf("open transaction should match with abort flag, ok=%v reason=%q", ok, reason)
	}
}
