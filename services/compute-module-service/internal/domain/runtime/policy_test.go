package runtime

import (
	"testing"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

func TestRedactsSecretByName(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role: models.ContainerRoleEntrypoint,
		Env: []models.EnvVar{
			{Name: "API_KEY", Value: "abcd1234abcd1234abcd1234abcd1234"},
			{Name: "PORT", Value: "8080"},
		},
	}
	Apply(cfg)
	if cfg.Env[0].Value != RedactedPlaceholder || !cfg.Env[0].Redacted {
		t.Fatalf("API_KEY should be redacted, got %+v", cfg.Env[0])
	}
	if cfg.Env[1].Value != "8080" {
		t.Fatalf("PORT should be left alone, got %+v", cfg.Env[1])
	}
	if !hasFinding(cfg.Findings, CodeEnvSecretRedacted) {
		t.Fatalf("expected %s finding, got %+v", CodeEnvSecretRedacted, cfg.Findings)
	}
}

func TestRedactsSecretByValueShape(t *testing.T) {
	jwt := "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
	cfg := &models.RuntimeConfig{
		Role: models.ContainerRoleEntrypoint,
		Env:  []models.EnvVar{{Name: "ARBITRARY_NAME", Value: jwt}},
	}
	Apply(cfg)
	if !cfg.Env[0].Redacted {
		t.Fatalf("JWT-shaped value should be redacted: %+v", cfg.Env[0])
	}
	if !hasFinding(cfg.Findings, CodeEnvSecretValueRedacted) {
		t.Fatalf("expected %s finding, got %+v", CodeEnvSecretValueRedacted, cfg.Findings)
	}
}

func TestSecretBindingPathDoesNotEmitRedactionFinding(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role: models.ContainerRoleEntrypoint,
		Env: []models.EnvVar{{
			Name: "DB_PASSWORD",
			ValueFromSecret: &models.SecretValueSource{
				BindingName: "db",
				Key:         "password",
			},
		}},
		SecretBindings: []models.SecretBinding{{Name: "db", SecretRef: "secret-id-1"}},
	}
	Apply(cfg)
	if hasFinding(cfg.Findings, CodeEnvSecretRedacted) {
		t.Fatalf("secret-binding path should not trigger redaction finding: %+v", cfg.Findings)
	}
	if hasFinding(cfg.Findings, CodeUnreferencedBinding) {
		t.Fatal("binding should be marked referenced")
	}
}

func TestEmptyValueForSecretNameIsNotRedacted(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role: models.ContainerRoleEntrypoint,
		Env:  []models.EnvVar{{Name: "API_KEY", Value: ""}},
	}
	Apply(cfg)
	if cfg.Env[0].Redacted {
		t.Fatal("empty value should not be redacted")
	}
	if hasFinding(cfg.Findings, CodeEnvSecretRedacted) {
		t.Fatal("no value → no redaction finding")
	}
}

func TestUnreferencedBindingIsInfo(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role:           models.ContainerRoleEntrypoint,
		SecretBindings: []models.SecretBinding{{Name: "unused", SecretRef: "id"}},
	}
	Apply(cfg)
	if !hasFinding(cfg.Findings, CodeUnreferencedBinding) {
		t.Fatalf("expected %s finding, got %+v", CodeUnreferencedBinding, cfg.Findings)
	}
}

func TestMissingResourcesWarn(t *testing.T) {
	cfg := &models.RuntimeConfig{Role: models.ContainerRoleEntrypoint}
	Apply(cfg)
	if !hasFinding(cfg.Findings, CodeMissingResources) {
		t.Fatalf("expected %s finding", CodeMissingResources)
	}
}

func TestMissingHealthInfoFinding(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role:      models.ContainerRoleEntrypoint,
		Resources: &models.ResourceProfile{CPUMillicores: 500, MemoryMiB: 512},
	}
	Apply(cfg)
	if !hasFinding(cfg.Findings, CodeMissingHealth) {
		t.Fatalf("expected %s finding", CodeMissingHealth)
	}
}

func TestStdoutDisabledWarn(t *testing.T) {
	cfg := &models.RuntimeConfig{
		Role:      models.ContainerRoleEntrypoint,
		Resources: &models.ResourceProfile{CPUMillicores: 500, MemoryMiB: 512},
		Logging:   &models.LoggingConfig{StdoutEnabled: false, StderrEnabled: false},
	}
	Apply(cfg)
	if !hasFinding(cfg.Findings, CodeStdoutDisabled) {
		t.Fatalf("expected %s finding", CodeStdoutDisabled)
	}
}

func TestEvaluateLeavesInputUnchanged(t *testing.T) {
	src := models.RuntimeConfig{
		Role: models.ContainerRoleEntrypoint,
		Env:  []models.EnvVar{{Name: "API_KEY", Value: "literal-value"}},
	}
	_ = Evaluate(src)
	if src.Env[0].Value != "literal-value" || src.Env[0].Redacted {
		t.Fatal("Evaluate must not mutate caller's payload")
	}
}

func TestLooksLikeSecret(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{"PORT", "8080", false},
		{"API_KEY", "anything", true},
		{"unimportant", "AKIA1234567890ABCDEF", true},
		{"ANYWHERE", "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true},
		{"empty", "", false},
	}
	for _, tc := range cases {
		got := LooksLikeSecret(tc.name, tc.value)
		if got != tc.want {
			t.Fatalf("LooksLikeSecret(%q, %q) = %v, want %v", tc.name, tc.value, got, tc.want)
		}
	}
}

func hasFinding(findings []models.CompatibilityFinding, code string) bool {
	for _, f := range findings {
		if f.Code == code {
			return true
		}
	}
	return false
}
