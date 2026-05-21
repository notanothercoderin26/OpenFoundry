// Package geopolitica materialises the geopolitical PoC markings
// catalog into authorization-policy-service — 2 marking categories +
// 8 markings + a declarative user-grant matrix.
//
// Foundry-native framing
// -----------------------
// Palantir Markings reference:
//
//   https://www.palantir.com/docs/foundry/security/markings
//
// Public docs pin "binary-AND" semantics across markings on a
// resource. OpenFoundry honours that AND additionally enforces
// row-/column-level visibility — the latter is OpenFoundry emulation
// per PoC contract 00-contrato-foundry-native.md §"Gaps that must
// not be oversold". The demo script MUST say so explicitly.
//
// SCOPE NOTES (security-critical service)
// ----------------------------------------
//  1. The seed ONLY inserts categories + markings + audit rows
//     through the existing Repo CreateMarkingCategory / CreateMarking
//     methods. It does NOT touch Cedar policies, ABAC evaluation, or
//     the `Evaluate` decision path — see CLAUDE.md "default deny"
//     invariant.
//  2. User grants (Sofía/Marcos) are DECLARED here as data via
//     UserGrants() but the actual upsert against
//     authorization_policy_service is intentionally NOT done by
//     Load(). Reason: user RIDs live in identity-federation-service
//     and don't exist at boot time. Operators apply the grants
//     manually after Keycloak users are seeded (see the demo prep
//     script at PoC/geopolitica/12-checklist-preparacion.md).
//  3. Idempotent — re-runs skip categories/markings whose slug
//     already exists for the configured tenant.

package geopolitica

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/authorization-policy-service/internal/models"
)

// SeedMarkingCategory describes one administrative container.
// Mirrors the YAML asset row.
type SeedMarkingCategory struct {
	Slug        string
	DisplayName string
	Description string
	Visibility  string // "visible" | "hidden"
}

// SeedMarking describes one discrete marking inside a category.
// CategorySlug resolves to a category UUID at Load() time after the
// categories are inserted.
type SeedMarking struct {
	Slug          string
	CategorySlug  string
	DisplayName   string
	Description   string
}

// UserGrant pairs a user identity (by email — operators map to RID
// after Keycloak seed) with the slugs of every marking that user
// must hold. Applied by the operator AFTER Load() returns and AFTER
// identity-federation-service has the user.
type UserGrant struct {
	UserEmail    string
	Role         string
	MarkingSlugs []string
}

// SeedRepo is the minimal repo surface Load() consumes. The
// production Repo satisfies it; tests inject a fake.
type SeedRepo interface {
	// ListMarkingCategories returns the existing categories for the
	// tenant the seed runs against. Used for idempotency.
	ListMarkingCategories(ctx context.Context, tenantID *uuid.UUID, callerID uuid.UUID, includeHidden, canSeeAllHidden bool) ([]models.MarkingCategoryResponse, error)
	// CreateMarkingCategory inserts a new category.
	CreateMarkingCategory(ctx context.Context, tenantID *uuid.UUID, actorID uuid.UUID, body *models.CreateMarkingCategoryRequest) (*models.MarkingCategoryResponse, error)
	// ListMarkingsForCategory returns the markings inside a given
	// category — used to skip already-seeded markings.
	ListMarkingsForCategory(ctx context.Context, tenantID *uuid.UUID, callerID, categoryID uuid.UUID, includeHidden, canSeeAllHidden, canSeeAllMetadata bool) ([]models.MarkingResponse, error)
	// CreateMarking inserts a new marking.
	CreateMarking(ctx context.Context, tenantID *uuid.UUID, actorID, categoryID uuid.UUID, body *models.CreateMarkingRequest) (*models.MarkingResponse, error)
}

// LoadResult summarises what the seed did.
type LoadResult struct {
	CreatedCategories []string
	SkippedCategories []string
	CreatedMarkings   []string
	SkippedMarkings   []string
}

