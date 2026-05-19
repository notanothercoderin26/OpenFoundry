package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/repo"
)

// fakeErrVersioningDisabled mirrors repo.ErrVersioningDisabled so the
// handler's string-match for "versioning is disabled" maps to 409
// exactly like it would against the real Repo.
var fakeErrVersioningDisabled = errors.New("versioning is disabled for this graph")

// fakeStore is an in-memory Store used by the handler tests. It is
// deliberately simple: behaviour-correct for round-tripping wire data
// and for the diff computation, with no concurrency considerations
// beyond a single big mutex.
type fakeStore struct {
	mu        sync.Mutex
	graphs    map[uuid.UUID]*models.Graph
	versions  map[uuid.UUID][]models.GraphVersion
	notes     map[uuid.UUID][]models.Annotation
	sa        map[uuid.UUID]*models.SearchAround
	scenarios map[uuid.UUID]*models.Scenario
	derived   map[uuid.UUID]*models.DerivedPropertyBinding
	grants    map[uuid.UUID][]models.GraphGrant
	links     map[uuid.UUID]*models.LinkShare
	templates map[uuid.UUID]*models.GraphTemplate
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		graphs:    make(map[uuid.UUID]*models.Graph),
		versions:  make(map[uuid.UUID][]models.GraphVersion),
		notes:     make(map[uuid.UUID][]models.Annotation),
		sa:        make(map[uuid.UUID]*models.SearchAround),
		scenarios: make(map[uuid.UUID]*models.Scenario),
		derived:   make(map[uuid.UUID]*models.DerivedPropertyBinding),
		grants:    make(map[uuid.UUID][]models.GraphGrant),
		links:     make(map[uuid.UUID]*models.LinkShare),
		templates: make(map[uuid.UUID]*models.GraphTemplate),
	}
}

// ----- graphs -----

func (s *fakeStore) ListGraphs(_ context.Context, _ uuid.UUID, _ *uuid.UUID, search string, page, perPage int) ([]models.Graph, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.Graph, 0)
	for _, g := range s.graphs {
		if search != "" && !strings.Contains(strings.ToLower(g.Title), strings.ToLower(search)) {
			continue
		}
		out = append(out, *g)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	total := len(out)
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}
	start := (page - 1) * perPage
	if start > total {
		start = total
	}
	end := start + perPage
	if end > total {
		end = total
	}
	return out[start:end], total, nil
}

func (s *fakeStore) GetGraph(_ context.Context, id uuid.UUID) (*models.Graph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[id]
	if !ok {
		return nil, nil
	}
	clone := *g
	return &clone, nil
}

