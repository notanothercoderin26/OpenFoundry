// Package containerimage holds the compatibility policy that
// OpenFoundry applies to a Compute Module image reference
// (checklist CM.3).
//
// The policy maps the public Foundry "Containers" guidance onto a set
// of stable, machine-readable rules. Each rule emits a finding that
// the caller can persist alongside the image; errors block the image
// from being attached, warnings are advisory.
package containerimage

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// ErrFindingsRejected is returned by Apply when at least one
// compatibility finding has severity "error". HTTP handlers map this
// to 422 Unprocessable Entity and surface the finding list to the
// caller so they can remediate.
var ErrFindingsRejected = errors.New("compute-module: container image rejected by compatibility policy")

// Finding codes — stable across releases. Add new codes additively;
// never reuse a code for a different rule.
const (
	CodeNonRootRequired       = "non-root-required"
	CodeNumericUser           = "numeric-user"
	CodeUnsupportedPlatform   = "unsupported-platform"
	CodeMutableTag            = "mutable-tag"
	CodeMissingDigest         = "missing-digest"
	CodeMalformedDigest       = "malformed-digest"
	CodePrivilegedPort        = "privileged-port"
	CodeMissingProvenance     = "missing-provenance"
	CodeOversizedExposedPorts = "oversized-exposed-ports"
)

// SupportedPlatform is the only image platform the OpenFoundry compute
// runtime promises to schedule. Matches the public Containers docs.
const SupportedPlatform = "linux/amd64"

// MaxExposedPorts caps the listed entrypoint ports per image. Mirrors
// the "small number of ports" guidance in the public docs without
// committing to a specific Foundry-internal number.
const MaxExposedPorts = 16

// digestRe matches the OCI-style "<algo>:<hex>" form. We accept any
// algorithm but require non-empty hex; sha256 / sha512 are the
// common cases.
var digestRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]+:[A-Fa-f0-9]{32,}$`)

// Apply runs the policy on `img` in place: it sanitises the payload,
// computes findings, and writes the resulting list back to
// img.Findings. The boolean return reports whether the image cleared
// the policy (no error-severity findings). The error is non-nil iff
// the image was rejected; callers can distinguish "stored with
// advisories" from "rejected" by checking err / errors.Is.
func Apply(img *models.ContainerImage) (cleared bool, err error) {
	img.Sanitise()
	findings := evaluate(img)
	img.Findings = findings
	if hasErrorFinding(findings) {
		return false, fmt.Errorf("%w: %d error finding(s)", ErrFindingsRejected, countError(findings))
	}
	return true, nil
}

// Evaluate runs the policy without mutating `img`. Useful for the
// dry-run validation endpoint (POST /…/validate).
func Evaluate(img models.ContainerImage) []models.CompatibilityFinding {
	img.Sanitise()
	return evaluate(&img)
}

func evaluate(img *models.ContainerImage) []models.CompatibilityFinding {
	findings := make([]models.CompatibilityFinding, 0, 4)

	// Non-root numeric user.
	uid, parseErr := strconv.Atoi(img.User)
	switch {
	case parseErr != nil:
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeNumericUser,
			Severity: models.FindingSeverityError,
			Message:  "container must declare a numeric uid (e.g. \"65532\"), not a username",
			Field:    "user",
		})
	case uid == 0:
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeNonRootRequired,
			Severity: models.FindingSeverityError,
			Message:  "container must run as a non-root user (uid != 0)",
			Field:    "user",
		})
	case uid < 0:
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeNumericUser,
			Severity: models.FindingSeverityError,
			Message:  "numeric uid must be non-negative",
			Field:    "user",
		})
	}

	// Platform.
	if img.Platform != SupportedPlatform {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeUnsupportedPlatform,
			Severity: models.FindingSeverityError,
			Message:  "platform must be " + SupportedPlatform,
			Field:    "platform",
		})
	}

	// Tag + digest pinning.
	if img.Digest == "" {
		if strings.EqualFold(img.Tag, "latest") {
			findings = append(findings, models.CompatibilityFinding{
				Code:     CodeMutableTag,
				Severity: models.FindingSeverityError,
				Message:  `tag "latest" is not allowed without a digest; pin a specific tag or supply a digest`,
				Field:    "tag",
			})
		}
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeMissingDigest,
			Severity: models.FindingSeverityWarn,
			Message:  "digest pinning is recommended for reproducible deployments",
			Field:    "digest",
		})
	} else if !digestRe.MatchString(img.Digest) {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeMalformedDigest,
			Severity: models.FindingSeverityError,
			Message:  `digest must match "<algo>:<hex>" (e.g. sha256:abc…)`,
			Field:    "digest",
		})
	}

	// Privileged ports.
	for _, p := range img.ExposedPorts {
		if p < 1024 {
			findings = append(findings, models.CompatibilityFinding{
				Code:     CodePrivilegedPort,
				Severity: models.FindingSeverityError,
				Message:  fmt.Sprintf("exposed port %d is privileged; pick a port >= 1024", p),
				Field:    "exposed_ports",
			})
		}
	}
	if len(img.ExposedPorts) > MaxExposedPorts {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeOversizedExposedPorts,
			Severity: models.FindingSeverityWarn,
			Message:  fmt.Sprintf("more than %d exposed ports; consider trimming", MaxExposedPorts),
			Field:    "exposed_ports",
		})
	}

	// Provenance advisory.
	if img.Provenance == nil || (img.Provenance.BuildRef == "" && img.Provenance.BuildURL == "") {
		findings = append(findings, models.CompatibilityFinding{
			Code:     CodeMissingProvenance,
			Severity: models.FindingSeverityInfo,
			Message:  "build provenance is missing; supply build_ref or build_url so audits can link to the source build",
			Field:    "provenance",
		})
	}

	return findings
}

func hasErrorFinding(findings []models.CompatibilityFinding) bool {
	for _, f := range findings {
		if f.Severity == models.FindingSeverityError {
			return true
		}
	}
	return false
}

func countError(findings []models.CompatibilityFinding) int {
	n := 0
	for _, f := range findings {
		if f.Severity == models.FindingSeverityError {
			n++
		}
	}
	return n
}
