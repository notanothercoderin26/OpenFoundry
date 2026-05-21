// Package geopolitica materialises the geopolitical PoC ontology into
// `ontology-definition-service` — 14 object types + 1 IActor interface
// + 4 interface bindings + 13 link types. Action types live in a
// sibling seed package under `services/ontology-actions-service` because
// the action-type write surface is owned by that service (B02
// §Deferred — closed).
//
// Foundry-native framing
// -----------------------
// Palantir's Ontology Manager is a declarative registry of object,
// link, action, and interface types. Reference:
//
//   - https://www.palantir.com/docs/foundry/object-link-types/type-reference
//   - https://www.palantir.com/docs/foundry/object-explorer/overview/
//
// Each call below goes through the same Repo methods the HTTP handlers
// use, so the outbox events fire correctly and downstream consumers
// (`object-database-service`, `ontology-indexer`) receive the schema
// sync. **A pure-SQL migration would bypass this and silently break
// the platform** — that's the pitfall the Item 1 plan flagged.
//
// Idempotency contract
// --------------------
// Load() is additive only: it walks the expected catalog and inserts
// what is missing for the given owner. Re-runs are no-ops if the
// catalog was already loaded. Operators who want a hard reset must
// delete the rows manually; we never DROP.
//
// Source of truth
// ---------------
// PoC/geopolitica/assets/ontology-geopolitica.yaml is the human-
// readable canonical reference. The Go literals in `types_*.go`,
// `interfaces.go`, and `link_types.go` MUST converge with that YAML —
// reviewers diff the two when changes land.

package geopolitica

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// SeedObjectType is one concrete ontology object type the catalog
// declares. Fields map onto the columns the Repo writes; Properties is
// the list of attached property rows produced via CreateProperty.
type SeedObjectType struct {
	Name              string
	DisplayName       string
	PrimaryKey        string
	TitleProperty     string
	Icon              string
	Description       string
	Properties        []SeedProperty
	ImplementsIActor  bool // when true, Load() binds this object type to the IActor interface after creation
}

// SeedProperty mirrors models.CreatePropertyRequest minus the boilerplate.
type SeedProperty struct {
	Name         string
	DisplayName  string
	PropertyType string
	Required     bool
}

// SeedLinkType is one link type the catalog declares. SourceName /
// TargetName name the connected object types — Load() resolves them to
// UUIDs after the object types are inserted.
type SeedLinkType struct {
	Name         string
	DisplayName  string
	SourceName   string
	TargetName   string
	Cardinality  string // one_to_one | one_to_many | many_to_one | many_to_many
}

// SeedRepo is the minimal repo surface the seed depends on. The real
// ontology-definition-service Repo satisfies this; tests inject a fake.
type SeedRepo interface {
	// Object types
	ListObjectTypes(ctx context.Context) ([]models.ObjectType, error)
	CreateObjectType(ctx context.Context, body *kmodels.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error)
	CreateProperty(ctx context.Context, typeID uuid.UUID, body *kmodels.CreatePropertyRequest, actorID uuid.UUID) (*models.Property, error)

	// Interfaces
	ListInterfaces(ctx context.Context, page, perPage int, search string) ([]models.OntologyInterface, int, error)
	CreateInterface(ctx context.Context, body *models.CreateOntologyInterfaceRequest, ownerID uuid.UUID) (*models.OntologyInterface, error)
	BindObjectTypeToInterface(ctx context.Context, objectTypeID, interfaceID uuid.UUID) error
	ListObjectTypeInterfaceBindings(ctx context.Context, objectTypeID uuid.UUID) ([]uuid.UUID, error)

	// Link types
	ListLinkTypes(ctx context.Context, objectTypeID *uuid.UUID) ([]models.LinkType, error)
	CreateLinkType(ctx context.Context, body *kmodels.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error)
}

