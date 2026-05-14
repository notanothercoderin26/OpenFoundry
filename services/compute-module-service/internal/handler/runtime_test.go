package handler_test

import (
	"net/http"
	"testing"

	runtimepolicy "github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/domain/runtime"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/handler"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

func minimalRuntime() models.RuntimeConfig {
	return models.RuntimeConfig{
		Role:    models.ContainerRoleEntrypoint,
		Command: []string{"/usr/local/bin/service"},
		Resources: &models.ResourceProfile{
			CPUMillicores: 500,
			MemoryMiB:     512,
		},
		Health: &models.HealthConfig{ReadinessPath: "/healthz", ReadinessPort: 8080},
		Logging: &models.LoggingConfig{StdoutEnabled: true, StderrEnabled: true},
		Env: []models.EnvVar{{Name: "PORT", Value: "8080"}},
		Ports: []models.ContainerPort{
			{Name: "http", Port: 8080, Protocol: models.PortHTTP},
		},
	}
}

func TestSetRuntimeConfigHappyPath(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", minimalRuntime())
	if w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}
	got := decode[models.ComputeModule](t, w)
	if got.RuntimeConfig == nil || got.RuntimeConfig.Ports[0].Name != "http" {
		t.Fatalf("runtime not stored: %+v", got.RuntimeConfig)
	}
	for _, f := range got.RuntimeConfig.Findings {
		if f.Severity == models.FindingSeverityError {
			t.Fatalf("happy path should not emit error findings: %+v", f)
		}
	}
}

func TestSetRuntimeConfigRedactsSecretEnv(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	cfg := minimalRuntime()
	cfg.Env = append(cfg.Env, models.EnvVar{Name: "API_KEY", Value: "literal-key-value-9999"})

	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", cfg)
	if w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}
	got := decode[models.ComputeModule](t, w)

	var apiKey *models.EnvVar
	for i := range got.RuntimeConfig.Env {
		if got.RuntimeConfig.Env[i].Name == "API_KEY" {
			apiKey = &got.RuntimeConfig.Env[i]
			break
		}
	}
	if apiKey == nil {
		t.Fatal("API_KEY env var missing from response")
	}
	if apiKey.Value != runtimepolicy.RedactedPlaceholder || !apiKey.Redacted {
		t.Fatalf("API_KEY should be redacted, got %+v", apiKey)
	}
	if !findingPresent(got.RuntimeConfig.Findings, runtimepolicy.CodeEnvSecretRedacted) {
		t.Fatalf("expected redaction finding, got %+v", got.RuntimeConfig.Findings)
	}
}

func TestSetRuntimeConfigStructuralBadRequest(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	bad := minimalRuntime()
	bad.Env = append(bad.Env, models.EnvVar{Name: "1BAD", Value: "x"})
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", bad)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on bad env name, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSetRuntimeConfigDuplicatePort(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	bad := minimalRuntime()
	bad.Ports = append(bad.Ports, models.ContainerPort{Name: "http2", Port: 8080, Protocol: models.PortHTTP})
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", bad)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on duplicate port, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSetRuntimeConfigBindingRequiredForValueFromSecret(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	bad := minimalRuntime()
	bad.Env = append(bad.Env, models.EnvVar{
		Name:            "DB_PASSWORD",
		ValueFromSecret: &models.SecretValueSource{BindingName: "ghost"},
	})
	w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", bad)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown binding, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestGetRuntimeConfigReturnsStoredFindings(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	cfg := minimalRuntime()
	cfg.Env = append(cfg.Env, models.EnvVar{Name: "PASSWORD", Value: "literal-pass"})
	if w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", cfg); w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}

	w := doJSON(t, r, http.MethodGet, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get: %d %s", w.Code, w.Body.String())
	}
	got := decode[models.RuntimeConfig](t, w)
	if !findingPresent(got.Findings, runtimepolicy.CodeEnvSecretRedacted) {
		t.Fatalf("findings missing from GET: %+v", got.Findings)
	}
}

func TestGetRuntimeConfig404WhenUnset(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	w := doJSON(t, r, http.MethodGet, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestClearRuntimeConfigDropsField(t *testing.T) {
	r, _ := buildTestRouter(t)
	mod := createModule(t, r, models.ExecutionModeFunction)

	if w := doJSON(t, r, http.MethodPut, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", minimalRuntime()); w.Code != http.StatusOK {
		t.Fatalf("set: %d %s", w.Code, w.Body.String())
	}
	w := doJSON(t, r, http.MethodDelete, "/api/v1/compute-modules/"+mod.ID.String()+"/runtime", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("clear: %d %s", w.Code, w.Body.String())
	}
	cleared := decode[models.ComputeModule](t, w)
	if cleared.RuntimeConfig != nil {
		t.Fatalf("expected nil runtime_config after clear, got %+v", cleared.RuntimeConfig)
	}
}

func TestValidateRuntimeConfigDryRun(t *testing.T) {
	r, _ := buildTestRouter(t)
	cfg := minimalRuntime()
	cfg.Env = append(cfg.Env, models.EnvVar{Name: "TOKEN", Value: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})

	w := doJSON(t, r, http.MethodPost, "/api/v1/compute-modules/runtime/validate", cfg)
	if w.Code != http.StatusOK {
		t.Fatalf("dry-run: %d %s", w.Code, w.Body.String())
	}
	got := decode[handler.ValidateRuntimeConfigResponse](t, w)
	if len(got.Redacted) != 1 || got.Redacted[0] != "TOKEN" {
		t.Fatalf("expected TOKEN in redacted_env, got %+v", got.Redacted)
	}
	if !findingPresent(got.Findings, runtimepolicy.CodeEnvSecretRedacted) {
		t.Fatalf("dry-run should expose findings: %+v", got.Findings)
	}
}

func findingPresent(findings []models.CompatibilityFinding, code string) bool {
	for _, f := range findings {
		if f.Code == code {
			return true
		}
	}
	return false
}
