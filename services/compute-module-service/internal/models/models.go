// Package models defines the persistent and wire types for
// Compute Module resources (checklist CM.1).
//
// Resource shape follows the OpenFoundry-owned target listed in
// docs/migration/foundry-compute-modules-1to1-checklist.md
// (compute_module): project/folder-managed container runtime
// metadata with an execution mode and an active/archived lifecycle.
// This package intentionally covers only the metadata surface required
// for CRUD + project placement; image, runtime, scaling, and function
// specs live in their own resources tracked by CM.3 onward.
package models

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// ExecutionMode is the function- or pipeline-mode selection made at
// creation time. The mode is persistent and may not be changed in
// place; switching execution semantics is a duplicate-then-archive
// workflow (see Repository.Duplicate / Archive).
type ExecutionMode string

const (
	ExecutionModeFunction ExecutionMode = "function"
	ExecutionModePipeline ExecutionMode = "pipeline"
)

// IsValid reports whether the mode is one of the canonical values.
func (m ExecutionMode) IsValid() bool {
	return m == ExecutionModeFunction || m == ExecutionModePipeline
}

// LifecycleState distinguishes active modules from archived ones.
// Archived modules are not deleted: they remain visible to the
// restore flow and to audit/history.
type LifecycleState string

const (
	LifecycleActive   LifecycleState = "active"
	LifecycleArchived LifecycleState = "archived"
)

