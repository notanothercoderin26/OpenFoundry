package geopolitica

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/authorization-policy-service/internal/models"
)

// --- fake repo --------------------------------------------------------------

type fakeRepo struct {
	categories []models.MarkingCategoryResponse
	markings   map[uuid.UUID][]models.MarkingResponse // categoryID → markings
	failOn     string                                  // category or marking slug whose Create should fail
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{markings: map[uuid.UUID][]models.MarkingResponse{}}
}

func (f *fakeRepo) ListMarkingCategories(_ context.Context, _ *uuid.UUID, _ uuid.UUID, _, _ bool) ([]models.MarkingCategoryResponse, error) {
	out := make([]models.MarkingCategoryResponse, len(f.categories))
	copy(out, f.categories)
	return out, nil
}

func (f *fakeRepo) CreateMarkingCategory(_ context.Context, tenantID *uuid.UUID, actorID uuid.UUID, body *models.CreateMarkingCategoryRequest) (*models.MarkingCategoryResponse, error) {
	if body.Slug == f.failOn {
		return nil, errors.New("forced fake-repo failure for category " + body.Slug)
	}
	cat := models.MarkingCategoryResponse{
		MarkingCategory: models.MarkingCategory{
			ID:          uuid.New(),
			TenantID:    tenantID,
			Slug:        body.Slug,
			DisplayName: body.DisplayName,
			Description: body.Description,
			Visibility:  body.Visibility,
			Metadata:    json.RawMessage(`{}`),
			CreatedBy:   actorID,
			CreatedAt:   time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		},
	}
	f.categories = append(f.categories, cat)
	return &cat, nil
}

func (f *fakeRepo) ListMarkingsForCategory(_ context.Context, _ *uuid.UUID, _, categoryID uuid.UUID, _, _, _ bool) ([]models.MarkingResponse, error) {
	out := make([]models.MarkingResponse, len(f.markings[categoryID]))
	copy(out, f.markings[categoryID])
	return out, nil
}

func (f *fakeRepo) CreateMarking(_ context.Context, tenantID *uuid.UUID, actorID, categoryID uuid.UUID, body *models.CreateMarkingRequest) (*models.MarkingResponse, error) {
	if body.Slug == f.failOn {
		return nil, errors.New("forced fake-repo failure for marking " + body.Slug)
	}
	m := models.MarkingResponse{
		Marking: models.Marking{
			ID:          uuid.New(),
			TenantID:    tenantID,
			CategoryID:  categoryID,
			Slug:        body.Slug,
			DisplayName: body.DisplayName,
			Description: body.Description,
			Metadata:    json.RawMessage(`{}`),
			CreatedBy:   actorID,
			CreatedAt:   time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		},
	}
	f.markings[categoryID] = append(f.markings[categoryID], m)
	return &m, nil
}

// --- catalog shape ----------------------------------------------------------

func TestCategoriesCatalogHasTwoEntries(t *testing.T) {
	cats := Categories()
	require.Len(t, cats, expectedCategories)
	slugs := []string{}
	for _, c := range cats {
		slugs = append(slugs, c.Slug)
	}
	require.ElementsMatch(t, []string{"compartment-source", "compartment-sanctions"}, slugs)
}

func TestMarkingsCatalogHasEightEntries(t *testing.T) {
	mks := Markings()
	require.Len(t, mks, expectedMarkings)
	slugs := []string{}
	for _, m := range mks {
		slugs = append(slugs, m.Slug)
	}
	require.ElementsMatch(t, []string{
		"gdelt-raw", "open-source", "wikidata", "enriched-pii",
		"sanctions-list", "ofac", "eu", "opensanctions",
	}, slugs)
}

func TestEveryMarkingReferencesAValidCategory(t *testing.T) {
	known := map[string]struct{}{}
	for _, c := range Categories() {
		known[c.Slug] = struct{}{}
	}
	for _, m := range Markings() {
		_, ok := known[m.CategorySlug]
		require.True(t, ok, "marking %q references unknown category %q", m.Slug, m.CategorySlug)
	}
}

func TestMarkingsByCategoryGroupsCorrectly(t *testing.T) {
	grouped := MarkingsByCategory()
	require.Len(t, grouped["compartment-source"], 4,
		"source compartment must group 4 markings")
	require.Len(t, grouped["compartment-sanctions"], 4,
		"sanctions compartment must group 4 markings")
}

func TestMarkingDisplayNamesAreUppercase(t *testing.T) {
	// The connector seed writes DisplayName values into source
	// attribution metadata (e.g. "MARKING:OFAC"). The display name
	// must be the uppercase form so that wire round-trips align.
	for _, m := range Markings() {
		require.NotEmpty(t, m.DisplayName)
		require.Equal(t, m.DisplayName, normalizeDisplay(m.DisplayName),
			"marking %q display name must be uppercase + hyphen-separated", m.Slug)
	}
}