func (s *fakeStore) CreateGraph(_ context.Context, body *models.CreateGraphRequest, ownerID uuid.UUID) (*models.Graph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	now := time.Now().UTC()
	g := &models.Graph{
		ID:                     id,
		RID:                    models.MakeGraphRID(id),
		Title:                  body.Title,
		Description:            body.Description,
		SeedObjectRefs:         coalesceStrings(body.SeedObjectRefs),
		BranchContext:          body.BranchContext,
		ModelRID:               body.ModelRID,
		LayoutStateJSON:        json.RawMessage(`{}`),
		LayerConfigurationJSON: json.RawMessage(`{}`),
		TimelineStateJSON:      json.RawMessage(`{}`),
		ProjectID:              body.ProjectID,
		Organizations:          coalesceStrings(body.Organizations),
		Markings:               coalesceStrings(body.Markings),
		OwnerID:                ownerID,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	s.graphs[id] = g
	return g, nil
}

func (s *fakeStore) UpdateGraph(_ context.Context, id uuid.UUID, body *models.UpdateGraphRequest) (*models.Graph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[id]
	if !ok {
		return nil, nil
	}
	if body.Title != nil {
		g.Title = *body.Title
	}
	if body.Description != nil {
		g.Description = *body.Description
	}
	if body.SeedObjectRefs != nil {
		g.SeedObjectRefs = *body.SeedObjectRefs
	}
	if body.BranchContext != nil {
		g.BranchContext = *body.BranchContext
	}
	if body.ModelRID != nil {
		g.ModelRID = *body.ModelRID
	}
	if body.LayoutStateJSON != nil {
		g.LayoutStateJSON = *body.LayoutStateJSON
	}
	if body.LayerConfigurationJSON != nil {
		g.LayerConfigurationJSON = *body.LayerConfigurationJSON
	}
	if body.TimelineStateJSON != nil {
		g.TimelineStateJSON = *body.TimelineStateJSON
	}
	if body.Organizations != nil {
		g.Organizations = *body.Organizations
	}
	if body.Markings != nil {
		g.Markings = *body.Markings
	}
	g.UpdatedAt = time.Now().UTC()
	clone := *g
	return &clone, nil
}

func (s *fakeStore) DeleteGraph(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.graphs[id]; !ok {
		return false, nil
	}
	delete(s.graphs, id)
	return true, nil
}

func (s *fakeStore) ForkGraph(ctx context.Context, id uuid.UUID, newTitle string, ownerID uuid.UUID) (*models.Graph, error) {
	src, _ := s.GetGraph(ctx, id)
	if src == nil {
		return nil, nil
	}
	title := strings.TrimSpace(newTitle)
	if title == "" {
		title = src.Title + " (fork)"
	}
	return s.CreateGraph(ctx, &models.CreateGraphRequest{
		Title:          title,
		Description:    src.Description,
		SeedObjectRefs: src.SeedObjectRefs,
		BranchContext:  src.BranchContext,
		ModelRID:       src.ModelRID,
		ProjectID:      src.ProjectID,
		Organizations:  src.Organizations,
		Markings:       src.Markings,
	}, ownerID)
}

// ----- versions -----

func (s *fakeStore) CreateGraphVersion(_ context.Context, graphID uuid.UUID, changelog string, authorID uuid.UUID) (*models.GraphVersion, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return nil, nil
	}
	if !g.VersioningEnabled {
		return nil, fakeErrVersioningDisabled
	}
	version := len(s.versions[graphID]) + 1
	snap, _ := json.Marshal(g)
	v := models.GraphVersion{
		ID:           uuid.New(),
		GraphID:      graphID,
		Version:      version,
		Changelog:    changelog,
		SnapshotJSON: snap,
		AuthorID:     authorID,
		CreatedAt:    time.Now().UTC(),
	}
	s.versions[graphID] = append(s.versions[graphID], v)
	return &v, nil
}

func (s *fakeStore) ListGraphVersions(_ context.Context, graphID uuid.UUID, page, perPage int) ([]models.GraphVersion, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	all := s.versions[graphID]
	out := append([]models.GraphVersion(nil), all...)
	sort.Slice(out, func(i, j int) bool { return out[i].Version > out[j].Version })
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}
	start := (page - 1) * perPage
	if start > len(out) {
		start = len(out)
	}
	end := start + perPage
	if end > len(out) {
		end = len(out)
	}
	return out[start:end], len(all), nil
}

func (s *fakeStore) GetGraphVersion(_ context.Context, graphID uuid.UUID, version int) (*models.GraphVersion, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.versions[graphID] {
		if v.Version == version {
			clone := v
			return &clone, nil
		}
	}
	return nil, nil
}

// ----- annotations -----

func (s *fakeStore) ListAnnotations(_ context.Context, graphID uuid.UUID) ([]models.Annotation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]models.Annotation(nil), s.notes[graphID]...), nil
}

