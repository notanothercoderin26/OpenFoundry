// Package runtime applies the OpenFoundry Compute Module runtime
// configuration policy (checklist CM.4).
//
// The policy is two-fold:
//
//  1. Surface mode/structural advisories as compatibility findings
//     (e.g. missing resource profile, no health probes, no logs).
//  2. Detect secret-like environment variables, redact their literal
//     values in place, and steer the caller toward SecretBinding
//     references — the explicit ask in CM.4.
//
// The Apply function mutates the supplied config in place and returns
// the finding list. Unlike containerimage.Apply, this policy never
// rejects: secret-like values are redacted, which is itself the
// remediation. Callers may still ladder up to a 422 by inspecting the
// returned findings (the dry-run endpoint surfaces them so a UI can
// nudge the builder before save).
package runtime

import (
	"fmt"
	"regexp"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// Finding codes — stable across releases.
const (
	CodeEnvSecretRedacted      = "env-secret-redacted"
	CodeEnvSecretValueRedacted = "env-secret-value-redacted"
	CodeUseSecretBinding       = "use-secret-binding"
	CodeMissingResources       = "missing-resources"
	CodeMissingHealth          = "missing-health"
	CodeStdoutDisabled         = "stdout-disabled"
	CodeUnreferencedBinding    = "unreferenced-secret-binding"
)

// RedactedPlaceholder is what we write into EnvVar.Value when a literal
// value was rejected by the secret-name or secret-shape heuristics.
const RedactedPlaceholder = "***"

// secretNameRe matches env var names commonly used to ship secret
// material. Case-insensitive substring match: any of these tokens
// anywhere in the name triggers redaction.
var secretNameRe = regexp.MustCompile(`(?i)(password|passwd|pwd|secret|token|api_?key|private_?key|credential|access_?key|client_?secret|auth(?:_|$))`)

// secretValueRes detects common secret shapes in literal values. Add
// new patterns additively; never weaken or remove an existing pattern
// without an ADR.
var secretValueRes = []*regexp.Regexp{
	// JWTs (three base64-url segments separated by dots).
	regexp.MustCompile(`\beyJ[A-Za-z0-9_\-]{4,}\.eyJ[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]+\b`),
	// AWS access key IDs.
	regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`),
	// GitHub personal access tokens (classic + fine-grained).
	regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{36,}\b`),
	// Slack tokens.
	regexp.MustCompile(`\bxox[abopsr]-[A-Za-z0-9-]{10,}\b`),
}

