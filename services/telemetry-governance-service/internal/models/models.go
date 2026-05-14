// Package models holds wire types for telemetry-governance-service.
//
// The four sub-features (telemetry_exports, health_checks,
// execution_runs, monitoring_rules) share a uniform schema: one
// parent table (id, payload, created_at) plus one child table (id,
// parent_id, payload, created_at). A single PrimaryItem/SecondaryItem
// pair is reused across all four features via the generic repo + handlers.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// PrimaryItem is the parent row (telemetry_exports, health_checks, …).
type PrimaryItem struct {
	ID        uuid.UUID       `json:"id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

// CreatePrimaryRequest is the body of POST /<feature>.
type CreatePrimaryRequest struct {
	Payload json.RawMessage `json:"payload"`
}

// SecondaryItem is the child row (telemetry_policies, health_check_results, …).
type SecondaryItem struct {
	ID        uuid.UUID       `json:"id"`
	ParentID  uuid.UUID       `json:"parent_id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

// CreateSecondaryRequest is the body of POST /<feature>/{parent_id}/<children>.
type CreateSecondaryRequest struct {
	Payload json.RawMessage `json:"payload"`
}

// FeatureTables names the parent + child tables for one sub-feature.
//
// The four feature triplets:
//
//	{Feature: "telemetry-exports",   Primary: "telemetry_exports",  Secondary: "telemetry_policies"}
//	{Feature: "health-checks",       Primary: "health_checks",      Secondary: "health_check_results"}
//	{Feature: "execution-runs",      Primary: "execution_runs",     Secondary: "execution_logs"}
//	{Feature: "monitoring-rules",    Primary: "monitoring_rules",   Secondary: "monitoring_subscribers"}
type FeatureTables struct {
	Feature   string // path segment under /api/v1
	Primary   string
	Secondary string
	// SecondaryPath is the path segment for the child collection
	// (e.g. "policies", "results", "logs", "subscribers").
	SecondaryPath string
}

// AllFeatures lists the four feature triplets in their canonical order.
func AllFeatures() []FeatureTables {
	return []FeatureTables{
		{Feature: "telemetry-exports", Primary: "telemetry_exports", Secondary: "telemetry_policies", SecondaryPath: "policies"},
		{Feature: "health-checks", Primary: "health_checks", Secondary: "health_check_results", SecondaryPath: "results"},
		{Feature: "execution-runs", Primary: "execution_runs", Secondary: "execution_logs", SecondaryPath: "logs"},
		{Feature: "monitoring-rules", Primary: "monitoring_rules", Secondary: "monitoring_subscribers", SecondaryPath: "subscribers"},
	}
}
