package authmw

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWithAuditNilHookIsPassThrough(t *testing.T) {
	t.Parallel()
	called := false
	mw := WithAudit(nil)
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(204)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/x", nil))
	assert.True(t, called)
	assert.Equal(t, 204, rec.Code)
}

func TestWithAuditCapturesStatusAndPath(t *testing.T) {
	t.Parallel()
	var (
		mu    sync.Mutex
		emits []AuditEmission
	)
	hook := AuditHookFunc(func(_ *http.Request, e AuditEmission) {
		mu.Lock()
		defer mu.Unlock()
		emits = append(emits, e)
	})
	mw := WithAudit(hook)
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})

	rec := httptest.NewRecorder()
	mw(inner).ServeHTTP(rec, httptest.NewRequest("POST", "/api/v1/x", nil))

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, emits, 1)
	assert.Equal(t, http.StatusTeapot, emits[0].Status)
	assert.Equal(t, "POST", emits[0].Method)
	assert.Equal(t, "/api/v1/x", emits[0].Path)
	assert.Nil(t, emits[0].Claims, "anonymous request: Claims must be nil")
}

func TestWithAuditDefaultsStatusTo200(t *testing.T) {
	t.Parallel()
	var got int
	hook := AuditHookFunc(func(_ *http.Request, e AuditEmission) { got = e.Status })
	mw := WithAudit(hook)
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mw(inner).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	assert.Equal(t, 200, got, "implicit 200 must be captured even without WriteHeader")
}

func TestWithAuditSwallowsHookPanic(t *testing.T) {
	t.Parallel()
	var invocations atomic.Int32
	hook := AuditHookFunc(func(*http.Request, AuditEmission) {
		invocations.Add(1)
		panic("hook explosion")
	})
	mw := WithAudit(hook)
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })

	rec := httptest.NewRecorder()
	// Panic in the hook must not bubble up — the handler chain has
	// already responded by the time the hook fires.
	require.NotPanics(t, func() {
		mw(inner).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	})
	assert.Equal(t, int32(1), invocations.Load())
}
