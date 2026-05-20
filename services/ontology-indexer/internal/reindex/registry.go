package reindex

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// JobStatus is the lifecycle state of a reindex job.
type JobStatus string

const (
	JobPending   JobStatus = "pending"
	JobRunning   JobStatus = "running"
	JobCompleted JobStatus = "completed"
	JobFailed    JobStatus = "failed"
)

// Job is one in-memory reindex execution. Jobs are not persisted; a
// restart loses history. That is acceptable for the PoC — promotions
// to a Postgres-backed jobs table happen alongside G4's persistence
// follow-up.
type Job struct {
	ID          string         `json:"id"`
	Tenant      repos.TenantId `json:"tenant"`
	ObjectType  repos.TypeId   `json:"object_type"`
	Status      JobStatus      `json:"status"`
	TotalRead   int            `json:"total_read"`
	Indexed     int            `json:"indexed"`
	Failed      int            `json:"failed"`
	StartedAt   time.Time      `json:"started_at"`
	CompletedAt time.Time      `json:"completed_at,omitempty"`
	DurationMS  int64          `json:"duration_ms"`
	Error       string         `json:"error,omitempty"`
	LastError   string         `json:"last_error,omitempty"`
}

// Registry is a thread-safe in-memory store of jobs keyed by id.
type Registry struct {
	mu   sync.RWMutex
	jobs map[string]*Job
	now  func() time.Time
	gen  func() string
}

func NewRegistry() *Registry {
	return &Registry{jobs: map[string]*Job{}, now: time.Now, gen: newJobID}
}

// Create allocates a new job in pending state and returns its id.
func (r *Registry) Create(tenant repos.TenantId, typeID repos.TypeId) *Job {
	j := &Job{
		ID:         r.gen(),
		Tenant:     tenant,
		ObjectType: typeID,
		Status:     JobPending,
		StartedAt:  r.now().UTC(),
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.jobs[j.ID] = j
	return j.clone()
}

// MarkRunning transitions a job from pending to running.
func (r *Registry) MarkRunning(id string) {
	r.update(id, func(j *Job) {
		j.Status = JobRunning
		j.StartedAt = r.now().UTC()
	})
}

// Complete records a successful (or partial) backfill result.
func (r *Registry) Complete(id string, res Result) {
	r.update(id, func(j *Job) {
		j.Status = JobCompleted
		j.TotalRead = res.TotalRead
		j.Indexed = res.Indexed
		j.Failed = res.Failed
		j.CompletedAt = res.CompletedAt
		j.DurationMS = res.Duration.Milliseconds()
		j.LastError = res.LastError
	})
}

// Fail records a transport-level failure.
func (r *Registry) Fail(id string, res Result, err error) {
	r.update(id, func(j *Job) {
		j.Status = JobFailed
		j.TotalRead = res.TotalRead
		j.Indexed = res.Indexed
		j.Failed = res.Failed
		j.CompletedAt = r.now().UTC()
		j.DurationMS = j.CompletedAt.Sub(j.StartedAt).Milliseconds()
		if err != nil {
			j.Error = err.Error()
		}
		j.LastError = res.LastError
	})
}

// Get returns a snapshot copy of the job. Returns nil if not found.
func (r *Registry) Get(id string) *Job {
	r.mu.RLock()
	defer r.mu.RUnlock()
	j, ok := r.jobs[id]
	if !ok {
		return nil
	}
	return j.clone()
}

// List returns snapshots of every job; insertion order is not preserved.
func (r *Registry) List() []*Job {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Job, 0, len(r.jobs))
	for _, j := range r.jobs {
		out = append(out, j.clone())
	}
	return out
}

func (r *Registry) update(id string, fn func(*Job)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j, ok := r.jobs[id]; ok {
		fn(j)
	}
}

func (j *Job) clone() *Job {
	cp := *j
	return &cp
}

func newJobID() string {
	var buf [12]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}
