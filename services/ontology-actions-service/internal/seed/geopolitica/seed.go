// Package geopolitica registers the 8 geopolitical PoC action types
// in `ontology_schema.action_types`. The 14 object types this catalog
// targets are seeded separately by
// `services/ontology-definition-service/internal/seed/geopolitica` —
// callers must invoke that seed first so the action types' `target`
// object_type_id can be resolved.
//
// Foundry-native framing
// -----------------------
// Each action type maps onto a Palantir Action Type with rules + form
// schema + permission key. Reference docs:
//
//   - https://www.palantir.com/docs/foundry/action-types/rules/
//   - https://www.palantir.com/docs/foundry/action-types/use-actions/
//   - https://www.palantir.com/docs/foundry/action-types/action-log
//
// PoC source-of-truth: PoC/geopolitica/05-ontologia-geopolitica.md §"⚡ Actions".
//
// Foundry-native pitfall: `propose-sanctions-extension` is declared
// here but its branch-only enforcement lives in the workflow + UI
// gating, NOT in the action-type itself (Foundry's
// `required_context: branch` is not part of the public type-reference
// schema). We document it on the seed entry and re-document it in the
// demo script per the PoC contract.

package geopolitica

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
)

// SeedActionType is one declarative action-type entry.
type SeedActionType struct {
	Name                 string
	DisplayName          string
	Description          string
	TargetObjectTypeName string // resolved against the object-types catalog at load time
	OperationKind        string // create | modify | delete
	ConfirmationRequired bool
	PermissionKey        string
}

// SeedRepo is the minimal repo surface the seed needs. The real
// service Repo satisfies it.
type SeedRepo interface {
	ListActionTypes(ctx context.Context) ([]kmodels.ActionType, error)
	CreateActionType(ctx context.Context, body *kmodels.CreateActionTypeRequest, ownerID uuid.UUID) (*kmodels.ActionType, error)
}

// ObjectTypeResolver maps an object-type name to its UUID. The
// production wiring passes a closure backed by the
// `ontology-definition-service` ListObjectTypes endpoint; tests inject
// a static map.
type ObjectTypeResolver func(ctx context.Context, name string) (uuid.UUID, error)

// LoadResult mirrors the shape used by the sister seed in
// ontology-definition-service.
type LoadResult struct {
	CreatedActionTypes []string
	SkippedActionTypes []string
}

// Load applies the geopolitica action-type catalog against the
// provided repo. Returns when the first error happens — partial seeds
// are honest and safer than silent best-effort. Idempotent by name.
func Load(ctx context.Context, repo SeedRepo, resolver ObjectTypeResolver, ownerID uuid.UUID) (LoadResult, error) {
	out := LoadResult{}
	if repo == nil || resolver == nil {
		return out, errors.New("geopolitica action seed: repo and resolver are required")
	}

	existing, err := repo.ListActionTypes(ctx)
	if err != nil {
		return out, fmt.Errorf("list action types: %w", err)
	}
	seen := make(map[string]struct{}, len(existing))
	for _, at := range existing {
		seen[at.Name] = struct{}{}
	}

	for _, s := range ActionTypes() {
		if _, exists := seen[s.Name]; exists {
			out.SkippedActionTypes = append(out.SkippedActionTypes, s.Name)
			continue
		}
		targetID, err := resolver(ctx, s.TargetObjectTypeName)
		if err != nil {
			return out, fmt.Errorf("resolve target %q for action %q: %w", s.TargetObjectTypeName, s.Name, err)
		}
		if targetID == uuid.Nil {
			return out, fmt.Errorf("action %q: target object type %q not loaded yet — run the ontology-definition seed first",
				s.Name, s.TargetObjectTypeName)
		}
		desc := s.Description
		dn := s.DisplayName
		confirm := s.ConfirmationRequired
		pk := s.PermissionKey
		req := &kmodels.CreateActionTypeRequest{
			Name:                 s.Name,
			DisplayName:          &dn,
			Description:          &desc,
			ObjectTypeID:         targetID,
			OperationKind:        s.OperationKind,
			ConfirmationRequired: &confirm,
			PermissionKey:        &pk,
		}
		if _, err := repo.CreateActionType(ctx, req, ownerID); err != nil {
			return out, fmt.Errorf("create action type %q: %w", s.Name, err)
		}
		out.CreatedActionTypes = append(out.CreatedActionTypes, s.Name)
	}
	return out, nil
}

// ResolverFromMap builds a resolver from a static name→id map. Used
// by tests; in production wire a closure that queries
// ontology-definition-service.
func ResolverFromMap(m map[string]uuid.UUID) ObjectTypeResolver {
	return func(_ context.Context, name string) (uuid.UUID, error) {
		id, ok := m[name]
		if !ok {
			return uuid.Nil, fmt.Errorf("object type %q not found", name)
		}
		return id, nil
	}
}

// expectedCount is the canonical action-type count for the PoC.
// Init-time guard catches drift in `ActionTypes()` early.
const expectedCount = 8

func init() {
	if got := len(ActionTypes()); got != expectedCount {
		panic(fmt.Sprintf("geopolitica action seed: ActionTypes() must list exactly %d entries; got %d", expectedCount, got))
	}
}
