package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/domain/interop"
	"github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/models"
)

// TrainingHandlers ports libs/ml-kernel/src/handlers/training.rs:
//   - GET  list_training_jobs
//   - POST create_training_job   (501 stub: chains
//                                 interop::merge_training_config_with_external
//                                 + training::execute_training; lands
//                                 with the libs/ml-kernel-go/domain/
//                                 interop port — 769 LOC of pure logic)
type TrainingHandlers struct {
	Pool *pgxpool.Pool
}

const trainingJobColumns = `id, experiment_id, model_id, name, status,
                            dataset_ids, training_config,
                            hyperparameter_search, objective_metric_name,
                            trials, best_model_version_id,
                            submitted_at, started_at, completed_at,
                            created_at`

func scanTrainingJob(s predictionsScanner) (models.TrainingJob, error) {
	var j models.TrainingJob
	var datasetIDsRaw, trainingConfigRaw, hyperSearchRaw, trialsRaw []byte
	var experimentID, modelID, bestVersionID *uuid.UUID
	var startedAt, completedAt *time.Time
	if err := s.Scan(
		&j.ID, &experimentID, &modelID, &j.Name, &j.Status,
		&datasetIDsRaw, &trainingConfigRaw, &hyperSearchRaw,
		&j.ObjectiveMetricName, &trialsRaw, &bestVersionID,
		&j.SubmittedAt, &startedAt, &completedAt, &j.CreatedAt,
	); err != nil {
		return j, err
	}
	j.ExperimentID = experimentID
	j.ModelID = modelID
	j.BestModelVersionID = bestVersionID
	j.StartedAt = startedAt
	j.CompletedAt = completedAt
	if len(datasetIDsRaw) > 0 {
		_ = json.Unmarshal(datasetIDsRaw, &j.DatasetIDs)
	}
	if j.DatasetIDs == nil {
		j.DatasetIDs = []uuid.UUID{}
	}
	if len(trainingConfigRaw) > 0 {
		j.TrainingConfig = trainingConfigRaw
	} else {
		j.TrainingConfig = json.RawMessage("{}")
	}
	if len(hyperSearchRaw) > 0 {
		j.HyperparameterSearch = hyperSearchRaw
	} else {
		j.HyperparameterSearch = json.RawMessage("{}")
	}
	if len(trialsRaw) > 0 {
		_ = json.Unmarshal(trialsRaw, &j.Trials)
	}
	if j.Trials == nil {
		j.Trials = []models.TrainingTrial{}
	}
	j.ExternalTraining = interop.TrackingSourceFromTrainingConfig(j.TrainingConfig)
	return j, nil
}

// ListTrainingJobs handles `GET /api/v1/training-jobs`.
func (h *TrainingHandlers) ListTrainingJobs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Pool.Query(r.Context(),
		`SELECT `+trainingJobColumns+` FROM ml_training_jobs
          ORDER BY submitted_at DESC, created_at DESC`)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()
	out := make([]models.TrainingJob, 0)
	for rows.Next() {
		j, err := scanTrainingJob(rows)
		if err != nil {
			dbError(w, err)
			return
		}
		out = append(out, j)
	}
	writeJSON(w, http.StatusOK, models.ListTrainingJobsResponse{Data: out})
}

// CreateTrainingJob handles `POST /api/v1/training-jobs`. The full
// path chains interop.merge_training_config_with_external +
// training.execute_training (both deferred). Until those land this
// stub validates the wire envelope (empty name → 400, bad JSON → 400)
// so consumers can wire the route today.
func (h *TrainingHandlers) CreateTrainingJob(w http.ResponseWriter, r *http.Request) {
	var body models.CreateTrainingJobRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "training job name is required")
		return
	}
	writeError(w, http.StatusNotImplemented, "training job execution lands with libs/ml-kernel-go/domain/{interop,training/runner} port")
}

// loadTrainingJob is a small helper kept private but exported via
// the handler so future slices (eg. retry / cancel endpoints) can
// reuse it without re-implementing the column list.
func (h *TrainingHandlers) loadTrainingJob(ctx context.Context, id uuid.UUID) (*models.TrainingJob, error) {
	row := h.Pool.QueryRow(ctx,
		`SELECT `+trainingJobColumns+` FROM ml_training_jobs WHERE id = $1`, id)
	j, err := scanTrainingJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}
