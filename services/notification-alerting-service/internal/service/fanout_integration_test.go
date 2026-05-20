//go:build integration

// End-to-end fan-out coverage against a real Postgres (testcontainers).
// Validates B05 acceptance:
//   - #1: POST /subscriptions persists a row.
//   - #2: POST /events fans out to matching subscriptions, one
//     delivery row per match.
//   - #3: webhook channel signs + retries + DLQs after max attempts.
//   - #4: in-app channel writes a notification row eagerly so the
//     Approvals feed sees it without waiting for the worker.
//   - #6: SLA escalator re-emits a `*.escalated.v1` event when the
//     SLA window passes without resolution.

package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/repo"
)

func bootPg(t *testing.T) *repo.SubscriptionsRepo {
	t.Helper()
	ctx := context.Background()
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, h.Pool))
	return &repo.SubscriptionsRepo{Pool: h.Pool}
}

func bootDispatcher(t *testing.T) (*Dispatcher, *repo.SubscriptionsRepo, *repo.NotificationsRepo) {
	t.Helper()
	subs := bootPg(t)
	notifs := &repo.NotificationsRepo{Pool: subs.Pool}
	prefs := &repo.PreferencesRepo{Pool: subs.Pool}
	notifier := &Notifier{Notifications: notifs, Preferences: prefs}
	d := NewDispatcher(subs, notifier)
	return d, subs, notifs
}

func TestIntegration_DispatcherFansOutToMatchingSubscriptions(t *testing.T) {
	d, subs, _ := bootDispatcher(t)
	ctx := context.Background()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	_, err := subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.scheduled.v1", Channel: models.ChannelWebhook, Target: srv.URL,
	})
	require.NoError(t, err)
	_, err = subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.scheduled.v1", Channel: models.ChannelInApp, Target: "default",
	})
	require.NoError(t, err)
	// One subscription on a different event_type → must not match.
	_, err = subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.cancelled.v1", Channel: models.ChannelWebhook, Target: srv.URL,
	})
	require.NoError(t, err)

	event, deliveries, err := d.Submit(ctx, models.SubmitEventRequest{
		EventType: "action.scheduled.v1",
		Payload:   json.RawMessage(`{"title":"Schedule maintenance","body":"Aircraft N12345 due"}`),
	})
	require.NoError(t, err)
	require.NotNil(t, event)
	require.Len(t, deliveries, 2, "two matching subscriptions yield two delivery rows")
}

func TestIntegration_InAppDeliveryIsEagerAndCreatesNotificationRow(t *testing.T) {
	d, subs, notifs := bootDispatcher(t)
	ctx := context.Background()

	_, err := subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "approval.required.v1", Channel: models.ChannelInApp, Target: "default",
	})
	require.NoError(t, err)

	event, deliveries, err := d.Submit(ctx, models.SubmitEventRequest{
		EventType: "approval.required.v1",
		Payload:   json.RawMessage(`{"title":"Review pending","body":"PR #42 needs review"}`),
	})
	require.NoError(t, err)
	require.Len(t, deliveries, 1)
	assert.Equal(t, models.StatusSent, deliveries[0].Status, "in-app delivery is eager")

	// The notification row exists in the inbox. Subscription targeted
	// "default" → no user, fan-out left user_id NULL; the broadcast
	// row is visible to any caller via the (user_id = $1 OR user_id IS
	// NULL) predicate.
	list, err := notifs.List(ctx, uuid.New(), nil, 10)
	require.NoError(t, err)
	require.NotEmpty(t, list)
	assert.Equal(t, "Review pending", list[0].Title)

	// Audit row mirrors the eager success.
	deliveriesAudit, err := subs.ListDeliveries(ctx, event.ID)
	require.NoError(t, err)
	require.Len(t, deliveriesAudit, 1)
	assert.Equal(t, models.StatusSent, deliveriesAudit[0].Status)
}

