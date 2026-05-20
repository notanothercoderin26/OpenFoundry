package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// --- in-memory fake -----------------------------------------------------

type fakeAccessRepo struct {
	mu          sync.Mutex
	owners      map[uuid.UUID]uuid.UUID
	linkShares  map[uuid.UUID]models.PipelineLinkShare
	grants      map[uuid.UUID][]models.PipelineGrant
	followers   map[uuid.UUID]map[uuid.UUID]struct{}
	views       map[uuid.UUID]int64
	comments    map[uuid.UUID][]models.PipelineComment
	failOwnerOf uuid.UUID
}

func newFakeAccessRepo() *fakeAccessRepo {
	return &fakeAccessRepo{
		owners:     map[uuid.UUID]uuid.UUID{},
		linkShares: map[uuid.UUID]models.PipelineLinkShare{},
		grants:     map[uuid.UUID][]models.PipelineGrant{},
		followers:  map[uuid.UUID]map[uuid.UUID]struct{}{},
		views:      map[uuid.UUID]int64{},
		comments:   map[uuid.UUID][]models.PipelineComment{},
	}
}

func (f *fakeAccessRepo) GetPipelineOwner(_ context.Context, id uuid.UUID) (uuid.UUID, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	owner, ok := f.owners[id]
	if !ok {
		return uuid.Nil, errors.New("pipeline not found")
	}
	return owner, nil
}

func (f *fakeAccessRepo) GetPipelineLinkShare(_ context.Context, id uuid.UUID) (models.PipelineLinkShare, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.linkShares[id], nil
}

func (f *fakeAccessRepo) PutPipelineLinkShare(_ context.Context, id uuid.UUID, req models.UpdatePipelineLinkShareRequest) (models.PipelineLinkShare, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !req.Enabled {
		f.linkShares[id] = models.PipelineLinkShare{}
		return f.linkShares[id], nil
	}
	role := req.Role
	if role == "" {
		role = models.PipelineRoleViewer
	}
	if !role.IsLinkShareable() {
		return models.PipelineLinkShare{}, errors.New("invalid link-share role")
	}
	current := f.linkShares[id]
	token := current.Token
	if token == "" || req.RotateToken || !current.Enabled {
		token = "fake-token-" + id.String()[:8]
	}
	share := models.PipelineLinkShare{Enabled: true, Token: token, Role: role}
	f.linkShares[id] = share
	return share, nil
}

func (f *fakeAccessRepo) ResolvePipelineLinkShareToken(_ context.Context, token string) (uuid.UUID, models.PipelineRole, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for id, share := range f.linkShares {
		if share.Enabled && share.Token == token {
			return id, share.Role, true, nil
		}
	}
	return uuid.Nil, "", false, nil
}

func (f *fakeAccessRepo) ListPipelineGrants(_ context.Context, id uuid.UUID) ([]models.PipelineGrant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]models.PipelineGrant(nil), f.grants[id]...), nil
}

func (f *fakeAccessRepo) PutPipelineGrant(_ context.Context, id uuid.UUID, req models.PutPipelineGrantRequest, grantedBy uuid.UUID) (*models.PipelineGrant, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	kind := req.PrincipalKind
	if kind == "" {
		kind = models.PipelinePrincipalKindUser
	}
	if req.Role == models.PipelineRoleNone {
		filtered := f.grants[id][:0]
		for _, g := range f.grants[id] {
			if g.PrincipalKind != kind || g.PrincipalID != req.PrincipalID {
				filtered = append(filtered, g)
			}
		}
		f.grants[id] = filtered
		return nil, nil
	}
	if req.Role == models.PipelineRoleOwner {
		return nil, errors.New("owner is implicit")
	}
	for i, g := range f.grants[id] {
		if g.PrincipalKind == kind && g.PrincipalID == req.PrincipalID {
			g.Role = req.Role
			g.GrantedBy = grantedBy
			f.grants[id][i] = g
			return &g, nil
		}
	}
	grant := models.PipelineGrant{
		ID:            uuid.New(),
		PipelineID:    id,
		PrincipalKind: kind,
		PrincipalID:   req.PrincipalID,
		Role:          req.Role,
		GrantedBy:     grantedBy,
	}
	f.grants[id] = append(f.grants[id], grant)
	return &grant, nil
}

