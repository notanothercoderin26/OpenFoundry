package ratelimit_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/edge-gateway-service/internal/middleware/ratelimit"
)

func TestMemoryStoreFirstHitAllowedAndDecrements(t *testing.T) {
	t.Parallel()
	s := ratelimit.NewMemoryStore(0)
	out, err := s.Allow("k", 60, 5)
	require.NoError(t, err)
	assert.True(t, out.Allowed)
	assert.Equal(t, uint32(60), out.Limit)
	// Burst capacity is 5; we consumed 1 → remaining floor = 4.
	assert.Equal(t, uint32(4), out.Remaining)
}

func TestMemoryStoreExhaustsBurstThenDenies(t *testing.T) {
	t.Parallel()
	s := ratelimit.NewMemoryStore(0)
	for i := 0; i < 3; i++ {
		out, err := s.Allow("k", 60, 3)
		require.NoError(t, err)
		assert.True(t, out.Allowed, "burst hit %d should be allowed", i+1)
	}
	out, err := s.Allow("k", 60, 3)
	require.NoError(t, err)
	assert.False(t, out.Allowed, "fourth hit must be rate-limited")
	assert.Greater(t, out.ResetAfter, time.Duration(0))
}

func TestMemoryStoreSeparatesKeys(t *testing.T) {
	t.Parallel()
	s := ratelimit.NewMemoryStore(0)
	for i := 0; i < 2; i++ {
		out, _ := s.Allow("a", 60, 2)
		require.True(t, out.Allowed)
	}
	// Bucket A is now empty, but B is fresh.
	out, err := s.Allow("b", 60, 2)
	require.NoError(t, err)
	assert.True(t, out.Allowed)
}

func TestMemoryStoreLimitZeroDeniesAll(t *testing.T) {
	t.Parallel()
	s := ratelimit.NewMemoryStore(0)
	out, err := s.Allow("k", 0, 10)
	require.NoError(t, err)
	assert.False(t, out.Allowed)
}

// TestMiddlewareIgnoresClientForwardedHeadersByDefault verifies that
// with TrustForwardedHeaders=false (secure default) the anonymous
// bucket is keyed off the direct peer, so a caller cannot rotate a
// spoofed X-Forwarded-For to dodge the rate limit.
func TestMiddlewareIgnoresClientForwardedHeadersByDefault(t *testing.T) {
	t.Parallel()
	store := ratelimit.NewMemoryStore(0)
	cfg := ratelimit.Config{
		AnonymousRequestsPerMinute: 60,
		BurstSize:                  2,
		BucketTTL:                  time.Minute,
		// TrustForwardedHeaders default: false.
	}
	mw := ratelimit.Middleware(cfg, store)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Burst is 2; if the spoofed XFF were honoured each request would
	// land in its own bucket and never trip the limiter. With the secure
	// default they all share the same peer-keyed bucket → third 429.
	do := func(xff string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/anything", nil)
		req.RemoteAddr = "10.0.0.1:55555"
		req.Header.Set("X-Forwarded-For", xff)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr.Code
	}
	assert.Equal(t, http.StatusOK, do("1.1.1.1"))
	assert.Equal(t, http.StatusOK, do("2.2.2.2"))
	assert.Equal(t, http.StatusTooManyRequests, do("3.3.3.3"),
		"spoofed X-Forwarded-For must not shift the rate-limit bucket")
}

// TestMiddlewareHonoursForwardedHeadersWhenTrusted verifies that with
// TrustForwardedHeaders=true (canonical k8s-behind-ingress deploy)
// distinct client IPs from the trusted X-Forwarded-For chain get
// distinct buckets, so legitimate per-client throttling works through
// a shared ingress IP.
func TestMiddlewareHonoursForwardedHeadersWhenTrusted(t *testing.T) {
	t.Parallel()
	store := ratelimit.NewMemoryStore(0)
	cfg := ratelimit.Config{
		AnonymousRequestsPerMinute: 60,
		BurstSize:                  2,
		BucketTTL:                  time.Minute,
		TrustForwardedHeaders:      true,
	}
	mw := ratelimit.Middleware(cfg, store)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// All requests share the same peer (the ingress) but distinct
	// original-client IPs in the trusted XFF chain → separate buckets.
	do := func(xff string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/anything", nil)
		req.RemoteAddr = "10.0.0.1:55555"
		req.Header.Set("X-Forwarded-For", xff)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr.Code
	}
	// Burn the burst (2) on client A — third hit is throttled.
	assert.Equal(t, http.StatusOK, do("1.1.1.1"))
	assert.Equal(t, http.StatusOK, do("1.1.1.1"))
	assert.Equal(t, http.StatusTooManyRequests, do("1.1.1.1"))
	// Client B starts fresh.
	assert.Equal(t, http.StatusOK, do("2.2.2.2"))
	assert.Equal(t, http.StatusOK, do("2.2.2.2"))
	assert.Equal(t, http.StatusTooManyRequests, do("2.2.2.2"))
}