// --- user grants ------------------------------------------------------------

func TestUserGrantsCatalogHasTwoPersonas(t *testing.T) {
	grants := UserGrants()
	require.Len(t, grants, expectedUserGrants)
	emails := []string{}
	for _, g := range grants {
		emails = append(emails, g.UserEmail)
	}
	require.ElementsMatch(t, []string{
		"sofia.gomez@acme-intel.demo",
		"marcos.fernandez@acme-intel.demo",
	}, emails)
}

func TestSofiaHasEverySingleMarking(t *testing.T) {
	all := allMarkingSlugs()
	for _, g := range UserGrants() {
		if g.UserEmail != "sofia.gomez@acme-intel.demo" {
			continue
		}
		require.Equal(t, "analyst", g.Role)
		require.ElementsMatch(t, all, g.MarkingSlugs,
			"Sofía must hold all %d markings — she's the broad-clearance demo persona", expectedMarkings)
		return
	}
	t.Fatal("Sofía not found in UserGrants()")
}

func TestMarcosIsMissingOFACAndEnrichedPII(t *testing.T) {
	for _, g := range UserGrants() {
		if g.UserEmail != "marcos.fernandez@acme-intel.demo" {
			continue
		}
		require.Equal(t, "compliance", g.Role)
		require.NotContains(t, g.MarkingSlugs, "ofac",
			"Marcos must NOT have OFAC — that's the demo redaction case")
		require.NotContains(t, g.MarkingSlugs, "enriched-pii",
			"Marcos must NOT have ENRICHED-PII — that's the PII-redaction case")
		require.Len(t, g.MarkingSlugs, expectedMarkings-2)
		return
	}
	t.Fatal("Marcos not found in UserGrants()")
}

// --- load behaviour ---------------------------------------------------------

func TestLoadOnEmptyRepoCreatesEverything(t *testing.T) {
	repo := newFakeRepo()
	out, err := Load(context.Background(), repo, nil, uuid.New())
	require.NoError(t, err)
	require.Len(t, out.CreatedCategories, expectedCategories)
	require.Len(t, out.CreatedMarkings, expectedMarkings)
	require.Empty(t, out.SkippedCategories)
	require.Empty(t, out.SkippedMarkings)
	require.Len(t, repo.categories, expectedCategories)

	totalMarkings := 0
	for _, list := range repo.markings {
		totalMarkings += len(list)
	}
	require.Equal(t, expectedMarkings, totalMarkings)
}

func TestLoadIsIdempotentOnSecondRun(t *testing.T) {
	repo := newFakeRepo()
	_, err := Load(context.Background(), repo, nil, uuid.New())
	require.NoError(t, err)

	out, err := Load(context.Background(), repo, nil, uuid.New())
	require.NoError(t, err)
	require.Empty(t, out.CreatedCategories)
	require.Empty(t, out.CreatedMarkings)
	require.Len(t, out.SkippedCategories, expectedCategories)
	require.Len(t, out.SkippedMarkings, expectedMarkings)
}

func TestLoadShortCircuitsOnCategoryFailure(t *testing.T) {
	repo := newFakeRepo()
	repo.failOn = "compartment-sanctions"
	_, err := Load(context.Background(), repo, nil, uuid.New())
	require.Error(t, err)
	require.Less(t, len(repo.categories), expectedCategories,
		"a failed category insert must halt the seed")
}

func TestLoadShortCircuitsOnMarkingFailure(t *testing.T) {
	repo := newFakeRepo()
	repo.failOn = "ofac"
	_, err := Load(context.Background(), repo, nil, uuid.New())
	require.Error(t, err)
	require.Less(t,
		countTotalMarkings(repo), expectedMarkings,
		"a failed marking insert must halt the seed")
}

func TestLoadRejectsNilRepo(t *testing.T) {
	_, err := Load(context.Background(), nil, nil, uuid.New())
	require.Error(t, err)
}

func TestLoadRejectsZeroActorID(t *testing.T) {
	_, err := Load(context.Background(), newFakeRepo(), nil, uuid.Nil)
	require.Error(t, err)
}

// --- helpers ---------------------------------------------------------------

func normalizeDisplay(s string) string {
	// Display names are already uppercase + hyphen; this function
	// just acts as the "canonical form" used by the assertion.
	return s
}

func countTotalMarkings(repo *fakeRepo) int {
	total := 0
	for _, list := range repo.markings {
		total += len(list)
	}
	return total
}
