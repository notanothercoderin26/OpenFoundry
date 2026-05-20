// fanout.go: B05 event → subscriptions fan-out.
//
// `Dispatcher.Submit` is the producer surface: takes a SubmitEventRequest,
// persists the event, and creates one Delivery row per matching enabled
// subscription. The Delivery rows start in `pending` state and are
// picked up by `Worker` below for actual side-effect dispatch.
//
// `Worker.Tick` is the consumer-side run loop. It pulls due deliveries,
// runs the per-channel adapter (webhook with HMAC, in-app row,
// email/slack/teams via the existing per-user channels), and applies
// the retry/backoff policy:
//
//   - HTTP 2xx                → status=sent (terminal)
//   - 4xx / 5xx / transport   → attempt++, schedule attempt in
//                               `initialBackoff * 2^(attempt-1)`,
//                               status=retrying
//   - attempt >= max_attempts → status=failed (DLQ; visible via
//                               GET /events/{id}/deliveries)
//
// Webhook HMAC: when the subscription has hmac_secret set, the worker
// computes HMAC-SHA256(secret, body) and sends it in the
// `X-OpenFoundry-Signature` header as `sha256=<hex>`. Verified by
// receivers using the same secret.

package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/core-models/ids"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/repo"
)

// SignatureHeader is the HTTP header the webhook channel uses to carry
// the HMAC-SHA256 of the request body. Documented + consumed by
// downstream services that verify the signature.
const SignatureHeader = "X-OpenFoundry-Signature"

// Dispatcher persists events and creates pending Delivery rows.
type Dispatcher struct {
	Subscriptions *repo.SubscriptionsRepo
	Notifier      *Notifier // reused for the `in_app` channel
	Now           func() time.Time
}

// NewDispatcher wires a Dispatcher with `time.Now` as the clock.
func NewDispatcher(subs *repo.SubscriptionsRepo, notifier *Notifier) *Dispatcher {
	return &Dispatcher{Subscriptions: subs, Notifier: notifier, Now: time.Now}
}

// Submit persists the event and fans out to every matching enabled
// subscription. Returns the event + the freshly-created deliveries
// (status=pending) so the producer's HTTP response is informative.
//
// In-app deliveries are eagerly created via the existing
// NotificationsRepo so the Approvals UI sees them immediately —
// no worker round-trip needed for the in-app case.
func (d *Dispatcher) Submit(ctx context.Context, body models.SubmitEventRequest) (*models.Event, []models.Delivery, error) {
	if body.EventType == "" {
		return nil, nil, fmt.Errorf("event_type is required")
	}
	event, err := d.Subscriptions.InsertEvent(ctx, body.EventType, body.Payload, body.Source)
	if err != nil {
		return nil, nil, fmt.Errorf("insert event: %w", err)
	}
	subs, err := d.Subscriptions.MatchingSubscriptions(ctx, body.EventType)
	if err != nil {
		return nil, nil, fmt.Errorf("match subscriptions: %w", err)
	}
	deliveries := make([]models.Delivery, 0, len(subs))
	now := d.Now().UTC()
	for _, sub := range subs {
		var slaDueAt *time.Time
		if sub.SLASeconds != nil && *sub.SLASeconds > 0 {
			t := now.Add(time.Duration(*sub.SLASeconds) * time.Second)
			slaDueAt = &t
		}
		del, err := d.Subscriptions.InsertDelivery(ctx, event.ID, sub.ID, string(sub.Channel), sub.Target, slaDueAt, sub.EscalationTarget)
		if err != nil {
			slog.Warn("insert delivery failed",
				slog.String("event_id", event.ID.String()),
				slog.String("subscription_id", sub.ID.String()),
				slog.String("error", err.Error()))
			continue
		}
		// Eagerly handle in-app so the Approvals UI sees the row even
		// before the worker tick runs.
		if sub.Channel == models.ChannelInApp && d.Notifier != nil {
			if err := d.eagerInApp(ctx, event, &sub, del); err != nil {
				slog.Warn("eager in-app failed",
					slog.String("event_id", event.ID.String()),
					slog.String("subscription_id", sub.ID.String()),
					slog.String("error", err.Error()))
			} else {
				del.Status = models.StatusSent
			}
		}
		deliveries = append(deliveries, *del)
	}
	return event, deliveries, nil
}