// Apply runs the policy on `cfg` in place: it computes findings and
// redacts any secret-like env values. The returned finding slice is
// the same one stored in cfg.Findings.
func Apply(cfg *models.RuntimeConfig) []models.CompatibilityFinding {
	if cfg == nil {
		return nil
	}
	findings := make([]models.CompatibilityFinding, 0, 4)

	declaredBindings := make(map[string]bool, len(cfg.SecretBindings))
	for _, b := range cfg.SecretBindings {
		declaredBindings[b.Name] = false
	}

	for i := range cfg.Env {
		ev := &cfg.Env[i]
		if ev.ValueFromSecret != nil {
			if _, ok := declaredBindings[ev.ValueFromSecret.BindingName]; ok {
				declaredBindings[ev.ValueFromSecret.BindingName] = true
			}
			continue
		}
		nameLooksSecret := secretNameRe.MatchString(ev.Name)
		valueLooksSecret := matchesAny(ev.Value, secretValueRes)
		if nameLooksSecret && ev.Value != "" {
			findings = append(findings, models.CompatibilityFinding{
				Code:     CodeEnvSecretRedacted,
				Severity: models.FindingSeverityWarn,
				Message:  fmt.Sprintf("env %q looks like a secret; literal value was redacted — use value_from_secret with a SecretBinding instead", ev.Name),
				Field:    "env." + ev.Name,
			})
			redact(ev)
			continue
		}
		if valueLooksSecret {
			findings = append(findings, models.CompatibilityFinding{
				Code:     CodeEnvSecretValueRedacted,
				Severity: models.FindingSeverityWarn,
				Message:  fmt.Sprintf("env %q value matches a known secret pattern; value was redacted — route through a SecretBinding", ev.Name),
				Field:    "env." + ev.Name,
			})
			redact(ev)
		}
	}

	for name, used := range declaredBindings {
		if !used {
			findings = append(findings, models.CompatibilityFinding{
				Code:     CodeUnreferencedBinding,
				Severity: models.FindingSeverityInfo,
				Message:  fmt.Sprintf("secret_binding %q is declared but not referenced by any env var", name),
				Field:    "secret_bindings." + name,
			})
		}
	}

	if cfg.Resources == nil ||
		(cfg.Resources.CPUMillicores == 0 && cfg.Resources.MemoryMiB == 0) {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeMissingResources,
			Severity: models.FindingSeverityWarn,
			Message:  "resource profile is missing CPU/memory — scheduler will fall back to platform defaults",
			Field:    "resources",
		})
	}
	if cfg.Health == nil ||
		(cfg.Health.ReadinessPath == "" && cfg.Health.LivenessPath == "" && cfg.Health.HeartbeatIntervalSec == 0) {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeMissingHealth,
			Severity: models.FindingSeverityInfo,
			Message:  "no health probes configured; the runtime will rely on container exit codes only",
			Field:    "health",
		})
	}
	if cfg.Logging != nil && !cfg.Logging.StdoutEnabled && !cfg.Logging.StderrEnabled && len(cfg.Logging.FilePaths) == 0 {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeStdoutDisabled,
			Severity: models.FindingSeverityWarn,
			Message:  "all log sources are disabled; logs panel and audit will be empty",
			Field:    "logging",
		})
	}

	cfg.Findings = findings
	return findings
}

// Evaluate runs the policy on a defensive copy of cfg and returns the
// (would-be) findings without mutating the caller's payload. Used by
// the dry-run endpoint.
func Evaluate(cfg models.RuntimeConfig) []models.CompatibilityFinding {
	cp := deepCopyForEvaluate(cfg)
	return Apply(&cp)
}

// LooksLikeSecret is exposed for tests and for adjacent services that
// want to apply the same heuristic to ad-hoc strings.
func LooksLikeSecret(name, value string) bool {
	if secretNameRe.MatchString(name) && value != "" {
		return true
	}
	return matchesAny(value, secretValueRes)
}

func matchesAny(value string, patterns []*regexp.Regexp) bool {
	if value == "" {
		return false
	}
	for _, p := range patterns {
		if p.MatchString(value) {
			return true
		}
	}
	return false
}

func redact(ev *models.EnvVar) {
	ev.Value = RedactedPlaceholder
	ev.Redacted = true
}

func deepCopyForEvaluate(cfg models.RuntimeConfig) models.RuntimeConfig {
	if len(cfg.Env) > 0 {
		cp := make([]models.EnvVar, len(cfg.Env))
		copy(cp, cfg.Env)
		for i := range cp {
			if cfg.Env[i].ValueFromSecret != nil {
				v := *cfg.Env[i].ValueFromSecret
				cp[i].ValueFromSecret = &v
			}
		}
		cfg.Env = cp
	}
	if len(cfg.SecretBindings) > 0 {
		cfg.SecretBindings = append([]models.SecretBinding(nil), cfg.SecretBindings...)
	}
	if cfg.Resources != nil {
		r := *cfg.Resources
		cfg.Resources = &r
	}
	if cfg.Logging != nil {
		l := *cfg.Logging
		if len(l.FilePaths) > 0 {
			l.FilePaths = append([]string(nil), l.FilePaths...)
		}
		cfg.Logging = &l
	}
	if cfg.Health != nil {
		h := *cfg.Health
		cfg.Health = &h
	}
	return cfg
}