func (s *fakeStore) CreateAnnotation(_ context.Context, graphID uuid.UUID, body *models.CreateAnnotationRequest, authorID uuid.UUID) (*models.Annotation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	geom := body.GeometryJSON
	if len(geom) == 0 {
		geom = json.RawMessage(`{}`)
	}
	a := models.Annotation{
		ID:           uuid.New(),
		GraphID:      graphID,
		Kind:         body.Kind,
		Text:         body.Text,
		GeometryJSON: geom,
		AuthorID:     authorID,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	s.notes[graphID] = append(s.notes[graphID], a)
	return &a, nil
}

func (s *fakeStore) UpdateAnnotation(_ context.Context, id uuid.UUID, body *models.UpdateAnnotationRequest) (*models.Annotation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for gid, list := range s.notes {
		for i := range list {
			if list[i].ID != id {
				continue
			}
			if body.Text != nil {
				list[i].Text = *body.Text
			}
			if body.GeometryJSON != nil {
				list[i].GeometryJSON = *body.GeometryJSON
			}
			list[i].UpdatedAt = time.Now().UTC()
			s.notes[gid] = list
			clone := list[i]
			return &clone, nil
		}
	}
	return nil, nil
}

func (s *fakeStore) DeleteAnnotation(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for gid, list := range s.notes {
		for i, a := range list {
			if a.ID != id {
				continue
			}
			s.notes[gid] = append(list[:i], list[i+1:]...)
			return true, nil
		}
	}
	return false, nil
}

// ----- search-arounds -----

func (s *fakeStore) ListSearchArounds(_ context.Context, _ uuid.UUID, _ *uuid.UUID, _ *uuid.UUID, _ string, _, _ int) ([]models.SearchAround, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.SearchAround, 0, len(s.sa))
	for _, v := range s.sa {
		out = append(out, *v)
	}
	return out, len(out), nil
}

func (s *fakeStore) GetSearchAround(_ context.Context, id uuid.UUID) (*models.SearchAround, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.sa[id]
	if !ok {
		return nil, nil
	}
	clone := *v
	return &clone, nil
}

func (s *fakeStore) CreateSearchAround(_ context.Context, body *models.CreateSearchAroundRequest, ownerID uuid.UUID) (*models.SearchAround, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	now := time.Now().UTC()
	sa := &models.SearchAround{
		ID:                   id,
		RID:                  models.MakeSearchAroundRID(id),
		Title:                body.Title,
		Description:          body.Description,
		StartingObjectTypeID: body.StartingObjectTypeID,
		Steps:                append([]models.SearchAroundStep(nil), body.Steps...),
		Parameters:           append([]models.SearchAroundParameter(nil), body.Parameters...),
		ProjectID:            body.ProjectID,
		OwnerID:              ownerID,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	s.sa[id] = sa
	return sa, nil
}

func (s *fakeStore) UpdateSearchAround(_ context.Context, id uuid.UUID, body *models.UpdateSearchAroundRequest) (*models.SearchAround, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sa, ok := s.sa[id]
	if !ok {
		return nil, nil
	}
	if body.Title != nil {
		sa.Title = *body.Title
	}
	if body.Description != nil {
		sa.Description = *body.Description
	}
	if body.Steps != nil {
		sa.Steps = *body.Steps
	}
	if body.Parameters != nil {
		sa.Parameters = *body.Parameters
	}
	sa.UpdatedAt = time.Now().UTC()
	clone := *sa
	return &clone, nil
}

func (s *fakeStore) DeleteSearchAround(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sa[id]; !ok {
		return false, nil
	}
	delete(s.sa, id)
	return true, nil
}

// ----- scenarios -----

func (s *fakeStore) ListScenarios(_ context.Context, graphID uuid.UUID, _, _ int) ([]models.Scenario, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.Scenario, 0)
	for _, v := range s.scenarios {
		if v.GraphID == graphID {
			out = append(out, *v)
		}
	}
	return out, len(out), nil
}

func (s *fakeStore) GetScenario(_ context.Context, id uuid.UUID) (*models.Scenario, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.scenarios[id]
	if !ok {
		return nil, nil
	}
	clone := *v
	return &clone, nil
}