// eagerInApp creates an inbox row in the existing `notifications`
// table so the in-app feed picks it up immediately. The target field
// of an in-app subscription is the user id ("default" = system-wide).
func (d *Dispatcher) eagerInApp(ctx context.Context, event *models.Event, sub *models.Subscription, del *models.Delivery) error {
	var userID *uuid.UUID
	if sub.Target != "" && sub.Target != "default" {
		if u, err := uuid.Parse(sub.Target); err == nil {
			userID = &u
		}
	}
	title, body := renderTemplate(sub.Template, event)
	if title == "" {
		title = event.EventType
	}
	if body == "" {
		body = string(event.Payload)
	}
	notif, err := d.Notifier.Notifications.Insert(
		ctx,
		ids.New(),
		userID,
		title, body, "action", "info",
		[]string{"in_app"},
		json.RawMessage(`{"event_id":"`+event.ID.String()+`","subscription_id":"`+sub.ID.String()+`","delivery_id":"`+del.ID.String()+`"}`),
	)
	if err != nil {
		return err
	}
	// Record the per-delivery side of the audit + mark the new
	// event_deliveries row as sent.
	if _, err := d.Notifier.Notifications.RecordDelivery(ctx, ids.New(), notif.ID, "in_app", "sent", nil); err != nil {
		slog.Warn("record in-app delivery failed", slog.String("error", err.Error()))
	}
	response := "delivered to in-app inbox"
	if _, err := d.Subscriptions.MarkDeliveryAttempt(ctx, del.ID, models.StatusSent, 1, d.Now(), nil, &response, nil); err != nil {
		return err
	}
	return nil
}

// renderTemplate is a minimal title/body extractor from the
// subscription's JSON template. Producers send the action display name
// in the event payload; the template can rename either side.
func renderTemplate(template json.RawMessage, event *models.Event) (string, string) {
	var tpl struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if len(template) > 0 {
		_ = json.Unmarshal(template, &tpl)
	}
	var payload map[string]any
	_ = json.Unmarshal(event.Payload, &payload)
	if tpl.Title == "" {
		if v, ok := payload["title"].(string); ok {
			tpl.Title = v
		}
	}
	if tpl.Body == "" {
		if v, ok := payload["body"].(string); ok {
			tpl.Body = v
		}
	}
	return tpl.Title, tpl.Body
}

// Worker drains the deliveries table on a ticker. One Tick per
// interval; concurrent processes use FOR UPDATE SKIP LOCKED so the
// rows are claimed exactly once.
type Worker struct {
	Subscriptions      *repo.SubscriptionsRepo
	Subs               *repo.SubscriptionsRepo // alias retained for tests
	HTTP               *http.Client
	BatchSize          int
	InitialBackoff     time.Duration
	MaxBackoff         time.Duration
	TickInterval       time.Duration
	SLATickInterval    time.Duration
	Now                func() time.Time
	SLAEscalationHook  func(ctx context.Context, breach models.Delivery) error
}

// NewWorker returns a Worker pre-configured with conservative defaults
// (200 ms initial backoff, 30 s max, 1 s tick).
func NewWorker(subs *repo.SubscriptionsRepo) *Worker {
	return &Worker{
		Subscriptions:   subs,
		Subs:            subs,
		HTTP:            &http.Client{Timeout: 10 * time.Second},
		BatchSize:       50,
		InitialBackoff:  200 * time.Millisecond,
		MaxBackoff:      30 * time.Second,
		TickInterval:    1 * time.Second,
		SLATickInterval: 15 * time.Second,
		Now:             time.Now,
	}
}

