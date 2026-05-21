// Package models holds the wire-format types for agent-runtime-service.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AgentDefinition mirrors the agent_definitions row.
type AgentDefinition struct {
	ID           uuid.UUID       `json:"id"`
	Slug         string          `json:"slug"`
	Name         string          `json:"name"`
	Description  *string         `json:"description"`
	SystemPrompt *string         `json:"system_prompt"`
	ProviderID   *uuid.UUID      `json:"provider_id"`
	Tools        json.RawMessage `json:"tools"`
	Status       string          `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type CreateAgentRequest struct {
	Slug         string           `json:"slug"`
	Name         string           `json:"name"`
	Description  *string          `json:"description,omitempty"`
	SystemPrompt *string          `json:"system_prompt,omitempty"`
	ProviderID   *uuid.UUID       `json:"provider_id,omitempty"`
	Tools        *json.RawMessage `json:"tools,omitempty"`
}

type UpdateAgentRequest struct {
	Name         *string          `json:"name,omitempty"`
	Description  *string          `json:"description,omitempty"`
	SystemPrompt *string          `json:"system_prompt,omitempty"`
	Tools        *json.RawMessage `json:"tools,omitempty"`
	Status       *string          `json:"status,omitempty"`
}

// AgentRun mirrors agent_runs.
type AgentRun struct {
	ID             uuid.UUID       `json:"id"`
	AgentID        uuid.UUID       `json:"agent_id"`
	ConversationID *uuid.UUID      `json:"conversation_id"`
	Status         string          `json:"status"`
	Input          json.RawMessage `json:"input"`
	FinalOutput    json.RawMessage `json:"final_output"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type StartRunRequest struct {
	ConversationID *uuid.UUID      `json:"conversation_id,omitempty"`
	Input          json.RawMessage `json:"input"`
}

// AgentRunStep mirrors agent_run_steps.
type AgentRunStep struct {
	ID        uuid.UUID       `json:"id"`
	RunID     uuid.UUID       `json:"run_id"`
	StepIndex int32           `json:"step_index"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

type RecordStepRequest struct {
	StepIndex int32           `json:"step_index"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
}

type HumanApprovalRequest struct {
	Decision   string     `json:"decision"`
	ReviewerID *uuid.UUID `json:"reviewer_id,omitempty"`
	Note       *string    `json:"note,omitempty"`
}

// ActionProposalStatus enumerates the lifecycle of an agent-proposed
// Action awaiting human review.
const (
	ActionProposalStatusPending   = "pending"
	ActionProposalStatusApproved  = "approved"
	ActionProposalStatusDismissed = "dismissed"
)

// AgentActionProposal records an Action an agent proposed to invoke
// against a tool whose config carries `requires_human_approval`. The
// proposal sits in the queue until a human approves or dismisses it;
// only on approval does the Action execute downstream.
type AgentActionProposal struct {
	ID                uuid.UUID       `json:"id"`
	AgentRunID        *uuid.UUID      `json:"agent_run_id,omitempty"`
	LogicRunID        *uuid.UUID      `json:"logic_run_id,omitempty"`
	InitiatingUserID  uuid.UUID       `json:"initiating_user_id"`
	ActionTypeID      string          `json:"action_type_id"`
	Arguments         json.RawMessage `json:"arguments"`
	Justification     *string         `json:"justification,omitempty"`
	Status            string          `json:"status"`
	DecidedBy         *uuid.UUID      `json:"decided_by,omitempty"`
	DecisionNote      *string         `json:"decision_note,omitempty"`
	AppliedActionID   *string         `json:"applied_action_id,omitempty"`
	AppliedResponse   json.RawMessage `json:"applied_response,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	DecidedAt         *time.Time      `json:"decided_at,omitempty"`
}

// CreateActionProposalRequest is what an internal caller (the tool
// router) hands the repo to stage a new proposal.
type CreateActionProposalRequest struct {
	AgentRunID       *uuid.UUID
	LogicRunID       *uuid.UUID
	InitiatingUserID uuid.UUID
	ActionTypeID     string
	Arguments        json.RawMessage
	Justification    *string
}

// DecideActionProposalRequest is the body of approve / dismiss
// endpoints. Note is optional but encouraged on dismissals (a reason
// helps the audit trail).
type DecideActionProposalRequest struct {
	Note *string `json:"note,omitempty"`
}

// ListActionProposalsResponse wraps a paged list for the UI.
type ListActionProposalsResponse struct {
	Data []AgentActionProposal `json:"data"`
}

// LogicFile mirrors the AIP Logic file metadata row. Logic files are
// project/folder-managed resources; there is intentionally no
// personal-home-only placement field.
type LogicFile struct {
	ID                    uuid.UUID       `json:"id"`
	Name                  string          `json:"name"`
	Description           *string         `json:"description"`
	ProjectID             uuid.UUID       `json:"project_id"`
	FolderID              uuid.UUID       `json:"folder_id"`
	OwnerID               uuid.UUID       `json:"owner_id"`
	CurrentDraftVersionID uuid.UUID       `json:"current_draft_version_id"`
	PublishedVersionID    *uuid.UUID      `json:"published_version_id"`
	ExecutionMode         string          `json:"execution_mode"`
	RunHistoryMaxRows     int32           `json:"run_history_max_rows"`
	RunHistoryDatasetRID  *string         `json:"run_history_dataset_rid,omitempty"`
	Permissions           json.RawMessage `json:"permissions"`
	ArchivedAt            *time.Time      `json:"archived_at"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

type CreateLogicFileRequest struct {
	Name                 string           `json:"name"`
	Description          *string          `json:"description,omitempty"`
	ProjectID            uuid.UUID        `json:"project_id"`
	FolderID             uuid.UUID        `json:"folder_id"`
	ExecutionMode        *string          `json:"execution_mode,omitempty"`
	RunHistoryMaxRows    *int32           `json:"run_history_max_rows,omitempty"`
	RunHistoryDatasetRID *string          `json:"run_history_dataset_rid,omitempty"`
	Permissions          *json.RawMessage `json:"permissions,omitempty"`
}

type UpdateLogicFileMetadataRequest struct {
	Name                 *string          `json:"name,omitempty"`
	Description          *string          `json:"description,omitempty"`
	ExecutionMode        *string          `json:"execution_mode,omitempty"`
	RunHistoryMaxRows    *int32           `json:"run_history_max_rows,omitempty"`
	RunHistoryDatasetRID *string          `json:"run_history_dataset_rid,omitempty"`
	Permissions          *json.RawMessage `json:"permissions,omitempty"`
}

type MoveLogicFileRequest struct {
	ProjectID uuid.UUID `json:"project_id"`
	FolderID  uuid.UUID `json:"folder_id"`
}

type DuplicateLogicFileRequest struct {
	Name        *string    `json:"name,omitempty"`
	ProjectID   *uuid.UUID `json:"project_id,omitempty"`
	FolderID    *uuid.UUID `json:"folder_id,omitempty"`
	Description *string    `json:"description,omitempty"`
}

// LogicVersion captures a saved draft or published Logic function snapshot.
// Definition is intentionally JSONB so the no-code authoring surface can evolve
// independently while the version service remains stable.
type LogicVersion struct {
	ID            uuid.UUID       `json:"id"`
	LogicFileID   uuid.UUID       `json:"logic_file_id"`
	VersionNumber int32           `json:"version_number"`
	AuthorID      uuid.UUID       `json:"author_id"`
	Status        string          `json:"status"`
	Definition    json.RawMessage `json:"definition"`
	ChangeSummary json.RawMessage `json:"change_summary"`
	PublishedAt   *time.Time      `json:"published_at"`
	CreatedAt     time.Time       `json:"created_at"`
}

type SaveLogicDraftVersionRequest struct {
	Definition json.RawMessage `json:"definition"`
}

type PublishLogicVersionRequest struct {
	FunctionRID *string          `json:"function_rid,omitempty"`
	Name        *string          `json:"name,omitempty"`
	Signature   *json.RawMessage `json:"signature,omitempty"`
}

type LogicFunction struct {
	ID                     uuid.UUID       `json:"id"`
	LogicFileID            uuid.UUID       `json:"logic_file_id"`
	PublishedVersionID     uuid.UUID       `json:"published_version_id"`
	PublishedVersionNumber int32           `json:"published_version_number,omitempty"`
	FunctionRID            string          `json:"function_rid"`
	Name                   string          `json:"name"`
	Signature              json.RawMessage `json:"signature"`
	Definition             json.RawMessage `json:"definition"`
	PublishedBy            uuid.UUID       `json:"published_by"`
	PublishedAt            time.Time       `json:"published_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

type PublishLogicVersionResponse struct {
	LogicFile LogicFile     `json:"logic_file"`
	Version   LogicVersion  `json:"version"`
	Function  LogicFunction `json:"function"`
}

type LogicUsageSnippet struct {
	Language string `json:"language"`
	Label    string `json:"label"`
	Body     string `json:"body"`
}

type LogicUsageSurface struct {
	ID            string             `json:"id"`
	Surface       string             `json:"surface"`
	Label         string             `json:"label"`
	Description   string             `json:"description"`
	Href          string             `json:"href"`
	Status        string             `json:"status"`
	BlockedReason *string            `json:"blocked_reason,omitempty"`
	Requirements  []string           `json:"requirements,omitempty"`
	Snippet       *LogicUsageSnippet `json:"snippet,omitempty"`
}

type LogicUsageResponse struct {
	LogicFileID          uuid.UUID           `json:"logic_file_id"`
	Published            bool                `json:"published"`
	Function             *LogicFunction      `json:"function,omitempty"`
	ReturnsOntologyEdits bool                `json:"returns_ontology_edits"`
	Surfaces             []LogicUsageSurface `json:"surfaces"`
}

type InvokeLogicFunctionRequest struct {
	Inputs            json.RawMessage `json:"inputs,omitempty"`
	Parameters        json.RawMessage `json:"parameters,omitempty"`
	InvocationSurface *string         `json:"invocation_surface,omitempty"`
	Justification     *string         `json:"justification,omitempty"`
}

type LogicExecutionContext struct {
	ExecutionMode          string    `json:"execution_mode"`
	PermissionSubjectKind  string    `json:"permission_subject_kind"`
	PermissionSubjectID    uuid.UUID `json:"permission_subject_id"`
	InitiatingUserID       uuid.UUID `json:"initiating_user_id"`
	LogsVisibleTo          string    `json:"logs_visible_to"`
	RetentionHours         int32     `json:"retention_hours"`
	RetentionExpiresAt     time.Time `json:"retention_expires_at"`
	ProjectScopedAvailable bool      `json:"project_scoped_available"`
	ProjectID              uuid.UUID `json:"project_id"`
	RunHistoryDatasetRID   *string   `json:"run_history_dataset_rid,omitempty"`
	RunHistoryMaxRows      int32     `json:"run_history_max_rows,omitempty"`
}

type LogicRun struct {
	ID                    uuid.UUID       `json:"id"`
	LogicFileID           uuid.UUID       `json:"logic_file_id"`
	PublishedVersionID    uuid.UUID       `json:"published_version_id"`
	FunctionRID           string          `json:"function_rid"`
	ActorID               uuid.UUID       `json:"actor_id"`
	ExecutionMode         string          `json:"execution_mode"`
	PermissionSubjectKind string          `json:"permission_subject_kind"`
	PermissionSubjectID   uuid.UUID       `json:"permission_subject_id"`
	InvocationSurface     string          `json:"invocation_surface"`
	Status                string          `json:"status"`
	Inputs                json.RawMessage `json:"inputs"`
	Outputs               json.RawMessage `json:"outputs"`
	ErrorMessage          *string         `json:"error_message,omitempty"`
	Logs                  json.RawMessage `json:"logs"`
	DurationMS            int32           `json:"duration_ms"`
	RetentionExpiresAt    time.Time       `json:"retention_expires_at"`
	RunHistoryDatasetRID  *string         `json:"run_history_dataset_rid,omitempty"`
	RunHistoryDatasetRow  json.RawMessage `json:"run_history_dataset_row,omitempty"`
	TraceRefs             json.RawMessage `json:"trace_refs,omitempty"`
	BranchName            *string         `json:"branch_name,omitempty"`
	ModelProviderID       *string         `json:"model_provider_id,omitempty"`
	ServiceContext        json.RawMessage `json:"service_context,omitempty"`
	CreatedAt             time.Time       `json:"created_at"`
	CompletedAt           time.Time       `json:"completed_at"`
}

type LogicFailureCategory struct {
	Category string `json:"category"`
	Count    int32  `json:"count"`
}

type LogicMetricsResponse struct {
	LogicFileID              uuid.UUID              `json:"logic_file_id"`
	Window                   string                 `json:"window"`
	WindowStart              time.Time              `json:"window_start"`
	WindowEnd                time.Time              `json:"window_end"`
	SuccessCount             int32                  `json:"success_count"`
	FailureCount             int32                  `json:"failure_count"`
	FailureCategories        []LogicFailureCategory `json:"failure_categories"`
	RecentRuns               []LogicRun             `json:"recent_runs"`
	P95DurationMS            *int32                 `json:"p95_duration_ms"`
	ViewerPermissionRequired bool                   `json:"viewer_permission_required"`
}

type InvokeLogicFunctionResponse struct {
	Function          LogicFunction         `json:"function"`
	ExecutionContext  LogicExecutionContext `json:"execution_context"`
	Run               LogicRun              `json:"run"`
	InvocationSurface string                `json:"invocation_surface"`
	Status            string                `json:"status"`
	Inputs            json.RawMessage       `json:"inputs"`
	Outputs           json.RawMessage       `json:"outputs"`
	SecurityBoundary  LogicSecurityBoundary `json:"security_boundary"`
}

type LogicSecurityIssue struct {
	Severity string `json:"severity"`
	Field    string `json:"field"`
	Message  string `json:"message"`
}

type LogicSecurityResourceExposure struct {
	Kind                 string   `json:"kind"`
	ID                   string   `json:"id"`
	Source               string   `json:"source"`
	Properties           []string `json:"properties,omitempty"`
	LLMAccessible        bool     `json:"llm_accessible"`
	ExplicitlyConfigured bool     `json:"explicitly_configured"`
	Permissioned         bool     `json:"permissioned"`
	ImportedIntoProject  bool     `json:"imported_into_project"`
	MarkingAccess        bool     `json:"marking_access"`
}

type LogicSecurityBoundary struct {
	Ready                    bool                            `json:"ready"`
	ExecutionMode            string                          `json:"execution_mode"`
	PermissionSubjectKind    string                          `json:"permission_subject_kind"`
	PermissionSubjectID      uuid.UUID                       `json:"permission_subject_id"`
	LLMAccessibleResourceIDs []string                        `json:"llm_accessible_resource_ids"`
	Resources                []LogicSecurityResourceExposure `json:"resources"`
	Issues                   []LogicSecurityIssue            `json:"issues"`
}

type LogicComponentChange struct {
	ID         string `json:"id"`
	Name       string `json:"name,omitempty"`
	Kind       string `json:"kind,omitempty"`
	ChangeType string `json:"change_type"`
}

type LogicValueChange struct {
	BlockID    string          `json:"block_id"`
	BlockName  string          `json:"block_name,omitempty"`
	ChangeType string          `json:"change_type"`
	OldValue   json.RawMessage `json:"old_value,omitempty"`
	NewValue   json.RawMessage `json:"new_value,omitempty"`
}

type LogicVersionChangeSummary struct {
	Inputs        []LogicComponentChange `json:"inputs"`
	Blocks        []LogicComponentChange `json:"blocks"`
	Outputs       []LogicComponentChange `json:"outputs"`
	PromptChanges []LogicValueChange     `json:"prompt_changes"`
	ModelChanges  []LogicValueChange     `json:"model_changes"`
}

type LogicVersionComparison struct {
	BaseVersionID     uuid.UUID                 `json:"base_version_id"`
	HeadVersionID     uuid.UUID                 `json:"head_version_id"`
	BaseVersionNumber int32                     `json:"base_version_number"`
	HeadVersionNumber int32                     `json:"head_version_number"`
	Summary           LogicVersionChangeSummary `json:"summary"`
}
