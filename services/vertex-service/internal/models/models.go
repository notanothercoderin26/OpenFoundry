// Package models defines the wire-format types served by
// vertex-service. The HTTP layer marshals these directly to JSON;
// the repo layer hydrates them from Postgres.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ListResponse is the canonical envelope for unpaginated lists.
type ListResponse[T any] struct {
	Items []T `json:"items"`
}

// Page is the canonical envelope for paginated reads.
type Page[T any] struct {
	Data       []T    `json:"data"`
	Total      int    `json:"total"`
	Page       int    `json:"page"`
	PerPage    int    `json:"per_page"`
	NextCursor string `json:"next_cursor,omitempty"`
}

// ----- Graph -----

type Graph struct {
	ID                     uuid.UUID       `json:"id"`
	RID                    string          `json:"rid"`
	Title                  string          `json:"title"`
	Description            string          `json:"description"`
	SeedObjectRefs         []string        `json:"seed_object_refs"`
	BranchContext          string          `json:"branch_context"`
	ModelRID               string          `json:"model_rid"`
	LayoutStateJSON        json.RawMessage `json:"layout_state_json"`
	LayerConfigurationJSON json.RawMessage `json:"layer_configuration_json"`
	TimelineStateJSON      json.RawMessage `json:"timeline_state_json"`
	ProjectID              *uuid.UUID      `json:"project_id,omitempty"`
	Organizations          []string        `json:"organizations"`
	Markings               []string        `json:"markings"`
	OwnerID                uuid.UUID       `json:"owner_id"`
	VersioningEnabled      bool            `json:"versioning_enabled"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

// Redacted returns the Discoverer-view projection — name, owner,
// timestamps. No layout, no layers, no seed object refs.
func (g *Graph) Redacted() *DiscovererView {
	if g == nil {
		return nil
	}
	return &DiscovererView{
		ID:          g.ID,
		RID:         g.RID,
		Title:       g.Title,
		Description: g.Description,
		OwnerID:     g.OwnerID,
		CreatedAt:   g.CreatedAt,
		UpdatedAt:   g.UpdatedAt,
	}
}

type CreateGraphRequest struct {
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	SeedObjectRefs []string   `json:"seed_object_refs"`
	BranchContext  string     `json:"branch_context"`
	ModelRID       string     `json:"model_rid"`
	ProjectID      *uuid.UUID `json:"project_id,omitempty"`
	Organizations  []string   `json:"organizations"`
	Markings       []string   `json:"markings"`
}

type UpdateGraphRequest struct {
	Title                  *string          `json:"title,omitempty"`
	Description            *string          `json:"description,omitempty"`
	SeedObjectRefs         *[]string        `json:"seed_object_refs,omitempty"`
	BranchContext          *string          `json:"branch_context,omitempty"`
	ModelRID               *string          `json:"model_rid,omitempty"`
	LayoutStateJSON        *json.RawMessage `json:"layout_state_json,omitempty"`
	LayerConfigurationJSON *json.RawMessage `json:"layer_configuration_json,omitempty"`
	TimelineStateJSON      *json.RawMessage `json:"timeline_state_json,omitempty"`
	Organizations          *[]string        `json:"organizations,omitempty"`
	Markings               *[]string        `json:"markings,omitempty"`
}

type ForkGraphRequest struct {
	NewTitle string `json:"new_title"`
}

type GraphVersion struct {
	ID           uuid.UUID       `json:"id"`
	GraphID      uuid.UUID       `json:"graph_id"`
	Version      int             `json:"version"`
	Changelog    string          `json:"changelog"`
	SnapshotJSON json.RawMessage `json:"snapshot_json"`
	AuthorID     uuid.UUID       `json:"author_id"`
	CreatedAt    time.Time       `json:"created_at"`
}

type CreateGraphVersionRequest struct {
	Changelog string `json:"changelog"`
}

// ----- Annotation -----

type Annotation struct {
	ID           uuid.UUID       `json:"id"`
	GraphID      uuid.UUID       `json:"graph_id"`
	Kind         string          `json:"kind"`
	Text         string          `json:"text"`
	GeometryJSON json.RawMessage `json:"geometry_json"`
	AuthorID     uuid.UUID       `json:"author_id"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type CreateAnnotationRequest struct {
	Kind         string          `json:"kind"`
	Text         string          `json:"text"`
	GeometryJSON json.RawMessage `json:"geometry_json"`
}

type UpdateAnnotationRequest struct {
	Text         *string          `json:"text,omitempty"`
	GeometryJSON *json.RawMessage `json:"geometry_json,omitempty"`
}

// ----- Search Around -----

type SearchAround struct {
	ID                   uuid.UUID               `json:"id"`
	RID                  string                  `json:"rid"`
	Title                string                  `json:"title"`
	Description          string                  `json:"description"`
	StartingObjectTypeID uuid.UUID               `json:"starting_object_type_id"`
	Steps                []SearchAroundStep      `json:"steps"`
	Parameters           []SearchAroundParameter `json:"parameters"`
	ProjectID            *uuid.UUID              `json:"project_id,omitempty"`
	OwnerID              uuid.UUID               `json:"owner_id"`
	CreatedAt            time.Time               `json:"created_at"`
	UpdatedAt            time.Time               `json:"updated_at"`
}

type SearchAroundStep struct {
	Ordinal    int                  `json:"ordinal"`
	RelationID uuid.UUID            `json:"relation_id"`
	Direction  string               `json:"direction"` // "outgoing" | "incoming"
	Filters    []SearchAroundFilter `json:"filters"`
}

type SearchAroundFilter struct {
	Property     string          `json:"property"`
	Op           string          `json:"op"` // eq | neq | in | lt | lte | gt | gte | range | contains
	LiteralJSON  json.RawMessage `json:"literal_json,omitempty"`
	ParameterRef string          `json:"parameter_ref,omitempty"`
}

type SearchAroundParameter struct {
	Name             string          `json:"name"`
	Type             string          `json:"type"` // string | number | boolean | date | timestamp
	Description      string          `json:"description"`
	DefaultValueJSON json.RawMessage `json:"default_value_json,omitempty"`
	Required         bool            `json:"required"`
}

type CreateSearchAroundRequest struct {
	Title                string                  `json:"title"`
	Description          string                  `json:"description"`
	StartingObjectTypeID uuid.UUID               `json:"starting_object_type_id"`
	Steps                []SearchAroundStep      `json:"steps"`
	Parameters           []SearchAroundParameter `json:"parameters"`
	ProjectID            *uuid.UUID              `json:"project_id,omitempty"`
}

type UpdateSearchAroundRequest struct {
	Title       *string                  `json:"title,omitempty"`
	Description *string                  `json:"description,omitempty"`
	Steps       *[]SearchAroundStep      `json:"steps,omitempty"`
	Parameters  *[]SearchAroundParameter `json:"parameters,omitempty"`
}

// ----- Scenario -----

type Scenario struct {
	ID            uuid.UUID    `json:"id"`
	GraphID       uuid.UUID    `json:"graph_id"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Edits         []StagedEdit `json:"edits"`
	BranchContext string       `json:"branch_context"`
	AuthorID      uuid.UUID    `json:"author_id"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

type StagedEdit struct {
	Kind          string          `json:"kind"` // property_change | link_add | link_remove | action_dryrun
	TargetRef     string          `json:"target_ref"`
	PropertyName  string          `json:"property_name,omitempty"`
	OldValueJSON  json.RawMessage `json:"old_value_json,omitempty"`
	NewValueJSON  json.RawMessage `json:"new_value_json,omitempty"`
	ActionID      *uuid.UUID      `json:"action_id,omitempty"`
}

type ScenarioDiff struct {
	ScenarioID         uuid.UUID       `json:"scenario_id"`
	ChangedNodeCount   int             `json:"changed_node_count"`
	ChangedEdgeCount   int             `json:"changed_edge_count"`
	AddedCount         int             `json:"added_count"`
	RemovedCount       int             `json:"removed_count"`
	MetricsJSON        json.RawMessage `json:"metrics_json"`
	ImpactedObjectRefs []string        `json:"impacted_object_refs"`
}

type CreateScenarioRequest struct {
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Edits         []StagedEdit `json:"edits"`
	BranchContext string       `json:"branch_context"`
}

type UpdateScenarioRequest struct {
	Name        *string       `json:"name,omitempty"`
	Description *string       `json:"description,omitempty"`
	Edits       *[]StagedEdit `json:"edits,omitempty"`
}

type PromoteScenarioRequest struct {
	TargetBranch bool `json:"target_branch"`
}

type PromoteScenarioResponse struct {
	ActionInvocationIDs []uuid.UUID `json:"action_invocation_ids"`
}

// ----- Derived properties -----

type DerivedPropertyBinding struct {
	ID            uuid.UUID `json:"id"`
	ObjectTypeID  uuid.UUID `json:"object_type_id"`
	PropertyName  string    `json:"property_name"`
	DisplayName   string    `json:"display_name"`
	Description   string    `json:"description"`
	FunctionRID   string    `json:"function_rid"`
	ReturnType    string    `json:"return_type"`
	OwnerID       uuid.UUID `json:"owner_id"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreateDerivedPropertyBindingRequest struct {
	ObjectTypeID uuid.UUID `json:"object_type_id"`
	PropertyName string    `json:"property_name"`
	DisplayName  string    `json:"display_name"`
	Description  string    `json:"description"`
	FunctionRID  string    `json:"function_rid"`
	ReturnType   string    `json:"return_type"`
}

// ----- ACL -----

// Role is the access level a principal has against a graph. Ordered
// from least to most privileged so RoleAtLeast can compare numerically.
type Role string

const (
	RoleNone       Role = ""
	RoleDiscoverer Role = "discoverer"
	RoleViewer     Role = "viewer"
	RoleEditor     Role = "editor"
	RoleOwner      Role = "owner"
)

// roleRank maps a Role to a numeric privilege. Higher = more rights.
func roleRank(r Role) int {
	switch r {
	case RoleOwner:
		return 4
	case RoleEditor:
		return 3
	case RoleViewer:
		return 2
	case RoleDiscoverer:
		return 1
	}
	return 0
}

// RoleAtLeast reports whether `have` satisfies the privilege of `want`.
func RoleAtLeast(have, want Role) bool { return roleRank(have) >= roleRank(want) }

// ParseRole normalises an inbound role string. Empty / unknown values
// resolve to RoleNone — the handler is expected to map that to 403/404.
func ParseRole(s string) Role {
	switch Role(s) {
	case RoleOwner, RoleEditor, RoleViewer, RoleDiscoverer:
		return Role(s)
	}
	return RoleNone
}

// PrincipalKind identifies whether a grant targets a user or a group.
type PrincipalKind string

const (
	PrincipalKindUser  PrincipalKind = "user"
	PrincipalKindGroup PrincipalKind = "group"
)

type GraphGrant struct {
	ID            uuid.UUID     `json:"id"`
	GraphID       uuid.UUID     `json:"graph_id"`
	PrincipalKind PrincipalKind `json:"principal_kind"`
	PrincipalID   uuid.UUID     `json:"principal_id"`
	Role          Role          `json:"role"`
	GrantedBy     uuid.UUID     `json:"granted_by"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

type PutGraphGrantRequest struct {
	PrincipalKind PrincipalKind `json:"principal_kind"`
	PrincipalID   uuid.UUID     `json:"principal_id"`
	Role          Role          `json:"role"`
}

// EnableVersioningRequest is the body for the toggle endpoint. Empty
// body is also accepted (defaults to {enabled: true}).
type EnableVersioningRequest struct {
	Enabled bool `json:"enabled"`
}

// LinkShare exposes the current "anyone with the link" configuration
// of a graph. When Enabled is false the Token and Role are zero —
// even owners should not see a stale token in the UI.
type LinkShare struct {
	Enabled bool   `json:"enabled"`
	Token   string `json:"token,omitempty"`
	Role    Role   `json:"role,omitempty"`
}

// UpdateLinkShareRequest is the owner-only payload that toggles link
// sharing, sets the conferred role, and optionally rotates the token.
// A fresh token is also generated automatically when enabling for the
// first time (the previous token, if any, becomes invalid).
type UpdateLinkShareRequest struct {
	Enabled     bool `json:"enabled"`
	Role        Role `json:"role"`
	RotateToken bool `json:"rotate_token,omitempty"`
}

// SharedGraphResponse is the payload returned by GET /shared/{token}.
// The Graph field is the full Graph payload when Role >= Viewer, or
// the DiscovererView when Role == Discoverer. The Role field is the
// effective role granted by the link (the caller may have a higher
// role through an explicit grant — that is resolved client-side).
type SharedGraphResponse struct {
	Graph         *Graph          `json:"graph,omitempty"`
	Discoverer    *DiscovererView `json:"discoverer_view,omitempty"`
	Role          Role            `json:"role"`
	LinkShareRole Role            `json:"link_share_role"`
}

// DiscovererView is the redacted shape returned for a Discoverer-role
// caller: name + metadata only, no layout / layers / seed objects.
type DiscovererView struct {
	ID          uuid.UUID `json:"id"`
	RID         string    `json:"rid"`
	Title       string    `json:"title"`
	Description string    `json:"description,omitempty"`
	OwnerID     uuid.UUID `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// MakeGraphRID renders a Foundry-style stable identifier for a graph.
func MakeGraphRID(id uuid.UUID) string {
	return "ri.vertex.main.graph." + id.String()
}

// MakeSearchAroundRID renders a stable identifier for a saved Search Around.
func MakeSearchAroundRID(id uuid.UUID) string {
	return "ri.vertex.main.search-around." + id.String()
}

// MakeGraphTemplateRID renders a stable identifier for a graph template.
func MakeGraphTemplateRID(id uuid.UUID) string {
	return "ri.vertex.main.graph-template." + id.String()
}

// ----- Graph templates -----

// GraphTemplate is a reusable recipe that regenerates a Vertex graph
// from a declared set of inputs. The owner converts an existing graph
// into a template, decides which objects and scalars become
// parameters, and binds layer styling, search-around behaviour, and
// graph defaults that are applied when the template is used.
type GraphTemplate struct {
	ID                  uuid.UUID                         `json:"id"`
	RID                 string                            `json:"rid"`
	Title               string                            `json:"title"`
	Description         string                            `json:"description"`
	SourceGraphID       *uuid.UUID                        `json:"source_graph_id,omitempty"`
	ObjectParameters    []GraphTemplateObjectParameter    `json:"object_parameters"`
	NonObjectParameters []GraphTemplateNonObjectParameter `json:"non_object_parameters"`
	SearchArounds       []GraphTemplateSearchAround       `json:"search_arounds"`
	LayerConfig         []GraphTemplateLayerConfig        `json:"layer_config"`
	GraphConfig         GraphTemplateGraphConfig          `json:"graph_config"`
	Defaults            GraphTemplateDefaults             `json:"defaults"`
	OwnerID             uuid.UUID                         `json:"owner_id"`
	ProjectID           *uuid.UUID                        `json:"project_id,omitempty"`
	Organizations       []string                          `json:"organizations"`
	Markings            []string                          `json:"markings"`
	CreatedAt           time.Time                         `json:"created_at"`
	UpdatedAt           time.Time                         `json:"updated_at"`
}

// GraphTemplateObjectParameter binds a slot in the template to an
// ontology object input. When the template is used the caller is
// asked to supply the matching object (or object set) and the
// generated graph seeds from it.
type GraphTemplateObjectParameter struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	ObjectTypeID string `json:"object_type_id"`
	Required     bool   `json:"required"`
	SingleObject bool   `json:"single_object"`
}

// GraphTemplateNonObjectParameter exposes a scalar input that custom
// search-around functions can read — typical shapes are thresholds,
// hop counts, label filters, or time windows.
type GraphTemplateNonObjectParameter struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	ValueType    string          `json:"value_type"`
	DefaultValue json.RawMessage `json:"default_value,omitempty"`
	Required     bool            `json:"required"`
}

// GraphTemplateSearchAround attaches one search-around behaviour to a
// declared object parameter. Three flavours are supported: a direct
// ontology-link traversal, a custom function evaluated against the
// parameter, or a re-use of a saved Search Around. Config is
// shape-dependent and JSON-encoded.
type GraphTemplateSearchAround struct {
	ID                string          `json:"id"`
	ObjectParameterID string          `json:"object_parameter_id"`
	Kind              string          `json:"kind"`
	Config            json.RawMessage `json:"config"`
}

// GraphTemplateLayerConfig records, for each layer present on the
// source graph, whether the template keeps it and whether the
// layer's styling is retained as-is or stripped to defaults.
type GraphTemplateLayerConfig struct {
	LayerID     string `json:"layer_id"`
	Include     bool   `json:"include"`
	KeepStyling bool   `json:"keep_styling"`
}

// GraphTemplateGraphConfig captures the global appearance of the
// generated graph: the human-readable name shown above the canvas,
// an optional description, and which layout algorithm to apply.
type GraphTemplateGraphConfig struct {
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
	Layout      string `json:"layout"`
}

// GraphTemplateDefaults captures non-layout choices the template
// owner wants to ship — currently the set of items that should be
// pinned/selected when the generated graph first renders.
type GraphTemplateDefaults struct {
	PinnedItems []string `json:"pinned_items"`
}

// CreateGraphTemplateRequest is the wire payload accepted by
// POST /graph-templates.
type CreateGraphTemplateRequest struct {
	Title               string                            `json:"title"`
	Description         string                            `json:"description"`
	SourceGraphID       *uuid.UUID                        `json:"source_graph_id,omitempty"`
	ObjectParameters    []GraphTemplateObjectParameter    `json:"object_parameters"`
	NonObjectParameters []GraphTemplateNonObjectParameter `json:"non_object_parameters"`
	SearchArounds       []GraphTemplateSearchAround       `json:"search_arounds"`
	LayerConfig         []GraphTemplateLayerConfig        `json:"layer_config"`
	GraphConfig         GraphTemplateGraphConfig          `json:"graph_config"`
	Defaults            GraphTemplateDefaults             `json:"defaults"`
	ProjectID           *uuid.UUID                        `json:"project_id,omitempty"`
	Organizations       []string                          `json:"organizations"`
	Markings            []string                          `json:"markings"`
}

// UpdateGraphTemplateRequest is the wire payload for partial updates.
// Pointer-valued fields are omitted by callers who only want to
// change a subset of the template.
type UpdateGraphTemplateRequest struct {
	Title               *string                            `json:"title,omitempty"`
	Description         *string                            `json:"description,omitempty"`
	ObjectParameters    *[]GraphTemplateObjectParameter    `json:"object_parameters,omitempty"`
	NonObjectParameters *[]GraphTemplateNonObjectParameter `json:"non_object_parameters,omitempty"`
	SearchArounds       *[]GraphTemplateSearchAround       `json:"search_arounds,omitempty"`
	LayerConfig         *[]GraphTemplateLayerConfig        `json:"layer_config,omitempty"`
	GraphConfig         *GraphTemplateGraphConfig          `json:"graph_config,omitempty"`
	Defaults            *GraphTemplateDefaults             `json:"defaults,omitempty"`
	ProjectID           *uuid.UUID                         `json:"project_id,omitempty"`
	Organizations       *[]string                          `json:"organizations,omitempty"`
	Markings            *[]string                          `json:"markings,omitempty"`
}

// InstantiateGraphTemplateRequest collects the parameter values the
// caller supplies to materialise a fresh graph from a template.
type InstantiateGraphTemplateRequest struct {
	Title                    string                     `json:"title,omitempty"`
	ObjectParameterValues    map[string][]string        `json:"object_parameter_values"`
	NonObjectParameterValues map[string]json.RawMessage `json:"non_object_parameter_values"`
}

// InstantiateGraphTemplateResponse returns the newly created graph
// plus the resolved parameter values so callers can refresh their UI
// state without a second round-trip.
type InstantiateGraphTemplateResponse struct {
	Graph                    *Graph                     `json:"graph"`
	ObjectParameterValues    map[string][]string        `json:"object_parameter_values"`
	NonObjectParameterValues map[string]json.RawMessage `json:"non_object_parameter_values"`
}

// ListGraphTemplatesResult is the paginated response envelope.
type ListGraphTemplatesResult struct {
	Items []GraphTemplate `json:"items"`
	Total int             `json:"total"`
}