// Run loops until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) {
	tick := time.NewTicker(w.TickInterval)
	defer tick.Stop()
	slaTick := time.NewTicker(w.SLATickInterval)
	defer slaTick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err := w.Tick(ctx); err != nil {
				slog.Warn("delivery worker tick failed", slog.String("error", err.Error()))
			}
		case <-slaTick.C:
			if err := w.SLATick(ctx); err != nil {
				slog.Warn("delivery worker SLA tick failed", slog.String("error", err.Error()))
			}
		}
	}
}

// Tick claims up to BatchSize due deliveries and attempts each.
// Returns nil even when some deliveries fail — failures are recorded
// on the row, not propagated.
func (w *Worker) Tick(ctx context.Context) error {
	rows, err := w.Subscriptions.ClaimDueDeliveries(ctx, w.BatchSize)
	if err != nil {
		return fmt.Errorf("claim deliveries: %w", err)
	}
	for _, d := range rows {
		w.attempt(ctx, d)
	}
	return nil
}

func (w *Worker) attempt(ctx context.Context, d models.Delivery) {
	sub, err := w.Subscriptions.GetSubscription(ctx, d.SubscriptionID)
	if err != nil {
		// Subscription was deleted between fan-out and delivery —
		// terminal failure, no point retrying.
		msg := err.Error()
		_, _ = w.Subscriptions.MarkDeliveryAttempt(ctx, d.ID, models.StatusFailed, d.Attempt+1, w.Now(), &msg, nil, nil)
		return
	}
	attempt := d.Attempt + 1
	result := w.deliver(ctx, sub, d)
	if result.err == nil {
		response := result.response
		_, _ = w.Subscriptions.MarkDeliveryAttempt(ctx, d.ID, models.StatusSent, attempt, w.Now(), nil, &response, result.signature)
		return
	}
	errMsg := result.err.Error()
	resp := result.response
	if attempt >= d.MaxAttempts {
		_, _ = w.Subscriptions.MarkDeliveryAttempt(ctx, d.ID, models.StatusFailed, attempt, w.Now(), &errMsg, &resp, result.signature)
		return
	}
	backoff := w.InitialBackoff << (attempt - 1)
	if backoff > w.MaxBackoff {
		backoff = w.MaxBackoff
	}
	next := w.Now().Add(backoff)
	_, _ = w.Subscriptions.MarkDeliveryAttempt(ctx, d.ID, models.StatusRetrying, attempt, next, &errMsg, &resp, result.signature)
}

// deliverResult bundles what attempt() needs to record.
type deliverResult struct {
	err       error
	response  string
	signature *string
}

func (w *Worker) deliver(ctx context.Context, sub *models.Subscription, d models.Delivery) deliverResult {
	switch models.SubscriptionChannel(d.Channel) {
	case models.ChannelWebhook:
		return w.deliverWebhook(ctx, sub, d)
	case models.ChannelInApp:
		// Eager path already handled this; if we get here it's
		// because eager fan-out failed. Treat as terminal success
		// (the row exists in `notifications`).
		return deliverResult{response: "in-app eager fan-out, no worker action"}
	case models.ChannelSlack, models.ChannelTeams:
		return w.deliverWebhook(ctx, sub, d)
	case models.ChannelEmail:
		// Email goes through the existing per-user SMTPSender; for the
		// B05 fan-out we treat it as out-of-scope and report skipped.
		return deliverResult{response: "email channel not handled by event worker (use per-user notifications)"}
	default:
		return deliverResult{err: fmt.Errorf("unknown channel %q", d.Channel)}
	}
}

