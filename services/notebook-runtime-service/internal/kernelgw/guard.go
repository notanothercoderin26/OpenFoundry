package kernelgw

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

// ExecuteGuard authorizes a notebook execute call.
//
// The proper backing is Cedar (action="execute", resource=Notebook(rid),
// principal=User(claims.Sub)) wired through libs/authz-cedar-go. Until
// the AuthzEngine + bundled policies land for this service, NoopGuard
// is the default — it allows the call and logs a debug breadcrumb so
// the gap is visible in audit logs.
type ExecuteGuard interface {
	AuthorizeExecute(ctx context.Context, claims *authmw.Claims, notebookID uuid.UUID) error
}

// ErrExecuteForbidden is the well-known sentinel handlers translate
// into a 403 Forbidden.
var ErrExecuteForbidden = errors.New("kernelgw: execute forbidden")

// NoopGuard allows every authenticated call. It logs at debug.
type NoopGuard struct {
	Log *slog.Logger
}

func (g NoopGuard) AuthorizeExecute(_ context.Context, claims *authmw.Claims, notebookID uuid.UUID) error {
	if claims == nil {
		return ErrExecuteForbidden
	}
	if g.Log != nil {
		g.Log.Debug("kernelgw: noop execute guard allow (cedar engine not wired)",
			slog.String("principal", claims.Sub.String()),
			slog.String("notebook_id", notebookID.String()))
	}
	return nil
}
