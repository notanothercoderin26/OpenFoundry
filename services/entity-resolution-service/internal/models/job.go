package models

import (
	"time"

	"github.com/google/uuid"
)

// DatasetSourceBinding pins one source label to a real ontology object
// type so the resolution engine can pull EntityRecords from
// object-database-service instead of the synthetic fixtures in
// `domain/deduplication.go`. When `ResolutionJobConfig.Sources` is empty
// the engine falls back to `SynthesizeEntityRecords` so existing unit
// tests and CI smoke runs keep working without an upstream.
//
// The Foundry-native shape: an ER transform is a first-class node in
// the pipeline graph whose inputs are ontology object types or
// curated datasets and whose output is a canonical `Actor` dataset.
type DatasetSourceBinding struct {
	// SourceLabel is the value written into EntityRecord.Source — for
	// the geopolitics PoC, "ofac_sdn", "eu_consolidated", "opensanctions",
	// "wikidata", etc.
	SourceLabel string `json:"source_label"`

	// ObjectTypeID identifies the ontology object type to load from
	// object-database-service. Required.
	ObjectTypeID string `json:"object_type_id"`

	// Tenant overrides the loader's default `x-of-tenant` header. Empty
	// keeps the default tenant.
	Tenant string `json:"tenant,omitempty"`

	// RecordIDProperty picks the property used as EntityRecord.ExternalID.
	// Empty falls back to the object's primary id.
	RecordIDProperty string `json:"record_id_property,omitempty"`

	// DisplayProperty picks the property used as EntityRecord.DisplayName.
	// Empty tries "display_name" / "name" / "title" / "label" in order.
	DisplayProperty string `json:"display_property,omitempty"`

	// AttributeProperties restricts which object properties are copied
	// into EntityRecord.Attributes. Empty copies every property.
	AttributeProperties []string `json:"attribute_properties,omitempty"`

	// Limit caps the records pulled from this source. Zero defers to
	// `ResolutionJobConfig.RecordCount` (treated as a per-source cap).
	Limit int `json:"limit,omitempty"`

	// DefaultConfidence is written into EntityRecord.Confidence when
	// the source has no per-row confidence property. Zero falls back
	// to 0.85 inside the loader.
	DefaultConfidence float32 `json:"default_confidence,omitempty"`
}

// ResolutionJobConfig mirrors fusion_base::models::job::ResolutionJobConfig.
type ResolutionJobConfig struct {
	SourceLabels             []string                `json:"source_labels"`
	RecordCount              int32                   `json:"record_count"`
	BlockingStrategyOverride *BlockingStrategyConfig `json:"blocking_strategy_override"`
	ReviewSamplingRate       float32                 `json:"review_sampling_rate"`
	// Sources, when non-empty, switches the engine away from the
	// synthetic fixtures and pulls real records via the configured
	// loader. See DatasetSourceBinding.
	Sources []DatasetSourceBinding `json:"sources,omitempty"`
}

// DefaultResolutionJobConfig mirrors `impl Default for ResolutionJobConfig`.
func DefaultResolutionJobConfig() ResolutionJobConfig {
	return ResolutionJobConfig{
		SourceLabels:             []string{"crm", "erp", "support"},
		RecordCount:              12,
		BlockingStrategyOverride: nil,
		ReviewSamplingRate:       0.25,
	}
}

// FusionJobMetrics mirrors fusion_base::models::job::FusionJobMetrics.
type FusionJobMetrics struct {
	CandidatePairs    int32   `json:"candidate_pairs"`
	MatchedPairs      int32   `json:"matched_pairs"`
	ReviewPairs       int32   `json:"review_pairs"`
	ClusterCount      int32   `json:"cluster_count"`
	GoldenRecordCount int32   `json:"golden_record_count"`
	PrecisionEstimate float32 `json:"precision_estimate"`
	RecallEstimate    float32 `json:"recall_estimate"`
}

// FusionJob mirrors fusion_base::models::job::FusionJob.
type FusionJob struct {
	ID              uuid.UUID           `json:"id"`
	Name            string              `json:"name"`
	Description     string              `json:"description"`
	Status          string              `json:"status"`
	EntityType      string              `json:"entity_type"`
	MatchRuleID     uuid.UUID           `json:"match_rule_id"`
	MergeStrategyID uuid.UUID           `json:"merge_strategy_id"`
	Config          ResolutionJobConfig `json:"config"`
	Metrics         FusionJobMetrics    `json:"metrics"`
	LastRunSummary  string              `json:"last_run_summary"`
	LastRunAt       *time.Time          `json:"last_run_at"`
	CreatedAt       time.Time           `json:"created_at"`
	UpdatedAt       time.Time           `json:"updated_at"`
}

// CreateFusionJobRequest mirrors fusion_base::models::job::CreateFusionJobRequest.
type CreateFusionJobRequest struct {
	Name            string               `json:"name"`
	Description     *string              `json:"description,omitempty"`
	Status          *string              `json:"status,omitempty"`
	EntityType      *string              `json:"entity_type,omitempty"`
	MatchRuleID     uuid.UUID            `json:"match_rule_id"`
	MergeStrategyID uuid.UUID            `json:"merge_strategy_id"`
	Config          *ResolutionJobConfig `json:"config,omitempty"`
}

// RunResolutionJobResponse mirrors fusion_base::models::job::RunResolutionJobResponse.
type RunResolutionJobResponse struct {
	Job                FusionJob   `json:"job"`
	ClusterIDs         []uuid.UUID `json:"cluster_ids"`
	GoldenRecordIDs    []uuid.UUID `json:"golden_record_ids"`
	ReviewQueueItemIDs []uuid.UUID `json:"review_queue_item_ids"`
	ExecutedAt         time.Time   `json:"executed_at"`
}
