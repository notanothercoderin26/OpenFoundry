package server

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

// statusResponse is the wire shape for /api/v1/ontology-indexer/status.
//
// Mirrors the B03 acceptance criterion: `{indexed_count, last_indexed_at,
// lag_seconds}`. Additional fields (deleted_count, last_event_time, tenant)
// are returned alongside so the UI can show the full picture without a
// follow-up call.
type statusResponse struct {
	ObjectType    string  `json:"object_type"`
	Tenant        string  `json:"tenant,omitempty"`
	IndexedCount  uint64  `json:"indexed_count"`
	DeletedCount  uint64  `json:"deleted_count"`
	LastIndexedAt string  `json:"last_indexed_at,omitempty"`
	LastEventTime string  `json:"last_event_time,omitempty"`
	LagSeconds    float64 `json:"lag_seconds"`
}

type statusListResponse struct {
	Items []statusResponse `json:"items"`
}

func newStatusHandler(tracker *status.Tracker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		objectType := strings.TrimSpace(q.Get("objectType"))
		tenant := strings.TrimSpace(q.Get("tenant"))

		w.Header().Set("Content-Type", "application/json; charset=utf-8")

		if objectType == "" {
			items := tracker.All()
			sort.Slice(items, func(i, j int) bool {
				if items[i].Tenant == items[j].Tenant {
					return items[i].ObjectType < items[j].ObjectType
				}
				return items[i].Tenant < items[j].Tenant
			})
			out := statusListResponse{Items: make([]statusResponse, 0, len(items))}
			for _, s := range items {
				out.Items = append(out.Items, toWire(s))
			}
			_ = json.NewEncoder(w).Encode(out)
			return
		}

		snap, ok := tracker.Snapshot(repos.TenantId(tenant), repos.TypeId(objectType))
		if !ok {
			// Surface a zero-state response instead of 404 — callers
			// polling for "is Aircraft indexed yet?" should not have to
			// distinguish "no events ever" from "type does not exist".
			_ = json.NewEncoder(w).Encode(statusResponse{ObjectType: objectType, Tenant: tenant})
			return
		}
		_ = json.NewEncoder(w).Encode(toWire(snap))
	}
}

func toWire(s status.Stats) statusResponse {
	resp := statusResponse{
		ObjectType:   string(s.ObjectType),
		Tenant:       string(s.Tenant),
		IndexedCount: s.IndexedCount,
		DeletedCount: s.DeletedCount,
		LagSeconds:   s.LagSeconds,
	}
	if !s.LastIndexedAt.IsZero() {
		resp.LastIndexedAt = s.LastIndexedAt.UTC().Format("2006-01-02T15:04:05.000Z07:00")
	}
	if !s.LastEventTime.IsZero() {
		resp.LastEventTime = s.LastEventTime.UTC().Format("2006-01-02T15:04:05.000Z07:00")
	}
	return resp
}