func (s *fakeStore) CreateScenario(_ context.Context, graphID uuid.UUID, body *models.CreateScenarioRequest, authorID uuid.UUID) (*models.Scenario, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	now := time.Now().UTC()
	sc := &models.Scenario{
		ID:            id,
		GraphID:       graphID,
		Name:          body.Name,
		Description:   body.Description,
		Edits:         append([]models.StagedEdit(nil), body.Edits...),
		BranchContext: body.BranchContext,
		AuthorID:      authorID,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	s.scenarios[id] = sc
	return sc, nil
}

func (s *fakeStore) UpdateScenario(_ context.Context, id uuid.UUID, body *models.UpdateScenarioRequest) (*models.Scenario, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[id]
	if !ok {
		return nil, nil
	}
	if body.Name != nil {
		sc.Name = *body.Name
	}
	if body.Description != nil {
		sc.Description = *body.Description
	}
	if body.Edits != nil {
		sc.Edits = *body.Edits
	}
	sc.UpdatedAt = time.Now().UTC()
	clone := *sc
	return &clone, nil
}

func (s *fakeStore) DeleteScenario(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.scenarios[id]; !ok {
		return false, nil
	}
	delete(s.scenarios, id)
	return true, nil
}

func (s *fakeStore) DiffScenario(ctx context.Context, id uuid.UUID) (*models.ScenarioDiff, error) {
	sc, _ := s.GetScenario(ctx, id)
	if sc == nil {
		return nil, nil
	}
	diff := &models.ScenarioDiff{ScenarioID: id, ImpactedObjectRefs: []string{}}
	seen := make(map[string]struct{})
	for _, e := range sc.Edits {
		if e.TargetRef != "" {
			if _, ok := seen[e.TargetRef]; !ok {
				seen[e.TargetRef] = struct{}{}
				diff.ImpactedObjectRefs = append(diff.ImpactedObjectRefs, e.TargetRef)
			}
		}
		switch e.Kind {
		case "property_change":
			diff.ChangedNodeCount++
		case "link_add":
			diff.AddedCount++
			diff.ChangedEdgeCount++
		case "link_remove":
			diff.RemovedCount++
			diff.ChangedEdgeCount++
		case "action_dryrun":
			diff.ChangedNodeCount++
		}
	}
	return diff, nil
}

// ----- derived property bindings -----

func (s *fakeStore) ListDerivedPropertyBindings(_ context.Context, objectTypeID *uuid.UUID) ([]models.DerivedPropertyBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.DerivedPropertyBinding, 0)
	for _, v := range s.derived {
		if objectTypeID != nil && v.ObjectTypeID != *objectTypeID {
			continue
		}
		out = append(out, *v)
	}
	return out, nil
}