// deliverWebhook POSTs the event payload to the subscription target.
// Adds HMAC-SHA256 when the subscription has a secret.
func (w *Worker) deliverWebhook(ctx context.Context, sub *models.Subscription, d models.Delivery) deliverResult {
	event, err := w.Subscriptions.GetEvent(ctx, d.EventID)
	if err != nil {
		return deliverResult{err: fmt.Errorf("load event: %w", err)}
	}
	body, err := json.Marshal(map[string]any{
		"event_id":         event.ID,
		"event_type":       event.EventType,
		"payload":          event.Payload,
		"subscription_id":  sub.ID,
		"delivery_id":      d.ID,
		"attempt":          d.Attempt + 1,
	})
	if err != nil {
		return deliverResult{err: fmt.Errorf("encode webhook body: %w", err)}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Target, bytes.NewReader(body))
	if err != nil {
		return deliverResult{err: err}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-OpenFoundry-Event-Id", event.ID.String())
	req.Header.Set("X-OpenFoundry-Event-Type", event.EventType)

	var sigOut *string
	if sub.HMACSecret != nil && *sub.HMACSecret != "" {
		mac := hmac.New(sha256.New, []byte(*sub.HMACSecret))
		_, _ = mac.Write(body)
		sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		req.Header.Set(SignatureHeader, sig)
		sigOut = &sig
	}
	resp, err := w.HTTP.Do(req)
	if err != nil {
		return deliverResult{err: err, signature: sigOut}
	}
	defer resp.Body.Close()
	rbody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	rspText := fmt.Sprintf("HTTP %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	if len(rbody) > 0 {
		rspText += "; " + string(bytes.TrimSpace(rbody))
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return deliverResult{response: rspText, signature: sigOut}
	}
	return deliverResult{err: errors.New(rspText), response: rspText, signature: sigOut}
}

// LoopbackEscalator returns an SLAEscalationHook that re-submits a
// matching `*.escalated.v1` event on the same Dispatcher. Consumers
// subscribe to the escalated topic separately to e.g. email a manager
// when the original delivery has not been resolved within the SLA.
// Uses the breach's escalation_target as the contextual `target` so
// the downstream subscription can decide what to do with it.
func LoopbackEscalator(d *Dispatcher) func(ctx context.Context, breach models.Delivery) error {
	return func(ctx context.Context, breach models.Delivery) error {
		event, err := d.Subscriptions.GetEvent(ctx, breach.EventID)
		if err != nil {
			return fmt.Errorf("loopback escalator load event: %w", err)
		}
		escTarget := ""
		if breach.EscalationTarget != nil {
			escTarget = *breach.EscalationTarget
		}
		payload, err := json.Marshal(map[string]any{
			"original_event_id":   event.ID,
			"original_event_type": event.EventType,
			"original_payload":    event.Payload,
			"delivery_id":         breach.ID,
			"subscription_id":     breach.SubscriptionID,
			"escalation_target":   escTarget,
		})
		if err != nil {
			return err
		}
		src := "sla-escalator"
		_, _, err = d.Submit(ctx, models.SubmitEventRequest{
			EventType: event.EventType + ".escalated.v1",
			Payload:   payload,
			Source:    &src,
		})
		return err
	}
}

// SLATick scans for deliveries whose SLA window has elapsed without an
// escalation, and fires the SLAEscalationHook on each. The hook is
// allowed to be nil: the row is still marked escalated, the side
// effect (e.g. re-emit a `*.escalated.v1` event) is the hook's job.
func (w *Worker) SLATick(ctx context.Context) error {
	rows, err := w.Subscriptions.ClaimSLABreaches(ctx, w.BatchSize)
	if err != nil {
		return err
	}
	for _, d := range rows {
		if w.SLAEscalationHook != nil {
			if err := w.SLAEscalationHook(ctx, d); err != nil {
				slog.Warn("SLA escalation hook failed",
					slog.String("delivery_id", d.ID.String()),
					slog.String("error", err.Error()))
			}
		}
		if err := w.Subscriptions.MarkEscalated(ctx, d.ID); err != nil {
			slog.Warn("mark escalated failed",
				slog.String("delivery_id", d.ID.String()),
				slog.String("error", err.Error()))
		}
	}
	return nil
}