// LoadResult summarises what Load() did.
type LoadResult struct {
	CreatedObjectTypes  []string
	SkippedObjectTypes  []string
	CreatedProperties   int
	CreatedInterfaces   []string
	SkippedInterfaces   []string
	CreatedBindings     []string // "Person→IActor" style
	SkippedBindings     []string
	CreatedLinkTypes    []string
	SkippedLinkTypes    []string
}

// Interface name we bind 4 sub-Actor types to. Kept as a const so
// tests, the YAML asset, and the seed agree.
const IActorInterfaceName = "IActor"

// Load applies the geopolitica ontology catalog against the provided
// repo. Returns a LoadResult describing every action taken. The
// catalog is loaded in this order so foreign-key dependencies resolve:
//
//   1. Object types + their properties
//   2. IActor interface
//   3. Interface bindings (Person/Organization/ArmedGroup/GovernmentBody → IActor)
//   4. Link types (after all object types exist so source_type_id / target_type_id resolve)
//
// An error at any step short-circuits the rest and returns whatever
// the LoadResult accumulated up to that point — operators see exactly
// where the seed stopped.
func Load(ctx context.Context, repo SeedRepo, ownerID uuid.UUID) (LoadResult, error) {
	out := LoadResult{}

	// Step 1 — object types + properties
	existingTypes, err := repo.ListObjectTypes(ctx)
	if err != nil {
		return out, fmt.Errorf("list object types: %w", err)
	}
	typeIDByName := make(map[string]uuid.UUID, len(existingTypes))
	for _, t := range existingTypes {
		typeIDByName[t.Name] = t.ID
	}

	for _, st := range ObjectTypes() {
		if _, exists := typeIDByName[st.Name]; exists {
			out.SkippedObjectTypes = append(out.SkippedObjectTypes, st.Name)
			continue
		}
		created, err := repo.CreateObjectType(ctx, createObjectTypeRequest(st), ownerID)
		if err != nil {
			return out, fmt.Errorf("create object type %q: %w", st.Name, err)
		}
		if created == nil {
			return out, fmt.Errorf("create object type %q: nil result", st.Name)
		}
		typeIDByName[st.Name] = created.ID
		out.CreatedObjectTypes = append(out.CreatedObjectTypes, st.Name)

		for _, prop := range st.Properties {
			if _, err := repo.CreateProperty(ctx, created.ID, createPropertyRequest(prop), ownerID); err != nil {
				return out, fmt.Errorf("create property %s.%s: %w", st.Name, prop.Name, err)
			}
			out.CreatedProperties++
		}
	}

	// Step 2 — IActor interface
	interfaces, _, err := repo.ListInterfaces(ctx, 1, 200, "")
	if err != nil {
		return out, fmt.Errorf("list interfaces: %w", err)
	}
	var iactorID uuid.UUID
	for _, iface := range interfaces {
		if iface.Name == IActorInterfaceName {
			iactorID = iface.ID
		}
	}
	if iactorID == uuid.Nil {
		created, err := repo.CreateInterface(ctx, &models.CreateOntologyInterfaceRequest{
			Name:        IActorInterfaceName,
			DisplayName: "Actor (interface)",
			Description: "Common contract every concrete actor type implements; enables ER convergence + uniform pivots.",
		}, ownerID)
		if err != nil {
			return out, fmt.Errorf("create %s interface: %w", IActorInterfaceName, err)
		}
		iactorID = created.ID
		out.CreatedInterfaces = append(out.CreatedInterfaces, IActorInterfaceName)
	} else {
		out.SkippedInterfaces = append(out.SkippedInterfaces, IActorInterfaceName)
	}

	// Step 3 — Bindings (object_type → IActor)
	for _, st := range ObjectTypes() {
		if !st.ImplementsIActor {
			continue
		}
		typeID, ok := typeIDByName[st.Name]
		if !ok {
			return out, fmt.Errorf("binding %s→IActor: object type missing", st.Name)
		}
		bindings, err := repo.ListObjectTypeInterfaceBindings(ctx, typeID)
		if err != nil {
			return out, fmt.Errorf("list bindings for %s: %w", st.Name, err)
		}
		already := false
		for _, id := range bindings {
			if id == iactorID {
				already = true
				break
			}
		}
		label := st.Name + "→IActor"
		if already {
			out.SkippedBindings = append(out.SkippedBindings, label)
			continue
		}
		if err := repo.BindObjectTypeToInterface(ctx, typeID, iactorID); err != nil {
			return out, fmt.Errorf("bind %s→IActor: %w", st.Name, err)
		}
		out.CreatedBindings = append(out.CreatedBindings, label)
	}

	// Step 4 — Link types
	existingLinks, err := repo.ListLinkTypes(ctx, nil)
	if err != nil {
		return out, fmt.Errorf("list link types: %w", err)
	}
	linkNames := make(map[string]struct{}, len(existingLinks))
	for _, lt := range existingLinks {
		linkNames[lt.Name] = struct{}{}
	}

	for _, sl := range LinkTypes() {
		if _, exists := linkNames[sl.Name]; exists {
			out.SkippedLinkTypes = append(out.SkippedLinkTypes, sl.Name)
			continue
		}
		sourceID, ok := typeIDByName[sl.SourceName]
		if !ok {
			return out, fmt.Errorf("link %s: source object type %q missing", sl.Name, sl.SourceName)
		}
		targetID, ok := typeIDByName[sl.TargetName]
		if !ok {
			return out, fmt.Errorf("link %s: target object type %q missing", sl.Name, sl.TargetName)
		}
		card := sl.Cardinality
		req := &kmodels.CreateLinkTypeRequest{
			Name:         sl.Name,
			DisplayName:  ptrString(sl.DisplayName),
			SourceTypeID: sourceID,
			TargetTypeID: targetID,
			Cardinality:  &card,
		}
		if _, err := repo.CreateLinkType(ctx, req, ownerID); err != nil {
			return out, fmt.Errorf("create link type %q: %w", sl.Name, err)
		}
		out.CreatedLinkTypes = append(out.CreatedLinkTypes, sl.Name)
	}

	return out, nil
}