func (s *fakeStore) CreateDerivedPropertyBinding(_ context.Context, body *models.CreateDerivedPropertyBindingRequest, ownerID uuid.UUID) (*models.DerivedPropertyBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	now := time.Now().UTC()
	b := &models.DerivedPropertyBinding{
		ID:           id,
		ObjectTypeID: body.ObjectTypeID,
		PropertyName: body.PropertyName,
		DisplayName:  body.DisplayName,
		Description:  body.Description,
		FunctionRID:  body.FunctionRID,
		ReturnType:   body.ReturnType,
		OwnerID:      ownerID,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.derived[id] = b
	return b, nil
}

func (s *fakeStore) DeleteDerivedPropertyBinding(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.derived[id]; !ok {
		return false, nil
	}
	delete(s.derived, id)
	return true, nil
}

func coalesceStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// ----- versioning toggle + revert -----

func (s *fakeStore) SetVersioningEnabled(_ context.Context, id uuid.UUID, enabled bool) (*models.Graph, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[id]
	if !ok {
		return nil, nil
	}
	g.VersioningEnabled = enabled
	g.UpdatedAt = time.Now().UTC()
	clone := *g
	return &clone, nil
}

func (s *fakeStore) RevertToVersion(ctx context.Context, graphID uuid.UUID, version int, authorID uuid.UUID) (*models.Graph, error) {
	snap, err := s.GetGraphVersion(ctx, graphID, version)
	if err != nil || snap == nil {
		return nil, err
	}
	var fields struct {
		Title          string   `json:"title"`
		Description    string   `json:"description"`
		SeedObjectRefs []string `json:"seed_object_refs"`
	}
	if err := json.Unmarshal(snap.SnapshotJSON, &fields); err != nil {
		return nil, err
	}
	s.mu.Lock()
	g, ok := s.graphs[graphID]
	if !ok {
		s.mu.Unlock()
		return nil, nil
	}
	g.Title = fields.Title
	g.Description = fields.Description
	if fields.SeedObjectRefs != nil {
		g.SeedObjectRefs = fields.SeedObjectRefs
	}
	g.UpdatedAt = time.Now().UTC()
	wantVersion := g.VersioningEnabled
	clone := *g
	s.mu.Unlock()
	if wantVersion {
		_, _ = s.CreateGraphVersion(ctx, graphID, "Revert to v"+itoaTest(version), authorID)
	}
	return &clone, nil
}

func itoaTest(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// ----- grants -----

func (s *fakeStore) ListGrants(_ context.Context, graphID uuid.UUID) ([]models.GraphGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]models.GraphGrant(nil), s.grants[graphID]...), nil
}

func (s *fakeStore) PutGrant(_ context.Context, graphID uuid.UUID, body *models.PutGraphGrantRequest, grantedBy uuid.UUID) (*models.GraphGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	kind := body.PrincipalKind
	if kind == "" {
		kind = models.PrincipalKindUser
	}
	role := models.ParseRole(string(body.Role))
	// 'none' = delete the explicit grant.
	if role == models.RoleNone {
		filtered := s.grants[graphID][:0]
		for _, g := range s.grants[graphID] {
			if g.PrincipalID == body.PrincipalID && g.PrincipalKind == kind {
				continue
			}
			filtered = append(filtered, g)
		}
		s.grants[graphID] = filtered
		return nil, nil
	}
	// Upsert.
	now := time.Now().UTC()
	updated := false
	for i, g := range s.grants[graphID] {
		if g.PrincipalID == body.PrincipalID && g.PrincipalKind == kind {
			s.grants[graphID][i].Role = role
			s.grants[graphID][i].GrantedBy = grantedBy
			s.grants[graphID][i].UpdatedAt = now
			updated = true
			break
		}
	}
	if !updated {
		s.grants[graphID] = append(s.grants[graphID], models.GraphGrant{
			ID: uuid.New(), GraphID: graphID,
			PrincipalKind: kind, PrincipalID: body.PrincipalID, Role: role,
			GrantedBy: grantedBy, CreatedAt: now, UpdatedAt: now,
		})
	}
	for _, g := range s.grants[graphID] {
		if g.PrincipalID == body.PrincipalID && g.PrincipalKind == kind {
			clone := g
			return &clone, nil
		}
	}
	return nil, nil
}

func (s *fakeStore) DeleteGrant(_ context.Context, graphID, grantID uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.grants[graphID][:0]
	deleted := false
	for _, g := range s.grants[graphID] {
		if g.ID == grantID {
			deleted = true
			continue
		}
		out = append(out, g)
	}
	s.grants[graphID] = out
	return deleted, nil
}

func (s *fakeStore) ResolveRole(_ context.Context, graphID, caller uuid.UUID, _ []uuid.UUID) (models.Role, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return models.RoleNone, nil
	}
	if g.OwnerID == caller {
		return models.RoleOwner, nil
	}
	best := models.RoleNone
	for _, grant := range s.grants[graphID] {
		if grant.PrincipalKind != models.PrincipalKindUser {
			continue
		}
		if grant.PrincipalID != caller {
			continue
		}
		if models.RoleAtLeast(grant.Role, best) {
			best = grant.Role
		}
	}
	return best, nil
}

