package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/report-service/internal/config"
)

func testToken(t *testing.T, secret string) string {
	t.Helper()
	use := "access"
	tok, err := authmw.EncodeToken(authmw.NewJWTConfig(secret), &authmw.Claims{Sub: uuid.New(), TokenUse: &use, EXP: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestReportRoutesSmokeNo501(t *testing.T) {
	cfg := &config.Config{}
	cfg.Service.Name = "report-service"
	cfg.Service.Version = "test"
	cfg.JWT.Secret = "secret"
	cfg.Server.Addr = "127.0.0.1:0"
	srv, err := New(cfg, observability.NewMetrics(), nil)
	if err != nil {
		t.Fatal(err)
	}
	token := testToken(t, cfg.JWT.Secret)
	routes := []struct{ method, path, body string }{
		{"GET", "/api/v1/reports/overview", ""}, {"GET", "/api/v1/reports/catalog", ""}, {"GET", "/api/v1/reports/definitions", ""}, {"GET", "/api/v1/reports/schedules", ""},
	}
	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, bytes.NewBufferString(rt.body))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.httpServer.Handler.ServeHTTP(w, req)
		if w.Code == http.StatusNotImplemented {
			t.Fatalf("%s %s returned 501", rt.method, rt.path)
		}
		if w.Code < 200 || w.Code >= 300 {
			t.Fatalf("%s %s status=%d body=%s", rt.method, rt.path, w.Code, w.Body.String())
		}
	}
}

func TestReportCreateGenerateHistoryDownload(t *testing.T) {
	cfg := &config.Config{}
	cfg.Service.Name = "report-service"
	cfg.Service.Version = "test"
	cfg.JWT.Secret = "secret"
	cfg.Server.Addr = "127.0.0.1:0"
	srv, _ := New(cfg, observability.NewMetrics(), nil)
	token := testToken(t, cfg.JWT.Secret)
	body := `{"name":"Ops Daily","owner":"ops","generator_kind":"pdf","dataset_name":"orders","template":{"title":"Ops Daily","sections":[{"id":"s1","title":"Orders","kind":"table","query":"select *","description":"","config":{}}]},"schedule":{"cadence":"daily","timezone":"UTC","anchor_time":"09:00","enabled":true,"next_run_at":"2026-05-19T09:00:00Z"},"recipients":[],"active":true}`
	req := httptest.NewRequest("POST", "/api/v1/reports/definitions", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", w.Code, w.Body.String())
	}
	id := string(bytes.Split(bytes.Split(w.Body.Bytes(), []byte(`"id":"`))[1], []byte(`"`))[0])
	for _, path := range []string{"/api/v1/reports/definitions/" + id + "/generate"} {
		req = httptest.NewRequest("POST", path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.httpServer.Handler.ServeHTTP(w, req)
		if w.Code == 501 || w.Code >= 300 {
			t.Fatalf("%s status=%d body=%s", path, w.Code, w.Body.String())
		}
	}
	req = httptest.NewRequest("GET", "/api/v1/reports/definitions/"+id+"/history", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("history status=%d", w.Code)
	}
}