// ComputeModule is the persistent resource record. It deliberately
// excludes container/image/scaling state, which is owned by sibling
// resources (compute_module_version, compute_module_container, …).
type ComputeModule struct {
	ID            uuid.UUID         `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description,omitempty"`
	ProjectID     uuid.UUID         `json:"project_id"`
	FolderID      *uuid.UUID        `json:"folder_id,omitempty"`
	ExecutionMode ExecutionMode     `json:"execution_mode"`
	State         LifecycleState    `json:"state"`
	Labels        map[string]string `json:"labels,omitempty"`

	// PipelineIOConfig is the pipeline-mode-only input/output contract.
	// nil on function-mode modules; setting/clearing it is gated by
	// the execution-mode policy (checklist CM.2). The richer per-IO
	// spec lands with CM.16 (compute_module_pipeline_spec).
	PipelineIOConfig *PipelineIOConfig `json:"pipeline_io_config,omitempty"`

	// ContainerImage is the image reference + compatibility findings
	// attached to this module (checklist CM.3). nil until the caller
	// publishes an image; replaced wholesale on every SetContainerImage.
	ContainerImage *ContainerImage `json:"container_image,omitempty"`

	// RuntimeConfig is the single-container runtime configuration
	// (checklist CM.4). nil until the caller configures the container.
	// Multi-container replicas land with CM.23.
	RuntimeConfig *RuntimeConfig `json:"runtime_config,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	CreatedBy uuid.UUID `json:"created_by"`
	UpdatedBy uuid.UUID `json:"updated_by"`

	ArchivedAt *time.Time `json:"archived_at,omitempty"`
	ArchivedBy *uuid.UUID `json:"archived_by,omitempty"`
}

// PipelineIOResourceKind is the supported input/output resource type
// for pipeline-mode modules. Matches the public Foundry docs'
// stream/dataset/media-set vocabulary.
type PipelineIOResourceKind string

const (
	PipelineResourceStream   PipelineIOResourceKind = "stream"
	PipelineResourceDataset  PipelineIOResourceKind = "dataset"
	PipelineResourceMediaSet PipelineIOResourceKind = "media_set"
)

// IsValid reports whether the kind is one of the canonical values.
func (k PipelineIOResourceKind) IsValid() bool {
	switch k {
	case PipelineResourceStream, PipelineResourceDataset, PipelineResourceMediaSet:
		return true
	}
	return false
}

// PipelineIO is a single input or output binding inside a
// PipelineIOConfig.
type PipelineIO struct {
	Alias        string                 `json:"alias"`
	ResourceKind PipelineIOResourceKind `json:"resource_kind"`
	ResourceID   uuid.UUID              `json:"resource_id"`
	Branch       string                 `json:"branch,omitempty"`
}

// PipelineIOConfig captures the inputs/outputs of a pipeline-mode
// Compute Module. Only the high-level binding shape is enforced here;
// schema, transaction, and checkpoint metadata are layered on top by
// CM.16.
type PipelineIOConfig struct {
	Inputs  []PipelineIO `json:"inputs,omitempty"`
	Outputs []PipelineIO `json:"outputs,omitempty"`
}

// IsArchived is a convenience for state comparisons.
func (m *ComputeModule) IsArchived() bool {
	return m != nil && m.State == LifecycleArchived
}

// CreateParams carries the immutable fields a caller supplies when
// minting a new Compute Module.
type CreateParams struct {
	Name          string
	Description   string
	ProjectID     uuid.UUID
	FolderID      *uuid.UUID
	ExecutionMode ExecutionMode
	Labels        map[string]string
	Actor         uuid.UUID
}

// UpdateMetadataParams is the patch shape for [Repository.UpdateMetadata].
// Pointer/optional semantics: a nil pointer means "leave unchanged",
// an empty string in Name means "reject" (callers must pass a real
// value or omit the field).
type UpdateMetadataParams struct {
	Name        *string
	Description *string
	Labels      *map[string]string
	Actor       uuid.UUID
}

// MoveParams targets a new project/folder pair.
type MoveParams struct {
	ProjectID uuid.UUID
	FolderID  *uuid.UUID
	Actor     uuid.UUID
}

// DuplicateParams copies a module's metadata into a new resource. The
// duplicate keeps the source's execution mode and labels but starts
// fresh in the active lifecycle state. NewName must be unique within
// the target project/folder; ProjectID/FolderID may differ from the
// source.
type DuplicateParams struct {
	NewName   string
	ProjectID *uuid.UUID
	FolderID  *uuid.UUID
	Actor     uuid.UUID
}

const (
	// maxNameRunes mirrors the Foundry-style cap noted in the public
	// Compute Modules getting-started guidance: long enough for
	// meaningful titles, short enough that UI listings stay scannable.
	maxNameRunes        = 128
	maxDescriptionRunes = 4_000
	maxLabelKey         = 64
	maxLabelValue       = 256
	maxLabels           = 32
)

// ValidationError is returned by [CreateParams.Validate] and friends
// for callers that need to map invalid input to a 400 response. The
// HTTP layer surfaces Field+Msg verbatim.
type ValidationError struct {
	Field string
	Msg   string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Msg
}

func invalid(field, msg string) error {
	return &ValidationError{Field: field, Msg: msg}
}

// NormaliseName trims surrounding whitespace and collapses interior
// runs of whitespace to a single space, matching the way the UI shows
// resource titles. Empty input is returned unchanged so the caller
// can flag a missing-name error.
func NormaliseName(in string) string {
	in = strings.TrimSpace(in)
	if in == "" {
		return in
	}
	var b strings.Builder
	b.Grow(len(in))
	lastSpace := false
	for _, r := range in {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if lastSpace {
				continue
			}
			b.WriteRune(' ')
			lastSpace = true
			continue
		}
		b.WriteRune(r)
		lastSpace = false
	}
	return b.String()
}

// Validate enforces the invariants required to create a module.
func (p *CreateParams) Validate() error {
	if p == nil {
		return invalid("body", "missing payload")
	}
	name := NormaliseName(p.Name)
	if name == "" {
		return invalid("name", "must not be empty")
	}
	if utf8.RuneCountInString(name) > maxNameRunes {
		return invalid("name", "exceeds 128 characters")
	}
	p.Name = name

	if utf8.RuneCountInString(p.Description) > maxDescriptionRunes {
		return invalid("description", "exceeds 4000 characters")
	}
	if p.ProjectID == uuid.Nil {
		return invalid("project_id", "must be a non-zero uuid")
	}
	if p.FolderID != nil && *p.FolderID == uuid.Nil {
		return invalid("folder_id", "must be a non-zero uuid when set")
	}
	if !p.ExecutionMode.IsValid() {
		return invalid("execution_mode", `must be "function" or "pipeline"`)
	}
	if err := validateLabels(p.Labels); err != nil {
		return err
	}
	if p.Actor == uuid.Nil {
		return invalid("actor", "missing caller identity")
	}
	return nil
}

// Validate enforces invariants for a metadata patch. At least one
// field must be set; supplied fields are bounded just like Create.
func (p *UpdateMetadataParams) Validate() error {
	if p == nil {
		return invalid("body", "missing payload")
	}
	if p.Name == nil && p.Description == nil && p.Labels == nil {
		return invalid("body", "at least one of name, description, labels must be set")
	}
	if p.Name != nil {
		name := NormaliseName(*p.Name)
		if name == "" {
			return invalid("name", "must not be empty")
		}
		if utf8.RuneCountInString(name) > maxNameRunes {
			return invalid("name", "exceeds 128 characters")
		}
		*p.Name = name
	}
	if p.Description != nil && utf8.RuneCountInString(*p.Description) > maxDescriptionRunes {
		return invalid("description", "exceeds 4000 characters")
	}
	if p.Labels != nil {
		if err := validateLabels(*p.Labels); err != nil {
			return err
		}
	}
	if p.Actor == uuid.Nil {
		return invalid("actor", "missing caller identity")
	}
	return nil
}

// Validate enforces invariants for a move request.
func (p *MoveParams) Validate() error {
	if p == nil {
		return invalid("body", "missing payload")
	}
	if p.ProjectID == uuid.Nil {
		return invalid("project_id", "must be a non-zero uuid")
	}
	if p.FolderID != nil && *p.FolderID == uuid.Nil {
		return invalid("folder_id", "must be a non-zero uuid when set")
	}
	if p.Actor == uuid.Nil {
		return invalid("actor", "missing caller identity")
	}
	return nil
}

// Validate enforces invariants for a duplicate request.
func (p *DuplicateParams) Validate() error {
	if p == nil {
		return invalid("body", "missing payload")
	}
	name := NormaliseName(p.NewName)
	if name == "" {
		return invalid("new_name", "must not be empty")
	}
	if utf8.RuneCountInString(name) > maxNameRunes {
		return invalid("new_name", "exceeds 128 characters")
	}
	p.NewName = name
	if p.ProjectID != nil && *p.ProjectID == uuid.Nil {
		return invalid("project_id", "must be a non-zero uuid when set")
	}
	if p.FolderID != nil && *p.FolderID == uuid.Nil {
		return invalid("folder_id", "must be a non-zero uuid when set")
	}
	if p.Actor == uuid.Nil {
		return invalid("actor", "missing caller identity")
	}
	return nil
}

const (
	maxPipelineIOBindings = 64
	maxAliasRunes         = 64
	maxBranchRunes        = 128
)

// Validate checks structural invariants on a pipeline-I/O config:
// non-empty unique aliases per direction, supported resource kinds,
// non-zero resource IDs, bounded lengths.
func (c *PipelineIOConfig) Validate() error {
	if c == nil {
		return invalid("pipeline_io_config", "missing payload")
	}
	if len(c.Inputs) == 0 && len(c.Outputs) == 0 {
		return invalid("pipeline_io_config", "at least one input or output is required")
	}
	if err := validateIOList("inputs", c.Inputs); err != nil {
		return err
	}
	if err := validateIOList("outputs", c.Outputs); err != nil {
		return err
	}
	return nil
}

func validateIOList(direction string, list []PipelineIO) error {
	if len(list) > maxPipelineIOBindings {
		return invalid(direction, "exceeds 64 bindings")
	}
	seen := make(map[string]struct{}, len(list))
	for i := range list {
		io := list[i]
		alias := strings.TrimSpace(io.Alias)
		if alias == "" {
			return invalid(direction, "alias must not be empty")
		}
		if utf8.RuneCountInString(alias) > maxAliasRunes {
			return invalid(direction, "alias exceeds 64 characters")
		}
		key := strings.ToLower(alias)
		if _, dup := seen[key]; dup {
			return invalid(direction, "duplicate alias: "+alias)
		}
		seen[key] = struct{}{}
		if !io.ResourceKind.IsValid() {
			return invalid(direction, `resource_kind must be "stream", "dataset", or "media_set"`)
		}
		if io.ResourceID == uuid.Nil {
			return invalid(direction, "resource_id must be a non-zero uuid")
		}
		if utf8.RuneCountInString(io.Branch) > maxBranchRunes {
			return invalid(direction, "branch exceeds 128 characters")
		}
		list[i].Alias = alias
	}
	return nil
}

func validateLabels(labels map[string]string) error {
	if len(labels) > maxLabels {
		return invalid("labels", "exceeds 32 entries")
	}
	for k, v := range labels {
		if strings.TrimSpace(k) == "" {
			return invalid("labels", "key must not be empty")
		}
		if utf8.RuneCountInString(k) > maxLabelKey {
			return invalid("labels", "key exceeds 64 characters")
		}
		if utf8.RuneCountInString(v) > maxLabelValue {
			return invalid("labels", "value exceeds 256 characters")
		}
	}
	return nil
}