// ----- link sharing -----

func (s *fakeStore) GetLinkShare(_ context.Context, graphID uuid.UUID) (*models.LinkShare, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.graphs[graphID]; !ok {
		return nil, nil
	}
	cur := s.links[graphID]
	if cur == nil {
		return &models.LinkShare{Enabled: false}, nil
	}
	clone := *cur
	if !clone.Enabled {
		clone.Token = ""
		clone.Role = models.RoleNone
	}
	return &clone, nil
}

func (s *fakeStore) PutLinkShare(_ context.Context, graphID uuid.UUID, body *models.UpdateLinkShareRequest) (*models.LinkShare, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.graphs[graphID]; !ok {
		return nil, nil
	}
	if !body.Enabled {
		s.links[graphID] = &models.LinkShare{Enabled: false}
		return s.links[graphID], nil
	}
	role := models.ParseRole(string(body.Role))
	if role == models.RoleNone || role == models.RoleOwner {
		role = models.RoleViewer
	}
	cur := s.links[graphID]
	token := ""
	if cur != nil {
		token = cur.Token
	}
	switchedOn := cur == nil || !cur.Enabled
	if switchedOn || body.RotateToken || token == "" {
		// Deterministic-ish for tests: prefix + UUID. The real repo
		// uses crypto/rand.
		token = "tok-" + uuid.NewString()
	}
	s.links[graphID] = &models.LinkShare{Enabled: true, Token: token, Role: role}
	clone := *s.links[graphID]
	return &clone, nil
}