func (f *fakeAccessRepo) DeletePipelineGrant(_ context.Context, id, grantID uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.grants[id][:0]
	removed := false
	for _, g := range f.grants[id] {
		if g.ID == grantID {
			removed = true
			continue
		}
		out = append(out, g)
	}
	f.grants[id] = out
	return removed, nil
}

func (f *fakeAccessRepo) FollowPipeline(_ context.Context, id, follower uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	set, ok := f.followers[id]
	if !ok {
		set = map[uuid.UUID]struct{}{}
		f.followers[id] = set
	}
	if _, exists := set[follower]; exists {
		return false, nil
	}
	set[follower] = struct{}{}
	return true, nil
}

func (f *fakeAccessRepo) UnfollowPipeline(_ context.Context, id, follower uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	set := f.followers[id]
	if _, exists := set[follower]; !exists {
		return false, nil
	}
	delete(set, follower)
	return true, nil
}

func (f *fakeAccessRepo) GetPipelineFollowerSummary(_ context.Context, id, caller uuid.UUID) (models.PipelineFollowerSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	set := f.followers[id]
	_, following := set[caller]
	return models.PipelineFollowerSummary{Following: following, FollowerCount: len(set)}, nil
}

func (f *fakeAccessRepo) RecordPipelineView(_ context.Context, id uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.views[id] = f.views[id] + 1
	return nil
}

func (f *fakeAccessRepo) GetPipelineViewSummary(_ context.Context, id uuid.UUID) (models.PipelineViewSummary, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return models.PipelineViewSummary{ViewCount30Days: f.views[id]}, nil
}

func (f *fakeAccessRepo) ListPipelineComments(_ context.Context, id uuid.UUID, _ int) ([]models.PipelineComment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]models.PipelineComment(nil), f.comments[id]...), nil
}

func (f *fakeAccessRepo) CreatePipelineComment(_ context.Context, id, author uuid.UUID, body string) (*models.PipelineComment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	c := models.PipelineComment{
		ID:         uuid.New(),
		PipelineID: id,
		AuthorID:   author,
		Body:       body,
	}
	f.comments[id] = append([]models.PipelineComment{c}, f.comments[id]...)
	return &c, nil
}

func (f *fakeAccessRepo) DeletePipelineComment(_ context.Context, id, commentID, caller uuid.UUID, isOwner bool) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.comments[id][:0]
	removed := false
	for _, c := range f.comments[id] {
		if c.ID == commentID && (isOwner || c.AuthorID == caller) {
			removed = true
			continue
		}
		out = append(out, c)
	}
	f.comments[id] = out
	return removed, nil
}

// --- helpers ------------------------------------------------------------

func requestWithAuth(method, target string, body []byte, principal uuid.UUID, urlParams map[string]string) *http.Request {
	var req *http.Request
	if body == nil {
		req = httptest.NewRequest(method, target, nil)
	} else {
		req = httptest.NewRequest(method, target, bytes.NewReader(body))
	}
	rctx := chi.NewRouteContext()
	for key, value := range urlParams {
		rctx.URLParams.Add(key, value)
	}
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = authmw.ContextWithClaims(ctx, &authmw.Claims{Sub: principal})
	return req.WithContext(ctx)
}

func installFakeAccessRepo(t *testing.T) (*fakeAccessRepo, func()) {
	t.Helper()
	repo := newFakeAccessRepo()
	restore := SetPipelineAccessRepository(repo)
	return repo, restore
}

// --- tests --------------------------------------------------------------