// Load applies the geopolitica markings catalog against the provided
// repo. Steps:
//
//  1. List existing categories for the tenant.
//  2. Insert any catalog category whose slug is missing.
//  3. For every catalog marking, resolve its category by slug, list
//     that category's markings, insert the marking when its slug is
//     missing.
//
// Returns a structured LoadResult. Any DB error short-circuits and
// the LoadResult reflects whatever was processed up to that point.
//
// `tenantID` may be nil for global-scope markings — that matches the
// existing migration's optional FK on marking_categories.tenant_id.
// `actorID` is the seed-time system user (e.g. the bootstrap
// service account); audit rows attribute every insertion to it.
func Load(ctx context.Context, repo SeedRepo, tenantID *uuid.UUID, actorID uuid.UUID) (LoadResult, error) {
	out := LoadResult{}
	if repo == nil {
		return out, errors.New("geopolitica markings seed: repo required")
	}
	if actorID == uuid.Nil {
		return out, errors.New("geopolitica markings seed: actor id required")
	}

	// Step 1 — index existing categories by slug.
	existingCategories, err := repo.ListMarkingCategories(ctx, tenantID, actorID, true, true)
	if err != nil {
		return out, fmt.Errorf("list marking categories: %w", err)
	}
	categoryIDBySlug := make(map[string]uuid.UUID, len(existingCategories))
	for _, c := range existingCategories {
		categoryIDBySlug[c.Slug] = c.ID
	}

	// Step 2 — insert missing categories.
	for _, sc := range Categories() {
		if _, exists := categoryIDBySlug[sc.Slug]; exists {
			out.SkippedCategories = append(out.SkippedCategories, sc.Slug)
			continue
		}
		req := &models.CreateMarkingCategoryRequest{
			Slug:        sc.Slug,
			DisplayName: sc.DisplayName,
			Description: sc.Description,
			Visibility:  sc.Visibility,
		}
		created, err := repo.CreateMarkingCategory(ctx, tenantID, actorID, req)
		if err != nil {
			return out, fmt.Errorf("create marking category %q: %w", sc.Slug, err)
		}
		if created == nil {
			return out, fmt.Errorf("create marking category %q: nil result", sc.Slug)
		}
		categoryIDBySlug[sc.Slug] = created.ID
		out.CreatedCategories = append(out.CreatedCategories, sc.Slug)
	}

	// Step 3 — insert missing markings, grouped per category.
	// Within each category list the existing markings once so the
	// per-marking check stays O(1).
	for categorySlug, categoryID := range categoryIDBySlug {
		existingForCategory, err := repo.ListMarkingsForCategory(ctx, tenantID, actorID, categoryID, true, true, true)
		if err != nil {
			return out, fmt.Errorf("list markings for category %q: %w", categorySlug, err)
		}
		seen := make(map[string]struct{}, len(existingForCategory))
		for _, m := range existingForCategory {
			seen[m.Slug] = struct{}{}
		}

		for _, sm := range markingsForCategory(categorySlug) {
			if _, exists := seen[sm.Slug]; exists {
				out.SkippedMarkings = append(out.SkippedMarkings, sm.Slug)
				continue
			}
			req := &models.CreateMarkingRequest{
				Slug:        sm.Slug,
				DisplayName: sm.DisplayName,
				Description: sm.Description,
			}
			created, err := repo.CreateMarking(ctx, tenantID, actorID, categoryID, req)
			if err != nil {
				return out, fmt.Errorf("create marking %q: %w", sm.Slug, err)
			}
			if created == nil {
				return out, fmt.Errorf("create marking %q: nil result", sm.Slug)
			}
			out.CreatedMarkings = append(out.CreatedMarkings, sm.Slug)
		}
	}

	return out, nil
}

// markingsForCategory returns the catalog markings that belong to
// the given category slug. Used internally by Load(); exported via
// MarkingsByCategory for tests.
func markingsForCategory(categorySlug string) []SeedMarking {
	out := make([]SeedMarking, 0)
	for _, m := range Markings() {
		if m.CategorySlug == categorySlug {
			out = append(out, m)
		}
	}
	return out
}

// MarkingsByCategory groups the catalog markings by their category
// slug. Exposed for tests + reporting.
func MarkingsByCategory() map[string][]SeedMarking {
	out := make(map[string][]SeedMarking)
	for _, m := range Markings() {
		out[m.CategorySlug] = append(out[m.CategorySlug], m)
	}
	return out
}

// expectedCounts pins the catalog shape at startup so a typo in
// Categories()/Markings() panics on import.
const (
	expectedCategories = 2
	expectedMarkings   = 8
	expectedUserGrants = 2
)

func init() {
	if got := len(Categories()); got != expectedCategories {
		panic(fmt.Sprintf("geopolitica markings seed: Categories() must return %d entries; got %d", expectedCategories, got))
	}
	if got := len(Markings()); got != expectedMarkings {
		panic(fmt.Sprintf("geopolitica markings seed: Markings() must return %d entries; got %d", expectedMarkings, got))
	}
	if got := len(UserGrants()); got != expectedUserGrants {
		panic(fmt.Sprintf("geopolitica markings seed: UserGrants() must return %d entries; got %d", expectedUserGrants, got))
	}

	// Every marking must reference a real category — drift here is
	// a bug and should refuse to boot.
	known := map[string]struct{}{}
	for _, c := range Categories() {
		known[c.Slug] = struct{}{}
	}
	for _, m := range Markings() {
		if _, ok := known[m.CategorySlug]; !ok {
			panic(fmt.Sprintf("geopolitica markings seed: marking %q references unknown category %q", m.Slug, m.CategorySlug))
		}
	}
}
