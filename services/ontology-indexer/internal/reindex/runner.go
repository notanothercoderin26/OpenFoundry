// Package reindex implements the on-demand backfill that re-projects
// every object of a given (tenant, object_type) pair from
// object-database-service into the configured search backend. Used to
// rebuild the index from current ontology state when (a) the demo
// starts fresh, (b) a Kafka outage caused gaps, or (c) the search
// backend was wiped.
package reindex

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

// SourceObject is the per-row shape returned by the object source.
type SourceObject struct {
	ID         string                 `json:"id"`
	TypeID     string                 `json:"object_type_id"`
	Properties map[string]any         `json:"properties"`
	UpdatedAt  string                 `json:"updated_at,omitempty"`
}

// ListPage is one page of the source's paginated list endpoint.
type ListPage struct {
	Items   []SourceObject
	Total   int
	HasNext bool
}

// ObjectsSource enumerates objects of a given (tenant, type) pair.
// Implementations may hit object-database-service over HTTP or be
// supplied by tests.
type ObjectsSource interface {
	ListByType(ctx context.Context, tenant repos.TenantId, typeID repos.TypeId, page, perPage uint32) (ListPage, error)
}

// Runner performs a full backfill of (tenant, type) into the search backend.
type Runner struct {
	Source   ObjectsSource
	Backend  searchabstraction.SearchBackend
	Tracker  *status.Tracker
	PageSize uint32
	Log      *slog.Logger
}

// Result is the summary returned at the end of a backfill.
type Result struct {
	TotalRead    int
	Indexed      int
	Failed       int
	StartedAt    time.Time
	CompletedAt  time.Time
	Duration     time.Duration
	LastError    string
}

// Backfill enumerates the source in pages and writes each object as a
// search-backend document. Failures on individual rows are counted but
// do not abort the run; a transport-level error from the source aborts.
func (r *Runner) Backfill(ctx context.Context, tenant repos.TenantId, typeID repos.TypeId) (Result, error) {
	if r.Source == nil {
		return Result{}, fmt.Errorf("reindex.Runner: nil Source")
	}
	if r.Backend == nil {
		return Result{}, fmt.Errorf("reindex.Runner: nil Backend")
	}
	log := r.Log
	if log == nil {
		log = slog.Default()
	}
	pageSize := r.PageSize
	if pageSize == 0 {
		pageSize = 500
	}

	res := Result{StartedAt: time.Now().UTC()}
	page := uint32(1)
	for {
		if err := ctx.Err(); err != nil {
			res.CompletedAt = time.Now().UTC()
			res.Duration = res.CompletedAt.Sub(res.StartedAt)
			return res, err
		}
		out, err := r.Source.ListByType(ctx, tenant, typeID, page, pageSize)
		if err != nil {
			res.CompletedAt = time.Now().UTC()
			res.Duration = res.CompletedAt.Sub(res.StartedAt)
			return res, fmt.Errorf("source page %d: %w", page, err)
		}
		if len(out.Items) == 0 {
			break
		}
		res.TotalRead += len(out.Items)
		now := time.Now().UTC()
		for _, item := range out.Items {
			payload, err := json.Marshal(item.Properties)
			if err != nil {
				res.Failed++
				res.LastError = fmt.Sprintf("marshal properties for %s: %v", item.ID, err)
				log.Warn("reindex marshal failed", slog.String("id", item.ID), slog.String("error", err.Error()))
				continue
			}
			doc := searchabstraction.IndexDoc{
				Tenant:  tenant,
				ID:      repos.ObjectId(item.ID),
				TypeID:  repos.TypeId(item.TypeID),
				Payload: payload,
				// Version 0 is "from-source backfill"; the next Kafka
				// event for this row will carry the real version and
				// the backend's per-(tenant,id) version check will
				// either accept it (newer) or skip it (older).
				Version: 0,
			}
			if err := r.Backend.Index(ctx, doc); err != nil {
				res.Failed++
				res.LastError = fmt.Sprintf("index %s: %v", item.ID, err)
				log.Warn("reindex index failed", slog.String("id", item.ID), slog.String("error", err.Error()))
				continue
			}
			res.Indexed++
			if r.Tracker != nil {
				r.Tracker.RecordIndexed(tenant, repos.TypeId(item.TypeID), now)
			}
		}
		if !out.HasNext {
			break
		}
		page++
	}
	res.CompletedAt = time.Now().UTC()
	res.Duration = res.CompletedAt.Sub(res.StartedAt)
	return res, nil
}
