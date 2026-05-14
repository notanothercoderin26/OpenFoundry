package repo

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

func newRepo(t *testing.T) *MemoryRepository {
	t.Helper()
	clock := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	tick := 0
	return NewMemoryRepository().
		WithClock(func() time.Time {
			tick++
			return clock.Add(time.Duration(tick) * time.Second)
		})
}

func mustCreate(t *testing.T, r Repository, p models.CreateParams) *models.ComputeModule {
	t.Helper()
	m, err := r.Create(context.Background(), p)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return m
}

func sampleParams(actor, project uuid.UUID) models.CreateParams {
	return models.CreateParams{
		Name:          "Forecast Pipeline",
		Description:   "weekly retrain",
		ProjectID:     project,
		ExecutionMode: models.ExecutionModeFunction,
		Actor:         actor,
	}
}

func TestCreateAndGet(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	got := mustCreate(t, r, sampleParams(actor, project))
	if got.ID == uuid.Nil {
		t.Fatal("create should assign a non-zero ID")
	}
	if got.State != models.LifecycleActive {
		t.Fatalf("expected active state, got %q", got.State)
	}
	if got.CreatedBy != actor || got.UpdatedBy != actor {
		t.Fatal("actor not stamped on create")
	}

	fetched, err := r.Get(context.Background(), got.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.Name != got.Name || fetched.ProjectID != got.ProjectID {
		t.Fatal("fetched module does not match created")
	}
}

func TestCreateNameConflictWithinFolder(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	_ = mustCreate(t, r, sampleParams(actor, project))

	_, err := r.Create(context.Background(), sampleParams(actor, project))
	if !errors.Is(err, ErrNameConflict) {
		t.Fatalf("expected name conflict, got %v", err)
	}
}

func TestCreateAllowsSameNameInDifferentProject(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()

	_ = mustCreate(t, r, sampleParams(actor, uuid.New()))
	if _, err := r.Create(context.Background(), sampleParams(actor, uuid.New())); err != nil {
		t.Fatalf("cross-project create should succeed: %v", err)
	}
}

func TestUpdateMetadataPatchesAndDetectsConflicts(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	a := mustCreate(t, r, sampleParams(actor, project))
	b := mustCreate(t, r, models.CreateParams{
		Name:          "Sibling Module",
		ProjectID:     project,
		ExecutionMode: models.ExecutionModePipeline,
		Actor:         actor,
	})

	newName := "Sibling Module"
	_, err := r.UpdateMetadata(context.Background(), a.ID, models.UpdateMetadataParams{
		Name:  &newName,
		Actor: actor,
	})
	if !errors.Is(err, ErrNameConflict) {
		t.Fatalf("expected name conflict on rename, got %v", err)
	}

	desc := "updated"
	labels := map[string]string{"team": "ml"}
	patched, err := r.UpdateMetadata(context.Background(), b.ID, models.UpdateMetadataParams{
		Description: &desc,
		Labels:      &labels,
		Actor:       actor,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if patched.Description != "updated" {
		t.Fatalf("description = %q, want %q", patched.Description, "updated")
	}
	if patched.Labels["team"] != "ml" {
		t.Fatalf("labels not applied: %#v", patched.Labels)
	}
	if !patched.UpdatedAt.After(b.UpdatedAt) {
		t.Fatal("updated_at should advance on patch")
	}
}

func TestMoveRespectsCollisionInTargetFolder(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	projectA := uuid.New()
	projectB := uuid.New()

	a := mustCreate(t, r, models.CreateParams{
		Name:          "Shared Name",
		ProjectID:     projectA,
		ExecutionMode: models.ExecutionModeFunction,
		Actor:         actor,
	})
	_ = mustCreate(t, r, models.CreateParams{
		Name:          "Shared Name",
		ProjectID:     projectB,
		ExecutionMode: models.ExecutionModeFunction,
		Actor:         actor,
	})

	_, err := r.Move(context.Background(), a.ID, models.MoveParams{
		ProjectID: projectB,
		Actor:     actor,
	})
	if !errors.Is(err, ErrNameConflict) {
		t.Fatalf("expected name conflict on move, got %v", err)
	}

	projectC := uuid.New()
	moved, err := r.Move(context.Background(), a.ID, models.MoveParams{
		ProjectID: projectC,
		Actor:     actor,
	})
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	if moved.ProjectID != projectC {
		t.Fatalf("project_id not updated: %s", moved.ProjectID)
	}
}

func TestDuplicateClonesMetadataIntoNewActiveModule(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	src := mustCreate(t, r, models.CreateParams{
		Name:          "Original",
		ProjectID:     project,
		ExecutionMode: models.ExecutionModePipeline,
		Labels:        map[string]string{"env": "prod"},
		Actor:         actor,
	})

	dup, err := r.Duplicate(context.Background(), src.ID, models.DuplicateParams{
		NewName: "Original Copy",
		Actor:   actor,
	})
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	if dup.ID == src.ID {
		t.Fatal("duplicate must have a different ID")
	}
	if dup.ExecutionMode != src.ExecutionMode {
		t.Fatal("execution mode should be inherited")
	}
	if dup.Labels["env"] != "prod" {
		t.Fatal("labels should be cloned")
	}
	if dup.State != models.LifecycleActive {
		t.Fatal("duplicate should start active")
	}
}

func TestArchiveAndRestoreLifecycle(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	m := mustCreate(t, r, sampleParams(actor, project))

	archived, err := r.Archive(context.Background(), m.ID, actor)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	if !archived.IsArchived() || archived.ArchivedAt == nil || archived.ArchivedBy == nil {
		t.Fatalf("archive should populate state + timestamps: %#v", archived)
	}

	if _, err := r.Archive(context.Background(), m.ID, actor); !errors.Is(err, ErrAlreadyArchived) {
		t.Fatalf("re-archive should fail with ErrAlreadyArchived, got %v", err)
	}

	// While archived, the name slot is free for new modules.
	reclaim, err := r.Create(context.Background(), sampleParams(actor, project))
	if err != nil {
		t.Fatalf("expected name slot to be free after archive, got %v", err)
	}
	if reclaim.ID == m.ID {
		t.Fatal("expected a distinct new module")
	}

	// Restoring the original must fail because the slot is taken.
	if _, err := r.Restore(context.Background(), m.ID, actor); !errors.Is(err, ErrNameConflict) {
		t.Fatalf("restore should detect name conflict, got %v", err)
	}

	// Free the slot and try again.
	if _, err := r.Archive(context.Background(), reclaim.ID, actor); err != nil {
		t.Fatalf("archive helper: %v", err)
	}
	restored, err := r.Restore(context.Background(), m.ID, actor)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if restored.State != models.LifecycleActive || restored.ArchivedAt != nil {
		t.Fatalf("restore should clear archived metadata: %#v", restored)
	}

	if _, err := r.Restore(context.Background(), m.ID, actor); !errors.Is(err, ErrNotArchived) {
		t.Fatalf("re-restore should fail with ErrNotArchived, got %v", err)
	}
}

func TestListFiltersByProjectAndState(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	projectA := uuid.New()
	projectB := uuid.New()

	for i := 0; i < 3; i++ {
		_ = mustCreate(t, r, models.CreateParams{
			Name:          "A-" + uuid.New().String()[:6],
			ProjectID:     projectA,
			ExecutionMode: models.ExecutionModeFunction,
			Actor:         actor,
		})
	}
	bMod := mustCreate(t, r, models.CreateParams{
		Name:          "B-only",
		ProjectID:     projectB,
		ExecutionMode: models.ExecutionModePipeline,
		Actor:         actor,
	})
	if _, err := r.Archive(context.Background(), bMod.ID, actor); err != nil {
		t.Fatalf("archive: %v", err)
	}

	// Default list excludes archived B-only and returns three A modules.
	res, err := r.List(context.Background(), ListFilter{ProjectID: &projectA}, Page{})
	if err != nil {
		t.Fatalf("list A: %v", err)
	}
	if len(res.Items) != 3 {
		t.Fatalf("expected 3 active modules in A, got %d", len(res.Items))
	}

	// Filtering to archived returns the archived B module only.
	state := models.LifecycleArchived
	res, err = r.List(context.Background(), ListFilter{State: &state}, Page{})
	if err != nil {
		t.Fatalf("list archived: %v", err)
	}
	if len(res.Items) != 1 || res.Items[0].ID != bMod.ID {
		t.Fatalf("archived filter returned %d items", len(res.Items))
	}

	// IncludeArchived broadens the default scope.
	res, err = r.List(context.Background(), ListFilter{IncludeArchived: true}, Page{})
	if err != nil {
		t.Fatalf("list incl: %v", err)
	}
	if len(res.Items) != 4 {
		t.Fatalf("expected 4 modules with include_archived, got %d", len(res.Items))
	}
}

func TestListPaginationCursor(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	project := uuid.New()

	created := make([]uuid.UUID, 0, 5)
	for i := 0; i < 5; i++ {
		m := mustCreate(t, r, models.CreateParams{
			Name:          "mod-" + uuid.New().String()[:6],
			ProjectID:     project,
			ExecutionMode: models.ExecutionModeFunction,
			Actor:         actor,
		})
		created = append(created, m.ID)
	}

	first, err := r.List(context.Background(), ListFilter{}, Page{Limit: 2})
	if err != nil {
		t.Fatalf("list first: %v", err)
	}
	if len(first.Items) != 2 || first.NextCursor == nil {
		t.Fatalf("expected 2 items + cursor, got %d cursor=%v", len(first.Items), first.NextCursor)
	}

	second, err := r.List(context.Background(), ListFilter{}, Page{Limit: 2, Cursor: first.NextCursor})
	if err != nil {
		t.Fatalf("list second: %v", err)
	}
	if len(second.Items) != 2 || second.NextCursor == nil {
		t.Fatalf("expected 2 items + cursor on page 2, got %d cursor=%v", len(second.Items), second.NextCursor)
	}

	third, err := r.List(context.Background(), ListFilter{}, Page{Limit: 2, Cursor: second.NextCursor})
	if err != nil {
		t.Fatalf("list third: %v", err)
	}
	if len(third.Items) != 1 || third.NextCursor != nil {
		t.Fatalf("expected final page of 1 item with no cursor, got %d cursor=%v", len(third.Items), third.NextCursor)
	}

	seen := map[uuid.UUID]bool{}
	for _, p := range [][]*models.ComputeModule{first.Items, second.Items, third.Items} {
		for _, m := range p {
			if seen[m.ID] {
				t.Fatalf("module %s returned twice across pages", m.ID)
			}
			seen[m.ID] = true
		}
	}
	if len(seen) != 5 {
		t.Fatalf("expected all 5 modules across pages, got %d", len(seen))
	}
}

func TestPipelineIOGuardRejectsFunctionMode(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	fn := mustCreate(t, r, sampleParams(actor, uuid.New()))

	cfg := models.PipelineIOConfig{
		Inputs: []models.PipelineIO{{
			Alias:        "in",
			ResourceKind: models.PipelineResourceStream,
			ResourceID:   uuid.New(),
		}},
	}
	_, err := r.SetPipelineIOConfig(context.Background(), fn.ID, cfg, actor)
	if !errors.Is(err, ErrExecutionModeMismatch) {
		t.Fatalf("expected ErrExecutionModeMismatch, got %v", err)
	}
	_, err = r.ClearPipelineIOConfig(context.Background(), fn.ID, actor)
	if !errors.Is(err, ErrExecutionModeMismatch) {
		t.Fatalf("expected ErrExecutionModeMismatch on clear, got %v", err)
	}
}

func TestPipelineIOConfigSetAndClear(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	pipe := mustCreate(t, r, models.CreateParams{
		Name:          "Stream pipeline",
		ProjectID:     uuid.New(),
		ExecutionMode: models.ExecutionModePipeline,
		Actor:         actor,
	})

	streamID := uuid.New()
	cfg := models.PipelineIOConfig{
		Inputs: []models.PipelineIO{{
			Alias:        "events",
			ResourceKind: models.PipelineResourceStream,
			ResourceID:   streamID,
		}},
		Outputs: []models.PipelineIO{{
			Alias:        "audit",
			ResourceKind: models.PipelineResourceDataset,
			ResourceID:   uuid.New(),
		}},
	}
	updated, err := r.SetPipelineIOConfig(context.Background(), pipe.ID, cfg, actor)
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if updated.PipelineIOConfig == nil ||
		len(updated.PipelineIOConfig.Inputs) != 1 ||
		updated.PipelineIOConfig.Inputs[0].ResourceID != streamID {
		t.Fatalf("config not stored: %+v", updated.PipelineIOConfig)
	}

	// Mutating the caller's copy must not leak back into storage.
	updated.PipelineIOConfig.Inputs[0].Alias = "tampered"
	fetched, err := r.Get(context.Background(), pipe.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.PipelineIOConfig.Inputs[0].Alias != "events" {
		t.Fatal("repo returned a shared slice — config was mutated by caller")
	}

	cleared, err := r.ClearPipelineIOConfig(context.Background(), pipe.ID, actor)
	if err != nil {
		t.Fatalf("clear: %v", err)
	}
	if cleared.PipelineIOConfig != nil {
		t.Fatalf("expected nil pipeline_io_config after clear, got %+v", cleared.PipelineIOConfig)
	}
}

func TestPipelineIOConfigOnMissingModule(t *testing.T) {
	r := newRepo(t)
	_, err := r.SetPipelineIOConfig(context.Background(), uuid.New(), models.PipelineIOConfig{
		Inputs: []models.PipelineIO{{Alias: "x", ResourceKind: models.PipelineResourceStream, ResourceID: uuid.New()}},
	}, uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for missing module, got %v", err)
	}
}

func TestContainerImageSetGetClear(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	m := mustCreate(t, r, sampleParams(actor, uuid.New()))

	img := models.ContainerImage{
		Registry:   "ghcr.io",
		Repository: "openfoundry/echo",
		Tag:        "v1",
		Platform:   "linux/amd64",
		User:       "65532",
	}
	updated, err := r.SetContainerImage(context.Background(), m.ID, img, actor)
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if updated.ContainerImage == nil || updated.ContainerImage.Repository != "openfoundry/echo" {
		t.Fatalf("container_image not stored: %+v", updated.ContainerImage)
	}

	// Mutate caller's local copy — store should not be affected.
	updated.ContainerImage.Repository = "tampered/repo"
	fetched, err := r.Get(context.Background(), m.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.ContainerImage.Repository != "openfoundry/echo" {
		t.Fatal("repo returned a shared pointer — caller mutation leaked")
	}

	cleared, err := r.ClearContainerImage(context.Background(), m.ID, actor)
	if err != nil {
		t.Fatalf("clear: %v", err)
	}
	if cleared.ContainerImage != nil {
		t.Fatalf("expected nil container_image after clear, got %+v", cleared.ContainerImage)
	}
}

func TestRuntimeConfigSetGetClear(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	m := mustCreate(t, r, sampleParams(actor, uuid.New()))

	cfg := models.RuntimeConfig{
		Role:    models.ContainerRoleEntrypoint,
		Command: []string{"/usr/local/bin/service"},
		Args:    []string{"--config", "/etc/cfg"},
		Env: []models.EnvVar{
			{Name: "PORT", Value: "8080"},
		},
		Ports: []models.ContainerPort{{Name: "http", Port: 8080, Protocol: models.PortHTTP}},
	}
	updated, err := r.SetRuntimeConfig(context.Background(), m.ID, cfg, actor)
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if updated.RuntimeConfig == nil ||
		updated.RuntimeConfig.Ports[0].Name != "http" {
		t.Fatalf("runtime_config not stored: %+v", updated.RuntimeConfig)
	}

	// Caller mutation should not leak into storage.
	updated.RuntimeConfig.Ports[0].Name = "tampered"
	fetched, err := r.Get(context.Background(), m.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.RuntimeConfig.Ports[0].Name != "http" {
		t.Fatal("repo leaked an aliased slice (caller mutation propagated)")
	}

	cleared, err := r.ClearRuntimeConfig(context.Background(), m.ID, actor)
	if err != nil {
		t.Fatalf("clear: %v", err)
	}
	if cleared.RuntimeConfig != nil {
		t.Fatalf("expected nil runtime_config after clear, got %+v", cleared.RuntimeConfig)
	}
}

func TestDeleteRemovesRecord(t *testing.T) {
	r := newRepo(t)
	actor := uuid.New()
	m := mustCreate(t, r, sampleParams(actor, uuid.New()))

	if err := r.Delete(context.Background(), m.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := r.Get(context.Background(), m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
	if err := r.Delete(context.Background(), m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound on second delete, got %v", err)
	}
}
