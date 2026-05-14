package models

import (
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// FindingSeverity classifies a compatibility finding. "error" blocks
// the image from being attached to a module; "warn" and "info" are
// persisted as advisories alongside the image record.
type FindingSeverity string

const (
	FindingSeverityError FindingSeverity = "error"
	FindingSeverityWarn  FindingSeverity = "warn"
	FindingSeverityInfo  FindingSeverity = "info"
)

// IsValid reports whether s is one of the canonical severities.
func (s FindingSeverity) IsValid() bool {
	switch s {
	case FindingSeverityError, FindingSeverityWarn, FindingSeverityInfo:
		return true
	}
	return false
}

// CompatibilityFinding is a single rule outcome produced by the
// container-image policy package. Code is a stable, machine-readable
// identifier (e.g. "non-root-required"); Field is optional and points
// at the offending top-level field on the image payload when
// applicable.
type CompatibilityFinding struct {
	Code     string          `json:"code"`
	Severity FindingSeverity `json:"severity"`
	Message  string          `json:"message"`
	Field    string          `json:"field,omitempty"`
}

// ImageProvenance captures the trust/origin metadata callers supply
// alongside the image reference. Every field is optional but at least
// one of BuildRef or BuildURL is recommended so audit can link a
// running module to its build.
type ImageProvenance struct {
	BuilderID   string `json:"builder_id,omitempty"`
	BuildRef    string `json:"build_ref,omitempty"`
	BuildURL    string `json:"build_url,omitempty"`
	SignatureID string `json:"signature_id,omitempty"`
}

// ContainerImage is the image reference attached to a Compute Module
// (checklist CM.3). The richer per-container runtime configuration
// (command/args, env, secrets, resources) is layered on top by CM.4.
type ContainerImage struct {
	Registry     string                 `json:"registry"`
	Repository   string                 `json:"repository"`
	Tag          string                 `json:"tag,omitempty"`
	Digest       string                 `json:"digest,omitempty"`
	Platform     string                 `json:"platform"`
	User         string                 `json:"user"`
	ExposedPorts []int                  `json:"exposed_ports,omitempty"`
	Labels       map[string]string      `json:"labels,omitempty"`
	Provenance   *ImageProvenance       `json:"provenance,omitempty"`
	Findings     []CompatibilityFinding `json:"findings,omitempty"`
}

// SetContainerImageParams is the payload accepted by
// Repository.SetContainerImage. The caller supplies an Image and the
// repo stamps timestamps/actor on the parent module.
type SetContainerImageParams struct {
	Image ContainerImage
	Actor uuid.UUID
}

// Sanitise trims, lower-cases, and normalises the structural fields
// of a container image reference so callers can be liberal about
// whitespace and casing. It is called by the validator before any
// findings are produced.
func (img *ContainerImage) Sanitise() {
	if img == nil {
		return
	}
	img.Registry = strings.ToLower(strings.TrimSpace(img.Registry))
	img.Repository = strings.ToLower(strings.TrimSpace(img.Repository))
	img.Tag = strings.TrimSpace(img.Tag)
	img.Digest = strings.TrimSpace(img.Digest)
	img.Platform = strings.ToLower(strings.TrimSpace(img.Platform))
	img.User = strings.TrimSpace(img.User)

	if len(img.ExposedPorts) == 0 {
		img.ExposedPorts = nil
	}
	// Drop duplicate ports while preserving caller order.
	if len(img.ExposedPorts) > 1 {
		seen := make(map[int]struct{}, len(img.ExposedPorts))
		out := img.ExposedPorts[:0]
		for _, p := range img.ExposedPorts {
			if _, dup := seen[p]; dup {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
		img.ExposedPorts = out
	}
}

// ValidateStructure runs cheap structural checks (presence, length,
// type-shape) before the policy engine runs its semantic rules. It
// returns a ValidationError suitable for a 400 response — semantic
// findings (non-root, platform, tag/digest, ports) are emitted as
// CompatibilityFinding by the containerimage policy package.
func (img *ContainerImage) ValidateStructure() error {
	if img == nil {
		return invalid("container_image", "missing payload")
	}
	if img.Registry == "" {
		return invalid("registry", "must not be empty")
	}
	if utf8.RuneCountInString(img.Registry) > 253 {
		return invalid("registry", "exceeds 253 characters")
	}
	if img.Repository == "" {
		return invalid("repository", "must not be empty")
	}
	if utf8.RuneCountInString(img.Repository) > 255 {
		return invalid("repository", "exceeds 255 characters")
	}
	if img.Tag == "" && img.Digest == "" {
		return invalid("tag", "either tag or digest must be set")
	}
	if utf8.RuneCountInString(img.Tag) > 128 {
		return invalid("tag", "exceeds 128 characters")
	}
	if img.Platform == "" {
		return invalid("platform", "must not be empty")
	}
	if img.User == "" {
		return invalid("user", "must not be empty")
	}
	for _, p := range img.ExposedPorts {
		if p < 1 || p > 65535 {
			return invalid("exposed_ports", "must be in 1..65535")
		}
	}
	return nil
}
