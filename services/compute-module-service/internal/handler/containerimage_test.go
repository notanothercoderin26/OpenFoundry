package handler_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/domain/containerimage"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/handler"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/repo"
)

func goodImage() models.ContainerImage {
	return models.ContainerImage{
		Registry:     "ghcr.io",
		Repository:   "openfoundry/echo",
		Tag:          "v1.0.0",
		Digest:       "sha256:" + strings.Repeat("a", 64),
		Platform:     "linux/amd64",
		User:         "65532",
		ExposedPorts: []int{8080},
		Provenance: &models.ImageProvenance{
			BuildRef: "abc123",
			BuildURL: "https://ci.example.com/run/1",
		},
	}
}

func TestSetContainerImageHappyPath(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", goodImage())
	if w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}
	got := decode[models.ComputeModule](t, w)
	if got.ContainerImage == nil || got.ContainerImage.Repository != "openfoundry/echo" {
		t.Fatalf("image not stored: %+v", got.ContainerImage)
	}
}

func TestSetContainerImageRejectsNonRoot(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	img := goodImage()
	img.User = "0"
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", img)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d body=%s", w.Code, w.Body.String())
	}
	body := decode[handler.ContainerImageRejectionBody](t, w)
	found := false
	for _, f := range body.Findings {
		if f.Code == containerimage.CodeNonRootRequired {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected non-root finding in response, got %+v", body.Findings)
	}
}

func TestSetContainerImageStructuralBadRequest(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	img := goodImage()
	img.Registry = ""
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", img)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on missing registry, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSetContainerImageMissingTagAndDigest(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	img := goodImage()
	img.Tag = ""
	img.Digest = ""
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", img)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when neither tag nor digest is supplied, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestGetContainerImage404WhenUnset(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	w := doJSON(t, r, http.MethodGet, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unset image, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestGetContainerImageReturnsStoredFindings(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	// Image without digest — should clear policy but carry a warn finding.
	img := goodImage()
	img.Digest = ""
	if w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", img); w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}

	w := doJSON(t, r, http.MethodGet, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get: %d %s", w.Code, w.Body.String())
	}
	got := decode[models.ContainerImage](t, w)
	if len(got.Findings) == 0 {
		t.Fatal("expected at least one stored finding (missing digest warn)")
	}
}

func TestClearContainerImageRemovesField(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	if w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", goodImage()); w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}
	w := doJSON(t, r, http.MethodDelete, "/api/v1/compute-modules/"+mod.ID.String()+"/container-image", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("clear: %d %s", w.Code, w.Body.String())
	}
	cleared := decode[models.ComputeModule](t, w)
	if cleared.ContainerImage != nil {
		t.Fatalf("expected nil image after clear, got %+v", cleared.ContainerImage)
	}
}

func TestValidateContainerImageDryRun(t *testing.T) {
	r, _ := buildTestRouter(t)

	// Happy path.
	w := doJSON(t, r, http.MethodPost, "/api/v1/compute-modules/container-image/validate", goodImage())
	if w.Code != http.StatusOK {
		t.Fatalf("status %d body=%s", w.Code, w.Body.String())
	}
	got := decode[handler.ValidateContainerImageResponse](t, w)
	if !got.Cleared {
		t.Fatalf("happy path should clear policy: %+v", got)
	}

	// Bad image.
	bad := goodImage()
	bad.Platform = "windows/amd64"
	w = doJSON(t, r, http.MethodPost, "/api/v1/compute-modules/container-image/validate", bad)
	if w.Code != http.StatusOK {
		t.Fatalf("dry-run should still 200 with findings, got %d body=%s", w.Code, w.Body.String())
	}
	got = decode[handler.ValidateContainerImageResponse](t, w)
	if got.Cleared {
		t.Fatal("dry-run should report cleared=false for bad platform")
	}
}

func TestSetContainerImageRequiresAuth(t *testing.T) {
	store := newAnonRouter(t)
	w := doJSON(t, store, http.MethodPut, "/api/v1/compute-modules/"+uuid.New().String()+"/container-image", goodImage())
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", w.Code, w.Body.String())
	}
}

// newAnonRouter mounts the container-image endpoints without the auth
// injection middleware so we can assert on the 401 path explicitly.
func newAnonRouter(t *testing.T) http.Handler {
	t.Helper()
	state := &handler.State{Repo: repo.NewMemoryRepository()}
	router := chi.NewRouter()
	router.Put("/api/v1/compute-modules/{id}/container-image", state.SetContainerImage)
	router.Get("/api/v1/compute-modules/{id}/container-image", state.GetContainerImage)
	router.Delete("/api/v1/compute-modules/{id}/container-image", state.ClearContainerImage)
	router.Post("/api/v1/compute-modules/container-image/validate", state.ValidateContainerImage)
	return router
}