// ───── Helpers ─────────────────────────────────────────────────────

func createObjectTypeRequest(st SeedObjectType) *kmodels.CreateObjectTypeRequest {
	return &kmodels.CreateObjectTypeRequest{
		Name:               st.Name,
		DisplayName:        ptrString(st.DisplayName),
		Description:        ptrString(st.Description),
		PrimaryKeyProperty: ptrString(st.PrimaryKey),
		TitleProperty:      ptrString(st.TitleProperty),
		Icon:               ptrString(st.Icon),
	}
}

func createPropertyRequest(p SeedProperty) *kmodels.CreatePropertyRequest {
	required := p.Required
	return &kmodels.CreatePropertyRequest{
		Name:         p.Name,
		DisplayName:  ptrString(p.DisplayName),
		PropertyType: p.PropertyType,
		Required:     &required,
	}
}

func ptrString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// ───── Sanity guard ───────────────────────────────────────────────

// expectedCatalogSizes returns the canonical counts we expect from
// ObjectTypes() + LinkTypes(). Catalogs() returns them so a single
// assertion in the test suite catches drift in the YAML→Go mirror.
func expectedCatalogSizes() (objectTypes, linkTypes int) {
	return 14, 13
}

// Ensure the catalog literal matches the documented counts at init
// time so a typo in one of the type files causes the service to refuse
// to boot instead of silently shipping a half-populated ontology.
func init() {
	wantOT, wantLT := expectedCatalogSizes()
	if got := len(ObjectTypes()); got != wantOT {
		panic(errors.New("geopolitica seed: ObjectTypes() must list exactly 14 entries; got " + fmt.Sprint(got)))
	}
	if got := len(LinkTypes()); got != wantLT {
		panic(errors.New("geopolitica seed: LinkTypes() must list exactly 13 entries; got " + fmt.Sprint(got)))
	}
}
