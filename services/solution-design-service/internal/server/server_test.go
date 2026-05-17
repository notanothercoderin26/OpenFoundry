package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/solution-design-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/solution-design-service/internal/handlers"
)

func TestHealthz_ReturnsOK(t *testing.T) {
	t.Parallel()
	cfg := &config.Config{}
	cfg.Service.Name = "solution-design-service"
	cfg.Service.Version = "test"

	jwt := authmw.NewJWTConfig("test-secret")
	h := &handlers.Handlers{} // /healthz does not touch the repo.
	r := BuildRouter(cfg, jwt, h, observability.NewMetrics())

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("/healthz status = %d, want %d", w.Code, http.StatusOK)
	}
}
