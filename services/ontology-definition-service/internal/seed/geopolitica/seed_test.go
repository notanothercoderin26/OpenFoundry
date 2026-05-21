package geopolitica

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// --- fake repo --------------------------------------------------------------

type fakeRepo struct {
	objectTypes []models.ObjectType
	properties  []models.Property
	interfaces  []models.OntologyInterface
	linkTypes   []models.LinkType
	bindings    map[uuid.UUID][]uuid.UUID // objectTypeID -> interfaceIDs
	failOn      string                    // name of an object type whose Create should fail (for negative tests)
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{bindings: map[uuid.UUID][]uuid.UUID{}}
}

func (f *fakeRepo) ListObjectTypes(_ context.Context) ([]models.ObjectType, error) {
	return append([]models.ObjectType{}, f.objectTypes...), nil
}

func (f *fakeRepo) CreateObjectType(_ context.Context, body *kmodels.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error) {
	if body.Name == f.failOn {
		return nil, errors.New("forced fake-repo failure for " + body.Name)
	}
	dn := body.Name
	if body.DisplayName != nil {
		dn = *body.DisplayName
	}
	v := models.ObjectType{
		ID:          uuid.New(),
		Name:        body.Name,
		DisplayName: dn,
		OwnerID:     ownerID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if body.PrimaryKeyProperty != nil {
		v.PrimaryKeyProperty = body.PrimaryKeyProperty
	}
	f.objectTypes = append(f.objectTypes, v)
	return &v, nil
}

func (f *fakeRepo) CreateProperty(_ context.Context, typeID uuid.UUID, body *kmodels.CreatePropertyRequest, _ uuid.UUID) (*models.Property, error) {
	p := models.Property{
		ID:           uuid.New(),
		ObjectTypeID: typeID,
		Name:         body.Name,
		PropertyType: body.PropertyType,
	}
	if body.DisplayName != nil {
		p.DisplayName = *body.DisplayName
	}
	if body.Required != nil {
		p.Required = *body.Required
	}
	f.properties = append(f.properties, p)
	return &p, nil
}

func (f *fakeRepo) ListInterfaces(_ context.Context, _, _ int, _ string) ([]models.OntologyInterface, int, error) {
	out := append([]models.OntologyInterface{}, f.interfaces...)
	return out, len(out), nil
}

func (f *fakeRepo) CreateInterface(_ context.Context, body *models.CreateOntologyInterfaceRequest, ownerID uuid.UUID) (*models.OntologyInterface, error) {
	v := models.OntologyInterface{
		ID:          uuid.New(),
		Name:        body.Name,
		DisplayName: body.DisplayName,
		Description: body.Description,
		OwnerID:     ownerID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	f.interfaces = append(f.interfaces, v)
	return &v, nil
}

func (f *fakeRepo) BindObjectTypeToInterface(_ context.Context, objectTypeID, interfaceID uuid.UUID) error {
	for _, existing := range f.bindings[objectTypeID] {
		if existing == interfaceID {
			return nil // idempotent
		}
	}
	f.bindings[objectTypeID] = append(f.bindings[objectTypeID], interfaceID)
	return nil
}

func (f *fakeRepo) ListObjectTypeInterfaceBindings(_ context.Context, objectTypeID uuid.UUID) ([]uuid.UUID, error) {
	return append([]uuid.UUID{}, f.bindings[objectTypeID]...), nil
}

func (f *fakeRepo) ListLinkTypes(_ context.Context, _ *uuid.UUID) ([]models.LinkType, error) {
	return append([]models.LinkType{}, f.linkTypes...), nil
}

func (f *fakeRepo) CreateLinkType(_ context.Context, body *kmodels.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error) {
	dn := body.Name
	if body.DisplayName != nil {
		dn = *body.DisplayName
	}
	card := "many_to_many"
	if body.Cardinality != nil {
		card = *body.Cardinality
	}
	v := models.LinkType{
		ID:           uuid.New(),
		Name:         body.Name,
		DisplayName:  dn,
		SourceTypeID: body.SourceTypeID,
		TargetTypeID: body.TargetTypeID,
		Cardinality:  card,
		OwnerID:      ownerID,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	f.linkTypes = append(f.linkTypes, v)
	return &v, nil
}

// --- catalog shape ----------------------------------------------------------

func TestObjectTypesCatalogHas14Entries(t *testing.T) {
	types := ObjectTypes()
	require.Len(t, types, 14, "PoC contract requires exactly 14 object types")
	names := make([]string, len(types))
	for i, t := range types {
		names[i] = t.Name
	}
	require.ElementsMatch(t, []string{
		"Actor", "Person", "Organization", "ArmedGroup", "GovernmentBody",
		"Event", "NewsArticle",
		"Location", "Country",
		"SanctionsEntry",
		"Watchlist", "InvestigationCase", "ActorAlert", "ActionLog",
	}, names)
}

func TestLinkTypesCatalogHas13Entries(t *testing.T) {
	links := LinkTypes()
	require.Len(t, links, 13, "PoC contract requires exactly 13 link types")
	for _, l := range links {
		require.NotEmpty(t, l.Name)
		require.NotEmpty(t, l.SourceName)
		require.NotEmpty(t, l.TargetName)
		require.True(t,
			l.Cardinality == "one_to_one" ||
				l.Cardinality == "one_to_many" ||
				l.Cardinality == "many_to_one" ||
				l.Cardinality == "many_to_many",
			"link %s has unsupported cardinality %q", l.Name, l.Cardinality)
	}
}

func TestLinkTypeReferencesResolveAgainstObjectTypes(t *testing.T) {
	objectTypeNames := map[string]struct{}{}
	for _, t := range ObjectTypes() {
		objectTypeNames[t.Name] = struct{}{}
	}
	for _, l := range LinkTypes() {
		_, sourceOK := objectTypeNames[l.SourceName]
		_, targetOK := objectTypeNames[l.TargetName]
		require.True(t, sourceOK, "link %s references unknown source %q", l.Name, l.SourceName)
		require.True(t, targetOK, "link %s references unknown target %q", l.Name, l.TargetName)
	}
}

func TestFourSubActorTypesImplementIActor(t *testing.T) {
	impl := map[string]bool{}
	for _, t := range ObjectTypes() {
		impl[t.Name] = t.ImplementsIActor
	}
	for _, sub := range []string{"Person", "Organization", "ArmedGroup", "GovernmentBody"} {
		require.True(t, impl[sub], "%s must declare ImplementsIActor=true", sub)
	}
	require.False(t, impl["Actor"], "Actor (umbrella) should NOT implement IActor — only the 4 sub-types do")
	require.False(t, impl["Event"], "Event is not an IActor implementer")
}

func TestEverySubActorCarriesThe12CommonProperties(t *testing.T) {
	commonNames := map[string]struct{}{}
	for _, p := range commonActorProps {
		commonNames[p.Name] = struct{}{}
	}
	for _, st := range ObjectTypes() {
		if !st.ImplementsIActor {
			continue
		}
		got := map[string]struct{}{}
		for _, p := range st.Properties {
			got[p.Name] = struct{}{}
		}
		for name := range commonNames {
			_, ok := got[name]
			require.True(t, ok, "%s missing common IActor property %q", st.Name, name)
		}
	}
}

func TestActorUmbrellaCarriesThe12CommonPropertiesOnly(t *testing.T) {
	var actor SeedObjectType
	for _, st := range ObjectTypes() {
		if st.Name == "Actor" {
			actor = st
		}
	}
	require.Equal(t, len(commonActorProps), len(actor.Properties),
		"the umbrella Actor object type should hold the 12 common IActor properties verbatim")
}

// --- load behaviour ---------------------------------------------------------

func TestLoadOnEmptyRepoCreatesAllExpectedEntities(t *testing.T) {
	repo := newFakeRepo()
	out, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)

	require.Len(t, out.CreatedObjectTypes, 14)
	require.Empty(t, out.SkippedObjectTypes)
	require.Len(t, out.CreatedInterfaces, 1)
	require.Equal(t, []string{"IActor"}, out.CreatedInterfaces)
	require.Len(t, out.CreatedBindings, 4)
	require.ElementsMatch(t, []string{
		"Person→IActor", "Organization→IActor", "ArmedGroup→IActor", "GovernmentBody→IActor",
	}, out.CreatedBindings)
	require.Len(t, out.CreatedLinkTypes, 13)

	// Confirm the fake repo actually holds what the LoadResult claims.
	require.Len(t, repo.objectTypes, 14)
	require.Len(t, repo.interfaces, 1)
	require.Len(t, repo.linkTypes, 13)
	totalBindings := 0
	for _, ids := range repo.bindings {
		totalBindings += len(ids)
	}
	require.Equal(t, 4, totalBindings)
}

func TestLoadIsIdempotentOnSecondRun(t *testing.T) {
	repo := newFakeRepo()
	_, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)

	out, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)
	require.Empty(t, out.CreatedObjectTypes)
	require.Len(t, out.SkippedObjectTypes, 14)
	require.Empty(t, out.CreatedInterfaces)
	require.Len(t, out.SkippedInterfaces, 1)
	require.Empty(t, out.CreatedBindings)
	require.Len(t, out.SkippedBindings, 4)
	require.Empty(t, out.CreatedLinkTypes)
	require.Len(t, out.SkippedLinkTypes, 13)
}

