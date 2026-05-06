package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/models"
)

// ModelsHandlers ports libs/ml-kernel/src/handlers/models.rs:
//   - GET   list_models
//   - POST  create_model
//   - PATCH update_model
//   - GET   list_model_versions
//   - POST  create_model_version    (501 stub: chains
//                                    interop::merge_metrics +
//                                    normalize_model_version_schema +
//                                    preferred_artifact_uri — 769 LOC
//                                    interop port)
//   - PATCH transition_model_version
//
// list_model_versions + transition_model_version embed shallow
// interop helpers (extractDescriptor) that read the schema JSON
// fields for ExternalTracking / ModelAdapter / RegistrySource and
// filter on HasSignal — they don't normalise strings (whitespace,
// system / framework / flavor casing). Full normalisation lands
// with the domain/interop port.
type ModelsHandlers struct {
	Pool *pgxpool.Pool
}

const modelColumns = `id, name, description, problem_type, status, tags,
                      owner_id, current_stage, latest_version_number,
                      active_deployment_id, created_at, updated_at`

const modelVersionColumns = `id, model_id, version_number, version_label,
                             stage, source_run_id, training_job_id,
                             hyperparameters, metrics, artifact_uri,
                             schema, created_at, promoted_at`

func scanModel(s predictionsScanner) (models.RegisteredModel, error) {
	var m models.RegisteredModel
	var tagsRaw []byte
	var ownerID, activeDeploymentID *uuid.UUID
	var latestVersion *int32
	if err := s.Scan(
		&m.ID, &m.Name, &m.Description, &m.ProblemType, &m.Status,
		&tagsRaw, &ownerID, &m.CurrentStage, &latestVersion,
		&activeDeploymentID, &m.CreatedAt, &m.UpdatedAt,
	); err != nil {
		return m, err
	}
	m.OwnerID = ownerID
	m.LatestVersionNumber = latestVersion
	m.ActiveDeploymentID = activeDeploymentID
	if len(tagsRaw) > 0 {
		_ = json.Unmarshal(tagsRaw, &m.Tags)
	}
	if m.Tags == nil {
		m.Tags = []string{}
	}
	return m, nil
}

func scanModelVersion(s predictionsScanner) (models.ModelVersion, error) {
	var v models.ModelVersion
	var hyperparametersRaw, metricsRaw, schemaRaw []byte
	var sourceRunID, trainingJobID *uuid.UUID
	var artifactURI *string
	var promotedAt *time.Time
	if err := s.Scan(
		&v.ID, &v.ModelID, &v.VersionNumber, &v.VersionLabel,
		&v.Stage, &sourceRunID, &trainingJobID,
		&hyperparametersRaw, &metricsRaw, &artifactURI,
		&schemaRaw, &v.CreatedAt, &promotedAt,
	); err != nil {
		return v, err
	}
	v.SourceRunID = sourceRunID
	v.TrainingJobID = trainingJobID
	v.ArtifactURI = artifactURI
	v.PromotedAt = promotedAt
	if len(hyperparametersRaw) > 0 {
		v.Hyperparameters = hyperparametersRaw
	} else {
		v.Hyperparameters = json.RawMessage("{}")
	}
	if len(metricsRaw) > 0 {
		_ = json.Unmarshal(metricsRaw, &v.Metrics)
	}
	if v.Metrics == nil {
		v.Metrics = []models.MetricValue{}
	}
	if len(schemaRaw) > 0 {
		v.Schema = schemaRaw
	} else {
		v.Schema = json.RawMessage("{}")
	}
	v.ModelAdapter = modelAdapterFromSchema(v.Schema)
	v.RegistrySource = registrySourceFromSchema(v.Schema)
	v.ExternalTracking = trackingSourceFromSchema(v.Schema)
	return v, nil
}

// modelAdapterFromSchema / registrySourceFromSchema / trackingSourceFromSchema
// are shallow ports of the matching libs/ai-kernel/src/domain/
// interop helpers. They each pluck a typed object out of the
// model-version schema, filter on HasSignal(), and return the raw
// shape verbatim. Whitespace + casing normalisation lands with the
// full domain/interop port.