func TestIntegration_WorkerDeliversWebhookWithHMAC(t *testing.T) {
	d, subs, _ := bootDispatcher(t)
	ctx := context.Background()

	var seenSig string
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		seenSig = r.Header.Get("X-OpenFoundry-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	secret := "secret-for-it"
	_, err := subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.scheduled.v1", Channel: models.ChannelWebhook,
		Target: srv.URL, HMACSecret: &secret,
	})
	require.NoError(t, err)

	_, _, err = d.Submit(ctx, models.SubmitEventRequest{
		EventType: "action.scheduled.v1",
		Payload:   json.RawMessage(`{"id":"42"}`),
	})
	require.NoError(t, err)

	worker := NewWorker(subs)
	worker.HTTP = srv.Client()
	worker.InitialBackoff = time.Millisecond
	require.NoError(t, worker.Tick(ctx))

	assert.Equal(t, int32(1), atomic.LoadInt32(&calls))
	assert.Contains(t, seenSig, "sha256=")
}

func TestIntegration_WorkerRetriesUntilDLQ(t *testing.T) {
	d, subs, _ := bootDispatcher(t)
	ctx := context.Background()

	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	_, err := subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.scheduled.v1", Channel: models.ChannelWebhook, Target: srv.URL,
	})
	require.NoError(t, err)

	event, _, err := d.Submit(ctx, models.SubmitEventRequest{
		EventType: "action.scheduled.v1",
		Payload:   json.RawMessage(`{}`),
	})
	require.NoError(t, err)

	worker := NewWorker(subs)
	worker.HTTP = srv.Client()
	worker.InitialBackoff = 0
	worker.MaxBackoff = 0

	// Tick three times; max_attempts defaults to 3 → terminal failed.
	for i := 0; i < 3; i++ {
		require.NoError(t, worker.Tick(ctx))
	}
	out, err := subs.ListDeliveries(ctx, event.ID)
	require.NoError(t, err)
	require.Len(t, out, 1)
	assert.Equal(t, models.StatusFailed, out[0].Status, "DLQ visible via ListDeliveries")
	assert.Equal(t, int32(3), out[0].Attempt)
	assert.Equal(t, int32(3), atomic.LoadInt32(&calls))
}

func TestIntegration_SLAEscalatorReEmitsOnBreach(t *testing.T) {
	d, subs, _ := bootDispatcher(t)
	ctx := context.Background()

	// Subscription with a very short SLA so the breach fires on the
	// first SLATick.
	sla := int32(0)
	escTgt := "manager@acme.example"
	_, err := subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType:        "action.scheduled.v1",
		Channel:          models.ChannelInApp,
		Target:           "default",
		SLASeconds:       &sla,
		EscalationTarget: &escTgt,
	})
	require.NoError(t, err)
	// Listener subscription for the escalated event.
	var escCalls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&escCalls, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	_, err = subs.CreateSubscription(ctx, models.CreateSubscriptionRequest{
		EventType: "action.scheduled.v1.escalated.v1", Channel: models.ChannelWebhook, Target: srv.URL,
	})
	require.NoError(t, err)

	_, _, err = d.Submit(ctx, models.SubmitEventRequest{
		EventType: "action.scheduled.v1",
		Payload:   json.RawMessage(`{"title":"escalation-target"}`),
	})
	require.NoError(t, err)

	// sla_due_at was set to `now()`; allow Postgres a tick of clock
	// movement so the SLA scan picks it up.
	time.Sleep(20 * time.Millisecond)

	worker := NewWorker(subs)
	worker.HTTP = srv.Client()
	worker.SLAEscalationHook = LoopbackEscalator(d)
	require.NoError(t, worker.SLATick(ctx))

	// The escalation hook re-submits — give the resulting webhook
	// delivery one Tick to ship.
	require.NoError(t, worker.Tick(ctx))
	assert.Equal(t, int32(1), atomic.LoadInt32(&escCalls), "escalation event re-submitted to escalated subscriber")
}

// helper kept on the file so the unused import audit does not flag
// google/uuid (we may add identifier-based assertions later).
var _ = uuid.New