func TestLoadPropertyCountIsAtLeast100(t *testing.T) {
	// Catalog covers 14 object types with ~12 common + per-type
	// extras. Less than 100 properties total is a strong signal that
	// something silently dropped — guard against that.
	repo := newFakeRepo()
	out, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)
	require.GreaterOrEqual(t, out.CreatedProperties, 100,
		"property count too low — check the per-type catalog files for accidental drops")
	require.Len(t, repo.properties, out.CreatedProperties)
}

func TestLoadShortCircuitsOnCreateObjectTypeError(t *testing.T) {
	repo := newFakeRepo()
	repo.failOn = "Event" // 6th in load order (after the 5 Actor-family)
	_, err := Load(context.Background(), repo, uuid.New())
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "Event"))
	require.Less(t, len(repo.objectTypes), 14, "load must short-circuit on error")
	require.Empty(t, repo.interfaces, "load must not reach the interface step after an object-type failure")
}

func TestLoadCreatesIActorWithExpectedDisplayName(t *testing.T) {
	repo := newFakeRepo()
	_, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)
	require.Equal(t, IActorInterfaceName, repo.interfaces[0].Name)
	require.Equal(t, "Actor (interface)", repo.interfaces[0].DisplayName)
}

func TestEveryLinkTypeMapsToValidSourceAndTargetAfterLoad(t *testing.T) {
	repo := newFakeRepo()
	_, err := Load(context.Background(), repo, uuid.New())
	require.NoError(t, err)

	idByName := map[string]uuid.UUID{}
	for _, ot := range repo.objectTypes {
		idByName[ot.Name] = ot.ID
	}
	for _, lt := range repo.linkTypes {
		require.NotEqual(t, uuid.Nil, lt.SourceTypeID, "%s source must resolve", lt.Name)
		require.NotEqual(t, uuid.Nil, lt.TargetTypeID, "%s target must resolve", lt.Name)
	}
}