func TestPipelineLinkShareOwnerOnly(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner

	// Owner can read.
	rr := httptest.NewRecorder()
	GetPipelineLinkShare(rr, requestWithAuth(http.MethodGet, "/pipelines/"+pipelineID.String()+"/link-share", nil, owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)

	// Non-owner is rejected.
	other := uuid.New()
	rr = httptest.NewRecorder()
	GetPipelineLinkShare(rr, requestWithAuth(http.MethodGet, "/pipelines/"+pipelineID.String()+"/link-share", nil, other, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusForbidden, rr.Code)

	// Owner enables sharing with role=viewer.
	rr = httptest.NewRecorder()
	PutPipelineLinkShare(rr, requestWithAuth(http.MethodPut, "/pipelines/"+pipelineID.String()+"/link-share", []byte(`{"enabled":true,"role":"viewer"}`), owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var share models.PipelineLinkShare
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&share))
	require.True(t, share.Enabled)
	require.NotEmpty(t, share.Token)
	require.Equal(t, models.PipelineRoleViewer, share.Role)
}

func TestPipelineLinkShareRejectsOwnerRole(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner

	rr := httptest.NewRecorder()
	PutPipelineLinkShare(rr, requestWithAuth(http.MethodPut, "/pipelines/"+pipelineID.String()+"/link-share", []byte(`{"enabled":true,"role":"owner"}`), owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPipelineGrantsLifecycle(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner
	collaborator := uuid.New()

	// Upsert editor grant.
	rr := httptest.NewRecorder()
	body, _ := json.Marshal(models.PutPipelineGrantRequest{
		PrincipalKind: models.PipelinePrincipalKindUser,
		PrincipalID:   collaborator,
		Role:          models.PipelineRoleEditor,
	})
	PutPipelineGrant(rr, requestWithAuth(http.MethodPut, "/pipelines/"+pipelineID.String()+"/grants", body, owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var stored models.PipelineGrant
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&stored))
	require.Equal(t, models.PipelineRoleEditor, stored.Role)

	// List grants.
	rr = httptest.NewRecorder()
	ListPipelineGrants(rr, requestWithAuth(http.MethodGet, "/pipelines/"+pipelineID.String()+"/grants", nil, owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var listed struct {
		Items []models.PipelineGrant `json:"items"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&listed))
	require.Len(t, listed.Items, 1)

	// Delete grant.
	rr = httptest.NewRecorder()
	DeletePipelineGrant(rr, requestWithAuth(http.MethodDelete, "/pipelines/"+pipelineID.String()+"/grants/"+stored.ID.String(), nil, owner, map[string]string{"id": pipelineID.String(), "grant_id": stored.ID.String()}))
	require.Equal(t, http.StatusNoContent, rr.Code)

	// Owner role rejected.
	rr = httptest.NewRecorder()
	body, _ = json.Marshal(models.PutPipelineGrantRequest{
		PrincipalKind: models.PipelinePrincipalKindUser,
		PrincipalID:   collaborator,
		Role:          models.PipelineRoleOwner,
	})
	PutPipelineGrant(rr, requestWithAuth(http.MethodPut, "/pipelines/"+pipelineID.String()+"/grants", body, owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPipelineFollowersIdempotent(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner
	subscriber := uuid.New()

	follow := func() models.PipelineFollowerSummary {
		rr := httptest.NewRecorder()
		FollowPipeline(rr, requestWithAuth(http.MethodPost, "/pipelines/"+pipelineID.String()+"/followers", nil, subscriber, map[string]string{"id": pipelineID.String()}))
		require.Equal(t, http.StatusOK, rr.Code)
		var summary models.PipelineFollowerSummary
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&summary))
		return summary
	}

	summary := follow()
	require.True(t, summary.Following)
	require.Equal(t, 1, summary.FollowerCount)

	// Following again is idempotent.
	summary = follow()
	require.True(t, summary.Following)
	require.Equal(t, 1, summary.FollowerCount)

	// Unfollow brings the count back to zero.
	rr := httptest.NewRecorder()
	UnfollowPipeline(rr, requestWithAuth(http.MethodDelete, "/pipelines/"+pipelineID.String()+"/followers", nil, subscriber, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var afterUnfollow models.PipelineFollowerSummary
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&afterUnfollow))
	require.False(t, afterUnfollow.Following)
	require.Equal(t, 0, afterUnfollow.FollowerCount)
}

func TestPipelineFollowerSummaryRequiresAuth(t *testing.T) {
	_, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()

	rr := httptest.NewRecorder()
	GetPipelineFollowerSummary(rr, requestWithURLParam(http.MethodGet, "/pipelines/"+pipelineID.String()+"/followers/summary", nil, "id", pipelineID.String()))
	require.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestPipelineViewsAggregate(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner

	for i := 0; i < 3; i++ {
		rr := httptest.NewRecorder()
		RecordPipelineView(rr, requestWithAuth(http.MethodPost, "/pipelines/"+pipelineID.String()+"/views", nil, owner, map[string]string{"id": pipelineID.String()}))
		require.Equal(t, http.StatusOK, rr.Code, "view %d", i)
	}

	rr := httptest.NewRecorder()
	GetPipelineViewSummary(rr, requestWithAuth(http.MethodGet, "/pipelines/"+pipelineID.String()+"/views/summary", nil, owner, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var summary models.PipelineViewSummary
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&summary))
	require.Equal(t, int64(3), summary.ViewCount30Days)
}

func TestPipelineCommentsLifecycle(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner
	contributor := uuid.New()

	// Empty body is rejected.
	rr := httptest.NewRecorder()
	CreatePipelineComment(rr, requestWithAuth(http.MethodPost, "/pipelines/"+pipelineID.String()+"/comments", []byte(`{"body":"   "}`), contributor, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusBadRequest, rr.Code)

	// Create a comment as contributor.
	rr = httptest.NewRecorder()
	CreatePipelineComment(rr, requestWithAuth(http.MethodPost, "/pipelines/"+pipelineID.String()+"/comments", []byte(`{"body":"first take"}`), contributor, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusCreated, rr.Code)
	var c models.PipelineComment
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&c))
	require.Equal(t, "first take", c.Body)
	require.Equal(t, contributor, c.AuthorID)

	// Another user cannot delete the contributor's comment.
	stranger := uuid.New()
	rr = httptest.NewRecorder()
	DeletePipelineComment(rr, requestWithAuth(http.MethodDelete, "/pipelines/"+pipelineID.String()+"/comments/"+c.ID.String(), nil, stranger, map[string]string{"id": pipelineID.String(), "comment_id": c.ID.String()}))
	require.Equal(t, http.StatusNotFound, rr.Code)

	// Owner can delete any comment.
	rr = httptest.NewRecorder()
	DeletePipelineComment(rr, requestWithAuth(http.MethodDelete, "/pipelines/"+pipelineID.String()+"/comments/"+c.ID.String(), nil, owner, map[string]string{"id": pipelineID.String(), "comment_id": c.ID.String()}))
	require.Equal(t, http.StatusNoContent, rr.Code)

	// Subsequent list is empty.
	rr = httptest.NewRecorder()
	ListPipelineComments(rr, requestWithAuth(http.MethodGet, "/pipelines/"+pipelineID.String()+"/comments", nil, contributor, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusOK, rr.Code)
	var listed struct {
		Items []models.PipelineComment `json:"items"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&listed))
	require.Len(t, listed.Items, 0)
}

func TestPipelineCommentAuthorCanSelfDelete(t *testing.T) {
	repo, restore := installFakeAccessRepo(t)
	t.Cleanup(restore)
	pipelineID := uuid.New()
	owner := uuid.New()
	repo.owners[pipelineID] = owner
	author := uuid.New()

	rr := httptest.NewRecorder()
	CreatePipelineComment(rr, requestWithAuth(http.MethodPost, "/pipelines/"+pipelineID.String()+"/comments", []byte(`{"body":"my note"}`), author, map[string]string{"id": pipelineID.String()}))
	require.Equal(t, http.StatusCreated, rr.Code)
	var c models.PipelineComment
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&c))

	rr = httptest.NewRecorder()
	DeletePipelineComment(rr, requestWithAuth(http.MethodDelete, "/pipelines/"+pipelineID.String()+"/comments/"+c.ID.String(), nil, author, map[string]string{"id": pipelineID.String(), "comment_id": c.ID.String()}))
	require.Equal(t, http.StatusNoContent, rr.Code)
}
