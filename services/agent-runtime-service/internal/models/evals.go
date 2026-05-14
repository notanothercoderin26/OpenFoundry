package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// EvaluationSuite is the AIP Evals project/folder resource that groups target
// functions, test-case columns, evaluators, run summaries, and result dataset
// configuration.
type EvaluationSuite struct {
	ID                uuid.UUID       `json:"id"`
	Name              string          `json:"name"`
	Description       *string         `json:"description"`
	ProjectID         uuid.UUID       `json:"project_id"`
	FolderID          uuid.UUID       `json:"folder_id"`
	OwnerID           uuid.UUID       `json:"owner_id"`
	TargetFunctions   json.RawMessage `json:"target_functions"`
	TestCaseColumns   json.RawMessage `json:"test_case_columns"`
	TestCases         json.RawMessage `json:"test_cases"`
	Evaluators        json.RawMessage `json:"evaluators"`
	RunHistory        json.RawMessage `json:"run_history"`
	ResultsDatasetRID *string         `json:"results_dataset_rid,omitempty"`
	Permissions       json.RawMessage `json:"permissions"`
	SourceSurface     string          `json:"source_surface"`
	SourceResourceID  *string         `json:"source_resource_id,omitempty"`
	ArchivedAt        *time.Time      `json:"archived_at"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type CreateEvaluationSuiteRequest struct {
	Name              string           `json:"name"`
	Description       *string          `json:"description,omitempty"`
	ProjectID         uuid.UUID        `json:"project_id"`
	FolderID          uuid.UUID        `json:"folder_id"`
	TargetFunctions   json.RawMessage  `json:"target_functions,omitempty"`
	TestCaseColumns   json.RawMessage  `json:"test_case_columns,omitempty"`
	TestCases         json.RawMessage  `json:"test_cases,omitempty"`
	Evaluators        json.RawMessage  `json:"evaluators,omitempty"`
	RunHistory        json.RawMessage  `json:"run_history,omitempty"`
	ResultsDatasetRID *string          `json:"results_dataset_rid,omitempty"`
	Permissions       *json.RawMessage `json:"permissions,omitempty"`
	SourceSurface     *string          `json:"source_surface,omitempty"`
	SourceResourceID  *string          `json:"source_resource_id,omitempty"`
}

type UpdateEvaluationSuiteRequest struct {
	Name              *string          `json:"name,omitempty"`
	Description       *string          `json:"description,omitempty"`
	TargetFunctions   *json.RawMessage `json:"target_functions,omitempty"`
	TestCaseColumns   *json.RawMessage `json:"test_case_columns,omitempty"`
	TestCases         *json.RawMessage `json:"test_cases,omitempty"`
	Evaluators        *json.RawMessage `json:"evaluators,omitempty"`
	RunHistory        *json.RawMessage `json:"run_history,omitempty"`
	ResultsDatasetRID *string          `json:"results_dataset_rid,omitempty"`
	Permissions       *json.RawMessage `json:"permissions,omitempty"`
}

type MoveEvaluationSuiteRequest struct {
	ProjectID uuid.UUID `json:"project_id"`
	FolderID  uuid.UUID `json:"folder_id"`
}

type DuplicateEvaluationSuiteRequest struct {
	Name        *string    `json:"name,omitempty"`
	ProjectID   *uuid.UUID `json:"project_id,omitempty"`
	FolderID    *uuid.UUID `json:"folder_id,omitempty"`
	Description *string    `json:"description,omitempty"`
}
