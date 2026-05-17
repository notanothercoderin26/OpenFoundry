package kernelgw

import (
	"context"
	"log/slog"
	"time"
)

// Clock is a tiny test seam — production wires in realClock{}, tests
// substitute a fake. Only the operations the GC actually uses (Now
// and Tick) are exposed; keep it small on purpose.
type Clock interface {
	Now() time.Time
	NewTicker(d time.Duration) Ticker
}

// Ticker mirrors the part of *time.Ticker the GC consumes.
type Ticker interface {
	C() <-chan time.Time
	Stop()
}

// SystemClock is the production Clock.
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }
func (SystemClock) NewTicker(d time.Duration) Ticker {
	t := time.NewTicker(d)
	return realTicker{t: t}
}

type realTicker struct{ t *time.Ticker }

func (r realTicker) C() <-chan time.Time { return r.t.C }
func (r realTicker) Stop()                { r.t.Stop() }

// GC reaps upstream kernels whose mapping rows have last_activity
// older than IdleTimeout. It deletes the upstream kernel via Client,
// then drops the local mapping row. Errors are logged but never panic
// the loop — one bad sweep must not stop future sweeps.
type GC struct {
	Repo        MappingRepo
	Client      *Client
	IdleTimeout time.Duration
	Interval    time.Duration
	Log         *slog.Logger
	Clock       Clock
}

// Run loops until ctx is cancelled. SweepOnce can be called directly
// from tests with a fake clock.
func (g *GC) Run(ctx context.Context) {
	if g.Clock == nil {
		g.Clock = SystemClock{}
	}
	if g.Interval <= 0 {
		g.Interval = 60 * time.Second
	}
	if g.IdleTimeout <= 0 {
		g.IdleTimeout = 30 * time.Minute
	}
	t := g.Clock.NewTicker(g.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C():
			g.SweepOnce(ctx)
		}
	}
}

// SweepOnce performs a single GC sweep. Exposed for unit tests.
func (g *GC) SweepOnce(ctx context.Context) {
	if g.Clock == nil {
		g.Clock = SystemClock{}
	}
	cutoff := g.Clock.Now().Add(-g.IdleTimeout)
	stale, err := g.Repo.ListIdleBefore(ctx, cutoff)
	if err != nil {
		if g.Log != nil {
			g.Log.Warn("kernelgw GC: list stale failed", slog.String("error", err.Error()))
		}
		return
	}
	for _, m := range stale {
		if err := g.Client.DeleteKernel(ctx, m.GatewayKernelID); err != nil {
			if g.Log != nil {
				g.Log.Warn("kernelgw GC: delete upstream kernel failed",
					slog.String("session_id", m.SessionID.String()),
					slog.String("kernel_id", m.GatewayKernelID),
					slog.String("error", err.Error()))
			}
			// Don't drop the mapping when the gateway is unreachable —
			// the next sweep will retry.
			continue
		}
		if err := g.Repo.DeleteBySession(ctx, m.SessionID); err != nil {
			if g.Log != nil {
				g.Log.Warn("kernelgw GC: delete mapping failed",
					slog.String("session_id", m.SessionID.String()),
					slog.String("error", err.Error()))
			}
			continue
		}
		if g.Log != nil {
			g.Log.Info("kernelgw GC: reaped idle kernel",
				slog.String("session_id", m.SessionID.String()),
				slog.String("kernel_id", m.GatewayKernelID),
				slog.Time("last_activity", m.LastActivity))
		}
	}
}