func modelAdapterFromSchema(schema json.RawMessage) *models.ModelAdapterDescriptor {
	if len(schema) == 0 {
		return nil
	}
	var holder struct {
		ModelAdapter *models.ModelAdapterDescriptor `json:"model_adapter"`
	}
	if err := json.Unmarshal(schema, &holder); err != nil || holder.ModelAdapter == nil {
		return nil
	}
	if !holder.ModelAdapter.HasSignal() {
		return nil
	}
	return holder.ModelAdapter
}

func registrySourceFromSchema(schema json.RawMessage) *models.RegistrySourceDescriptor {
	if len(schema) == 0 {
		return nil
	}
	var holder struct {
		RegistrySource *models.RegistrySourceDescriptor `json:"registry_source"`
	}
	if err := json.Unmarshal(schema, &holder); err != nil || holder.RegistrySource == nil {
		return nil
	}
	if !holder.RegistrySource.HasSignal() {
		return nil
	}
	return holder.RegistrySource
}

func trackingSourceFromSchema(schema json.RawMessage) *models.ExternalTrackingSource {
	if len(schema) == 0 {
		return nil
	}
	var holder struct {
		ExternalTracking *models.ExternalTrackingSource `json:"external_tracking"`
	}
	if err := json.Unmarshal(schema, &holder); err != nil || holder.ExternalTracking == nil {
		return nil
	}
	if !holder.ExternalTracking.HasSignal() {
		return nil
	}
	return holder.ExternalTracking
}

func (h *ModelsHandlers) loadModel(ctx context.Context, id uuid.UUID) (*models.RegisteredModel, error) {
	row := h.Pool.QueryRow(ctx,
		`SELECT `+modelColumns+` FROM ml_models WHERE id = $1`, id)
	m, err := scanModel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// ListModels handles `GET /api/v1/models`.
func (h *ModelsHandlers) ListModels(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Pool.Query(r.Context(),
		`SELECT `+modelColumns+` FROM ml_models
          ORDER BY updated_at DESC, created_at DESC`)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	out := make([]models.RegisteredModel, 0)
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			dbError(w, err)
			return
		}
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, models.ListModelsResponse{Data: out})
}

// CreateModel handles `POST /api/v1/models`.
func (h *ModelsHandlers) CreateModel(w http.ResponseWriter, r *http.Request) {
	var body models.CreateModelRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "model name is required")
		return
	}
	problemType := body.ProblemType
	if problemType == "" {
		problemType = models.DefaultProblemType
	}
	status := derefString(body.Status, "active")
	tags := body.Tags
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, _ := json.Marshal(tags)

	row := h.Pool.QueryRow(r.Context(),
		`INSERT INTO ml_models
              (id, name, description, problem_type, status, tags,
               current_stage, latest_version_number)
            VALUES ($1, $2, $3, $4, $5, $6, 'none', NULL)
            RETURNING `+modelColumns,
		uuid.New(), strings.TrimSpace(body.Name), body.Description,
		problemType, status, tagsJSON)
	m, err := scanModel(row)
	if err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// UpdateModel handles `PATCH /api/v1/models/{id}`.