func (s *fakeStore) ResolveLinkShareToken(_ context.Context, token string) (uuid.UUID, models.Role, error) {
	if token == "" {
		return uuid.Nil, models.RoleNone, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for gid, ls := range s.links {
		if ls == nil || !ls.Enabled || ls.Token != token {
			continue
		}
		return gid, ls.Role, nil
	}
	return uuid.Nil, models.RoleNone, nil
}

func (s *fakeStore) LinkShareRoleFor(_ context.Context, graphID uuid.UUID, presentedToken string) (models.Role, error) {
	if presentedToken == "" {
		return models.RoleNone, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ls := s.links[graphID]
	if ls == nil || !ls.Enabled || ls.Token != presentedToken {
		return models.RoleNone, nil
	}
	return ls.Role, nil
}

// ----- graph templates -----

func (s *fakeStore) ListGraphTemplates(_ context.Context, ownerID uuid.UUID, projectID *uuid.UUID, search string, page, perPage int) ([]models.GraphTemplate, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.GraphTemplate, 0)
	for _, t := range s.templates {
		if t.OwnerID != ownerID {
			continue
		}
		if projectID != nil {
			if t.ProjectID == nil || *t.ProjectID != *projectID {
				continue
			}
		}
		if search != "" {
			needle := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(t.Title), needle) &&
				!strings.Contains(strings.ToLower(t.Description), needle) {
				continue
			}
		}
		out = append(out, *t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	total := len(out)
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}
	start := (page - 1) * perPage
	if start > total {
		start = total
	}
	end := start + perPage
	if end > total {
		end = total
	}
	return out[start:end], total, nil
}

func (s *fakeStore) GetGraphTemplate(_ context.Context, id uuid.UUID) (*models.GraphTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.templates[id]
	if !ok {
		return nil, repo.ErrGraphTemplateNotFound
	}
	cp := *t
	return &cp, nil
}

func (s *fakeStore) CreateGraphTemplate(_ context.Context, body *models.CreateGraphTemplateRequest, ownerID uuid.UUID) (*models.GraphTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	now := time.Now().UTC()
	objParams := body.ObjectParameters
	if objParams == nil {
		objParams = []models.GraphTemplateObjectParameter{}
	}
	nonObjParams := body.NonObjectParameters
	if nonObjParams == nil {
		nonObjParams = []models.GraphTemplateNonObjectParameter{}
	}
	sas := body.SearchArounds
	if sas == nil {
		sas = []models.GraphTemplateSearchAround{}
	}
	lc := body.LayerConfig
	if lc == nil {
		lc = []models.GraphTemplateLayerConfig{}
	}
	orgs := body.Organizations
	if orgs == nil {
		orgs = []string{}
	}
	marks := body.Markings
	if marks == nil {
		marks = []string{}
	}
	t := &models.GraphTemplate{
		ID:                  id,
		RID:                 models.MakeGraphTemplateRID(id),
		Title:               body.Title,
		Description:         body.Description,
		SourceGraphID:       body.SourceGraphID,
		ObjectParameters:    objParams,
		NonObjectParameters: nonObjParams,
		SearchArounds:       sas,
		LayerConfig:         lc,
		GraphConfig:         body.GraphConfig,
		Defaults:            body.Defaults,
		OwnerID:             ownerID,
		ProjectID:           body.ProjectID,
		Organizations:       orgs,
		Markings:            marks,
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	s.templates[id] = t
	cp := *t
	return &cp, nil
}

func (s *fakeStore) UpdateGraphTemplate(_ context.Context, id uuid.UUID, body *models.UpdateGraphTemplateRequest) (*models.GraphTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.templates[id]
	if !ok {
		return nil, repo.ErrGraphTemplateNotFound
	}
	if body.Title != nil {
		t.Title = *body.Title
	}
	if body.Description != nil {
		t.Description = *body.Description
	}
	if body.ObjectParameters != nil {
		t.ObjectParameters = *body.ObjectParameters
	}
	if body.NonObjectParameters != nil {
		t.NonObjectParameters = *body.NonObjectParameters
	}
	if body.SearchArounds != nil {
		t.SearchArounds = *body.SearchArounds
	}
	if body.LayerConfig != nil {
		t.LayerConfig = *body.LayerConfig
	}
	if body.GraphConfig != nil {
		t.GraphConfig = *body.GraphConfig
	}
	if body.Defaults != nil {
		t.Defaults = *body.Defaults
	}
	if body.ProjectID != nil {
		t.ProjectID = body.ProjectID
	}
	if body.Organizations != nil {
		t.Organizations = *body.Organizations
	}
	if body.Markings != nil {
		t.Markings = *body.Markings
	}
	t.UpdatedAt = time.Now().UTC()
	cp := *t
	return &cp, nil
}

func (s *fakeStore) DeleteGraphTemplate(_ context.Context, id uuid.UUID) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.templates[id]; !ok {
		return false, nil
	}
	delete(s.templates, id)
	return true, nil
}

func (s *fakeStore) InstantiateGraphTemplate(ctx context.Context, tpl *models.GraphTemplate, body *models.InstantiateGraphTemplateRequest, callerID uuid.UUID) (*models.InstantiateGraphTemplateResponse, error) {
	title := body.Title
	if title == "" {
		title = "From template · " + tpl.Title
	}
	seedRefs := []string{}
	for _, refs := range body.ObjectParameterValues {
		seedRefs = append(seedRefs, refs...)
	}
	createReq := &models.CreateGraphRequest{
		Title:          title,
		Description:    tpl.Description,
		SeedObjectRefs: seedRefs,
		ProjectID:      tpl.ProjectID,
		Organizations:  tpl.Organizations,
		Markings:       tpl.Markings,
	}
	g, err := s.CreateGraph(ctx, createReq, callerID)
	if err != nil {
		return nil, err
	}
	return &models.InstantiateGraphTemplateResponse{
		Graph:                    g,
		ObjectParameterValues:    body.ObjectParameterValues,
		NonObjectParameterValues: body.NonObjectParameterValues,
	}, nil
}
