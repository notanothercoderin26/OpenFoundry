package authmw

import (
	"net/http"
	"time"
)

// AuditEmission is the side-channel record this package surfaces to
// the audit emitter on every authenticated request. The auth layer
// itself stays free of any direct dependency on libs/audit-trail —
// services compose them by passing an AuditHook to WithAudit.
//
// Fields are populated by the middleware after the inner handler has
// returned; consumers must not retain the request beyond Hook.Send.
type AuditEmission struct {
	Method     string
	Path       string
	Status     int
	Claims     *Claims
	StartedAt  time.Time
	DurationMS int64
	RemoteAddr string
	UserAgent  string
}

// AuditHook is the contract handler services implement to receive an
// AuditEmission after every authenticated request. Implementations
// should drop or queue — never block — to keep the auth middleware
// off the request critical path.
type AuditHook interface {
	Send(*http.Request, AuditEmission)
}

// AuditHookFunc adapts an ordinary function to AuditHook.
type AuditHookFunc func(*http.Request, AuditEmission)

func (f AuditHookFunc) Send(r *http.Request, e AuditEmission) { f(r, e) }

// WithAudit wraps an existing chi-compatible middleware (typically
// Middleware/AuthLayer) so that every request observed by the inner
// chain emits one AuditEmission through `hook`.
//
// The hook fires regardless of authentication outcome — anonymous
// requests carry Claims=nil so callers can branch on coverage. Errors
// raised by the hook are swallowed: the audit emission is a side
// effect, not a request gate.
//
// `hook` may be nil; the helper degrades to a pass-through so call
// sites can wire the chain unconditionally and flip emission on later.
func WithAudit(hook AuditHook) func(http.Handler) http.Handler {
	if hook == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &auditStatusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			claims, _ := FromContext(r.Context())
			defer func() { _ = recover() }()
			hook.Send(r, AuditEmission{
				Method:     r.Method,
				Path:       r.URL.Path,
				Status:     rec.status,
				Claims:     claims,
				StartedAt:  start,
				DurationMS: time.Since(start).Milliseconds(),
				RemoteAddr: r.RemoteAddr,
				UserAgent:  r.UserAgent(),
			})
		})
	}
}

// auditStatusRecorder captures the status code so the hook receives
// it even when the inner handler streams without an explicit
// WriteHeader call. Defaults to 200 — matches stdlib semantics.
type auditStatusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (r *auditStatusRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}