func (h *ModelsHandlers) UpdateModel(w http.ResponseWriter, r *http.Request, modelID uuid.UUID) {
	current, err := h.loadModel(r.Context(), modelID)
	if err != nil {
		dbError(w, err)
		return
	}
	if current == nil {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	var body models.UpdateModelRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	name := derefString(body.Name, current.Name)
	desc := derefString(body.Description, current.Description)
	problemType := derefString(body.ProblemType, current.ProblemType)
	status := derefString(body.Status, current.Status)
	tags := current.Tags
	if body.Tags != nil {
		tags = *body.Tags
	}
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, _ := json.Marshal(tags)

	row := h.Pool.QueryRow(r.Context(),
		`UPDATE ml_models SET
            name = $2, description = $3, problem_type = $4,
            status = $5, tags = $6, updated_at = NOW()
          WHERE id = $1
          RETURNING `+modelColumns,
		modelID, name, desc, problemType, status, tagsJSON)
	m, err := scanModel(row)
	if err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// ListModelVersions handles `GET /api/v1/models/{id}/versions`.
func (h *ModelsHandlers) ListModelVersions(w http.ResponseWriter, r *http.Request, modelID uuid.UUID) {
	var exists bool
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM ml_models WHERE id = $1)`, modelID).Scan(&exists); err != nil {
		dbError(w, err)
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT `+modelVersionColumns+` FROM ml_model_versions
          WHERE model_id = $1
          ORDER BY version_number DESC, created_at DESC`, modelID)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	out := make([]models.ModelVersion, 0)
	for rows.Next() {
		v, err := scanModelVersion(rows)
		if err != nil {
			dbError(w, err)
			return
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, models.ListModelVersionsResponse{Data: out})
}

// CreateModelVersion handles `POST /api/v1/models/{id}/versions`. The
// full path runs interop.normalize_model_version_schema +
// merge_metrics + preferred_artifact_uri (deferred). Until those land
// the stub returns 501 with input validation preserved.
func (h *ModelsHandlers) CreateModelVersion(w http.ResponseWriter, r *http.Request, modelID uuid.UUID) {
	var exists bool
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM ml_models WHERE id = $1)`, modelID).Scan(&exists); err != nil {
		dbError(w, err)
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	var body models.CreateModelVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	_ = body
	writeError(w, http.StatusNotImplemented, "model-version registration lands with libs/ml-kernel-go/domain/interop port")
}

// TransitionModelVersion handles `PATCH /api/v1/model-versions/{id}/transition`.
func (h *ModelsHandlers) TransitionModelVersion(w http.ResponseWriter, r *http.Request, versionID uuid.UUID) {
	var body models.TransitionModelVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Stage) == "" {
		writeError(w, http.StatusBadRequest, "target stage is required")
		return
	}

	currentRow := h.Pool.QueryRow(r.Context(),
		`SELECT `+modelVersionColumns+` FROM ml_model_versions WHERE id = $1`, versionID)
	current, err := scanModelVersion(currentRow)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "model version not found")
		return
	}
	if err != nil {
		dbError(w, err)
		return
	}

	if body.Stage == "production" {
		if _, err := h.Pool.Exec(r.Context(),
			`UPDATE ml_model_versions SET stage = 'staging'
              WHERE model_id = $1 AND stage = 'production' AND id <> $2`,
			current.ModelID, versionID); err != nil {
			dbError(w, err)
			return
		}
	}

	now := time.Now().UTC()
	row := h.Pool.QueryRow(r.Context(),
		`UPDATE ml_model_versions SET stage = $2, promoted_at = $3
          WHERE id = $1
          RETURNING `+modelVersionColumns,
		versionID, body.Stage, now)
	v, err := scanModelVersion(row)
	if err != nil {
		dbError(w, err)
		return
	}
	if err := h.refreshModelRollup(r.Context(), v.ModelID); err != nil {
		dbError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// refreshModelRollup mirrors fn refresh_model_rollup — recomputes
// ml_models.{latest_version_number, current_stage} from the children.
func (h *ModelsHandlers) refreshModelRollup(ctx context.Context, modelID uuid.UUID) error {
	var latestVersionNumber *int32
	if err := h.Pool.QueryRow(ctx,
		`SELECT MAX(version_number) FROM ml_model_versions WHERE model_id = $1`,
		modelID).Scan(&latestVersionNumber); err != nil {
		return fmt.Errorf("read latest version: %w", err)
	}

	stageCounts := map[string]int64{}
	for _, stage := range []string{"production", "staging", "candidate"} {
		var n int64
		if err := h.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM ml_model_versions WHERE model_id = $1 AND stage = $2`,
			modelID, stage).Scan(&n); err != nil {
			return fmt.Errorf("count %s: %w", stage, err)
		}
		stageCounts[stage] = n
	}

	currentStage := "none"
	switch {
	case stageCounts["production"] > 0:
		currentStage = "production"
	case stageCounts["staging"] > 0:
		currentStage = "staging"
	case stageCounts["candidate"] > 0:
		currentStage = "candidate"
	}

	_, err := h.Pool.Exec(ctx,
		`UPDATE ml_models SET latest_version_number = $2, current_stage = $3, updated_at = NOW()
          WHERE id = $1`, modelID, latestVersionNumber, currentStage)
	return err
}
