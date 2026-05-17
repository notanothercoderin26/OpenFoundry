package handlers

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// RateLimiter is a token-bucket limiter keyed by (subject, model_rid).
// Each (subject, model) pair gets its own bucket sized at Capacity with
// RefillPerSecond tokens added per second up to Capacity. Allow returns
// false when the bucket is empty — the invoke handler maps that to 429.
//
// In-memory only: a horizontally scaled deployment needs a Redis-backed
// implementation (follow-up). The interface stays the same so the
// handler does not change when that lands.
type RateLimiter struct {
	Capacity        float64
	RefillPerSecond float64

	mu      sync.Mutex
	buckets map[bucketKey]*bucket
	now     func() time.Time // injectable for tests
}

type bucketKey struct {
	subject string
	model   uuid.UUID
}

type bucket struct {
	tokens   float64
	lastSeen time.Time
}

// SetClock replaces the limiter's time source. Tests use this to
// advance time deterministically; production callers leave the default.
func SetClock(l *RateLimiter, now func() time.Time) {
	if l == nil || now == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.now = now
}

// NewRateLimiter returns a limiter with the given capacity + refill
// rate. Values <= 0 disable rate limiting entirely (Allow always
// returns true).
func NewRateLimiter(capacity, refillPerSecond float64) *RateLimiter {
	return &RateLimiter{
		Capacity:        capacity,
		RefillPerSecond: refillPerSecond,
		buckets:         map[bucketKey]*bucket{},
		now:             time.Now,
	}
}

// Allow reserves one token for (subject, model). Returns true when a
// token was available, false when the caller has exhausted the bucket.
// A zero-valued limiter (and one with Capacity <= 0) always allows.
func (l *RateLimiter) Allow(subject string, model uuid.UUID) bool {
	if l == nil || l.Capacity <= 0 {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	key := bucketKey{subject: subject, model: model}
	b, ok := l.buckets[key]
	now := l.now()
	if !ok {
		b = &bucket{tokens: l.Capacity, lastSeen: now}
		l.buckets[key] = b
	} else {
		elapsed := now.Sub(b.lastSeen).Seconds()
		b.tokens += elapsed * l.RefillPerSecond
		if b.tokens > l.Capacity {
			b.tokens = l.Capacity
		}
		b.lastSeen = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
