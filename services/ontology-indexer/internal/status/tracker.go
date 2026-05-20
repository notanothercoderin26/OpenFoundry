// Package status keeps per-(tenant, object_type) indexing telemetry so
// the indexer can answer "is Aircraft caught up?" via HTTP.
//
// The tracker is in-process state — it does not persist across restarts.
// That is intentional for the PoC: a Postgres-backed store is the
// follow-up flagged in B03 G4 once we know the access patterns.
package status

import (
	"sync"
	"time"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// Stats is the snapshot returned for a single (tenant, type) pair.
type Stats struct {
	Tenant         repos.TenantId `json:"tenant"`
	ObjectType     repos.TypeId   `json:"object_type"`
	IndexedCount   uint64         `json:"indexed_count"`
	DeletedCount   uint64         `json:"deleted_count"`
	LastIndexedAt  time.Time      `json:"last_indexed_at,omitempty"`
	LastEventTime  time.Time      `json:"last_event_time,omitempty"`
	LagSeconds     float64        `json:"lag_seconds"`
}

// Tracker is thread-safe.
type Tracker struct {
	mu sync.RWMutex
	// key is "tenant\x00type"
	stats map[string]*entry
	now   func() time.Time
}

type entry struct {
	tenant        repos.TenantId
	typeID        repos.TypeId
	indexedCount  uint64
	deletedCount  uint64
	lastIndexedAt time.Time
	lastEventTime time.Time
}

func NewTracker() *Tracker {
	return &Tracker{stats: map[string]*entry{}, now: time.Now}
}

// RecordIndexed registers a successful upsert projection.
func (t *Tracker) RecordIndexed(tenant repos.TenantId, typeID repos.TypeId, eventTime time.Time) {
	if t == nil || tenant == "" || typeID == "" {
		return
	}
	t.record(tenant, typeID, eventTime, false)
}

// RecordDeleted registers a successful delete projection.
func (t *Tracker) RecordDeleted(tenant repos.TenantId, typeID repos.TypeId, eventTime time.Time) {
	if t == nil || tenant == "" || typeID == "" {
		return
	}
	t.record(tenant, typeID, eventTime, true)
}

func (t *Tracker) record(tenant repos.TenantId, typeID repos.TypeId, eventTime time.Time, deleted bool) {
	indexedAt := t.now()
	k := key(tenant, typeID)
	t.mu.Lock()
	defer t.mu.Unlock()
	e, ok := t.stats[k]
	if !ok {
		e = &entry{tenant: tenant, typeID: typeID}
		t.stats[k] = e
	}
	if deleted {
		e.deletedCount++
	} else {
		e.indexedCount++
	}
	if indexedAt.After(e.lastIndexedAt) {
		e.lastIndexedAt = indexedAt
	}
	if !eventTime.IsZero() && eventTime.After(e.lastEventTime) {
		e.lastEventTime = eventTime
	}
}

// Snapshot returns stats for a single (tenant, type). When tenant is empty,
// counts and timestamps are aggregated across all tenants for that type.
// Returns ok=false if no events have been recorded.
func (t *Tracker) Snapshot(tenant repos.TenantId, typeID repos.TypeId) (Stats, bool) {
	if t == nil || typeID == "" {
		return Stats{}, false
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	if tenant != "" {
		e, ok := t.stats[key(tenant, typeID)]
		if !ok {
			return Stats{}, false
		}
		return e.snapshot(), true
	}
	agg := entry{typeID: typeID}
	found := false
	for _, e := range t.stats {
		if e.typeID != typeID {
			continue
		}
		found = true
		agg.indexedCount += e.indexedCount
		agg.deletedCount += e.deletedCount
		if e.lastIndexedAt.After(agg.lastIndexedAt) {
			agg.lastIndexedAt = e.lastIndexedAt
		}
		if e.lastEventTime.After(agg.lastEventTime) {
			agg.lastEventTime = e.lastEventTime
		}
	}
	if !found {
		return Stats{}, false
	}
	return agg.snapshot(), true
}

// All returns stats for every known (tenant, type) pair, sorted is the
// caller's job — the slice order is unspecified.
func (t *Tracker) All() []Stats {
	if t == nil {
		return nil
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := make([]Stats, 0, len(t.stats))
	for _, e := range t.stats {
		out = append(out, e.snapshot())
	}
	return out
}

func (e *entry) snapshot() Stats {
	return Stats{
		Tenant:        e.tenant,
		ObjectType:    e.typeID,
		IndexedCount:  e.indexedCount,
		DeletedCount:  e.deletedCount,
		LastIndexedAt: e.lastIndexedAt,
		LastEventTime: e.lastEventTime,
		LagSeconds:    lagSeconds(e.lastIndexedAt, e.lastEventTime),
	}
}

// lagSeconds is the "indexing lag" observed at the most recent projection:
// the wall-clock delay between when the source emitted the Kafka record and
// when the indexer wrote it to the search backend. Capped at zero to absorb
// clock skew where the indexer host is slightly behind the producer.
func lagSeconds(indexedAt, eventTime time.Time) float64 {
	if indexedAt.IsZero() || eventTime.IsZero() {
		return 0
	}
	d := indexedAt.Sub(eventTime).Seconds()
	if d < 0 {
		return 0
	}
	return d
}

func key(tenant repos.TenantId, typeID repos.TypeId) string {
	return string(tenant) + "\x00" + string(typeID)
}
