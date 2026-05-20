// HealthCheckPublisher posts ER precision/recall metrics into
// telemetry-governance-service so the Foundry-style "Data Health"
// surface lights up after each RunJob. Per PoC contract §6 the
// entity-resolution transform must expose precision/recall as named
// health checks, not buried in service logs.
//
// We do NOT block RunJob on this — a publisher failure is logged and
// swallowed at the handler boundary. Telemetry is observational; the
// resolution result is authoritative.

package domain

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/entity-resolution-service/internal/models"
)

// HealthCheckPublisher is the small interface RunJob calls. Concrete
// implementations live in this package; the no-op variant is used
// when telemetry-governance-service is not wired up.
type HealthCheckPublisher interface {
	PublishJobMetrics(ctx context.Context, job *models.FusionJob, metrics models.FusionJobMetrics) error
}

// NoopHealthCheckPublisher discards every call. Used when no
// telemetry-governance base URL is configured.
type NoopHealthCheckPublisher struct{}

func (NoopHealthCheckPublisher) PublishJobMetrics(_ context.Context, _ *models.FusionJob, _ models.FusionJobMetrics) error {
	return nil
}

// HTTPHealthCheckPublisher posts metrics as a `health-checks` row
// (POST /api/v1/health-checks). The payload contains everything a
// Foundry-style Data Health surface needs: feature label, the bound
// dataset/object-type, the metric snapshot, and the contributing
// source labels.
//
// We POST one row per job run (the parent `health_checks` table is
// generic enough that successive runs of the same job append rows
// rather than overwriting — the Data Health UI uses created_at to
// timeline them).
type HTTPHealthCheckPublisher struct {
	BaseURL    string
	HTTPClient *http.Client
	AuthHeader string
}

// NewHTTPHealthCheckPublisher returns a publisher with a sensible
// default HTTP client.
func NewHTTPHealthCheckPublisher(baseURL string) *HTTPHealthCheckPublisher {
	return &HTTPHealthCheckPublisher{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// healthCheckEnvelope mirrors the telemetry-governance-service
// CreatePrimaryRequest body — generic `payload` wrapper. Field names
// inside the payload are read by the Workshop Data Health widgets.
type healthCheckEnvelope struct {
	Payload healthCheckPayload `json:"payload"`
}

type healthCheckPayload struct {
	Kind              string                 `json:"kind"`               // always "entity_resolution_metrics" — discriminator
	JobID             string                 `json:"job_id"`
	JobName           string                 `json:"job_name"`
	EntityType        string                 `json:"entity_type"`
	Status            string                 `json:"status"`
	Sources           []string               `json:"sources,omitempty"`
	BoundObjectTypes  []string               `json:"bound_object_types,omitempty"`
	Metrics           models.FusionJobMetrics `json:"metrics"`
	RecordedAt        time.Time              `json:"recorded_at"`
}

// PublishJobMetrics is the single entry point used by RunJob.
func (p *HTTPHealthCheckPublisher) PublishJobMetrics(
	ctx context.Context,
	job *models.FusionJob,
	metrics models.FusionJobMetrics,
) error {
	if p == nil || p.BaseURL == "" {
		return errors.New("health-check publisher: BaseURL is required")
	}
	if p.HTTPClient == nil {
		p.HTTPClient = http.DefaultClient
	}
	if job == nil {
		return errors.New("health-check publisher: job is nil")
	}

	envelope := healthCheckEnvelope{
		Payload: healthCheckPayload{
			Kind:             "entity_resolution_metrics",
			JobID:            job.ID.String(),
			JobName:          job.Name,
			EntityType:       job.EntityType,
			Status:           job.Status,
			Sources:          collectSourceLabels(job),
			BoundObjectTypes: collectObjectTypes(job),
			Metrics:          metrics,
			RecordedAt:       time.Now().UTC(),
		},
	}
	body, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("encode envelope: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.BaseURL+"/api/v1/health-checks", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if p.AuthHeader != "" {
		req.Header.Set("Authorization", p.AuthHeader)
	}

	resp, err := p.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		preview, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("telemetry-governance POST returned %d: %s",
			resp.StatusCode, strings.TrimSpace(string(preview)))
	}
	return nil
}

func collectSourceLabels(job *models.FusionJob) []string {
	out := make([]string, 0, len(job.Config.Sources))
	for _, s := range job.Config.Sources {
		if s.SourceLabel != "" {
			out = append(out, s.SourceLabel)
		}
	}
	if len(out) == 0 {
		return job.Config.SourceLabels
	}
	return out
}

func collectObjectTypes(job *models.FusionJob) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(job.Config.Sources))
	for _, s := range job.Config.Sources {
		if s.ObjectTypeID == "" {
			continue
		}
		if _, ok := seen[s.ObjectTypeID]; ok {
			continue
		}
		seen[s.ObjectTypeID] = struct{}{}
		out = append(out, s.ObjectTypeID)
	}
	return out
}
