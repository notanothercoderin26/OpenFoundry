package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/models"
)

// ErrSubscriptionNotFound surfaces from Get / Delete when the id is
// not in the table; handlers map this to 404.
var ErrSubscriptionNotFound = errors.New("subscription not found")

// ErrEventNotFound surfaces from GetEvent / ListDeliveries when the
// event id is not in the table.
var ErrEventNotFound = errors.New("event not found")

// SubscriptionsRepo wraps the SQL surface for the B05 fan-out trio
// (subscriptions / events / event_deliveries).
type SubscriptionsRepo struct{ Pool *pgxpool.Pool }

const subColsRead = `id, event_type, channel, target, template,
                     hmac_secret, sla_seconds, escalation_target,
                     enabled, created_at, updated_at`

const deliveryColsRead = `id, event_id, subscription_id, channel, target,
                          status, attempt, max_attempts, last_error,
                          signature_header, scheduled_at, last_attempt_at,
                          response, sla_due_at, escalation_target, escalated_at,
                          created_at, updated_at`

func scanSubscription(row pgx.Row) (*models.Subscription, error) {
	var (
		s             models.Subscription
		template      []byte
		hmacSecret    *string
		slaSeconds    *int32
		escalationTgt *string
	)
	err := row.Scan(
		&s.ID, &s.EventType, &s.Channel, &s.Target, &template,
		&hmacSecret, &slaSeconds, &escalationTgt,
		&s.Enabled, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(template) > 0 {
		s.Template = json.RawMessage(template)
	} else {
		s.Template = json.RawMessage(`{}`)
	}
	s.HMACSecret = hmacSecret
	s.HasHMACSecret = hmacSecret != nil && *hmacSecret != ""
	s.SLASeconds = slaSeconds
	s.EscalationTarget = escalationTgt
	return &s, nil
}

// CreateSubscription inserts a subscription and returns the row.
func (r *SubscriptionsRepo) CreateSubscription(ctx context.Context, body models.CreateSubscriptionRequest) (*models.Subscription, error) {
	if body.EventType == "" {
		return nil, fmt.Errorf("event_type is required")
	}
	if !body.Channel.IsValid() {
		return nil, fmt.Errorf("unknown channel %q", body.Channel)
	}
	if strings.TrimSpace(body.Target) == "" {
		return nil, fmt.Errorf("target is required")
	}
	template := body.Template
	if len(template) == 0 {
		template = json.RawMessage(`{}`)
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO notification_subscriptions
		    (id, event_type, channel, target, template,
		     hmac_secret, sla_seconds, escalation_target, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING `+subColsRead,
		uuid.New(), body.EventType, string(body.Channel), body.Target, []byte(template),
		body.HMACSecret, body.SLASeconds, body.EscalationTarget, enabled,
	)
	return scanSubscription(row)
}

// ListSubscriptions returns every subscription, newest first. When
// eventType is non-empty, narrows to that event_type.
func (r *SubscriptionsRepo) ListSubscriptions(ctx context.Context, eventType string) ([]models.Subscription, error) {
	q := "SELECT " + subColsRead + " FROM notification_subscriptions"
	var args []any
	if eventType != "" {
		q += " WHERE event_type = $1"
		args = append(args, eventType)
	}
	q += " ORDER BY created_at DESC"
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Subscription, 0)
	for rows.Next() {
		s, err := scanSubscription(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

// GetSubscription returns one row or ErrSubscriptionNotFound.
func (r *SubscriptionsRepo) GetSubscription(ctx context.Context, id uuid.UUID) (*models.Subscription, error) {
	row := r.Pool.QueryRow(ctx,
		"SELECT "+subColsRead+" FROM notification_subscriptions WHERE id = $1", id)
	s, err := scanSubscription(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSubscriptionNotFound
	}
	return s, err
}

// DeleteSubscription is idempotent: returns nil even if no row was
// deleted, so a stale UI session that already removed it does not
// surface an error.
func (r *SubscriptionsRepo) DeleteSubscription(ctx context.Context, id uuid.UUID) error {
	_, err := r.Pool.Exec(ctx, "DELETE FROM notification_subscriptions WHERE id = $1", id)
	return err
}

// MatchingSubscriptions returns the enabled subscriptions whose
// event_type matches.
func (r *SubscriptionsRepo) MatchingSubscriptions(ctx context.Context, eventType string) ([]models.Subscription, error) {
	rows, err := r.Pool.Query(ctx,
		"SELECT "+subColsRead+
			" FROM notification_subscriptions WHERE event_type = $1 AND enabled = TRUE",
		eventType,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Subscription, 0)
	for rows.Next() {
		s, err := scanSubscription(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

// InsertEvent persists the inbound event.
func (r *SubscriptionsRepo) InsertEvent(ctx context.Context, eventType string, payload json.RawMessage, source *string) (*models.Event, error) {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO notification_events (id, event_type, payload, source)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, event_type, payload, source, created_at`,
		uuid.New(), eventType, []byte(payload), source,
	)
	var (
		e       models.Event
		payOut  []byte
		srcOut  *string
	)
	if err := row.Scan(&e.ID, &e.EventType, &payOut, &srcOut, &e.CreatedAt); err != nil {
		return nil, err
	}
	e.Payload = json.RawMessage(payOut)
	e.Source = srcOut
	return &e, nil
}

// GetEvent loads one event by id, or ErrEventNotFound.
func (r *SubscriptionsRepo) GetEvent(ctx context.Context, id uuid.UUID) (*models.Event, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, event_type, payload, source, created_at FROM notification_events WHERE id = $1`,
		id,
	)
	var (
		e       models.Event
		payOut  []byte
		srcOut  *string
	)
	if err := row.Scan(&e.ID, &e.EventType, &payOut, &srcOut, &e.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrEventNotFound
		}
		return nil, err
	}
	e.Payload = json.RawMessage(payOut)
	e.Source = srcOut
	return &e, nil
}

func scanDelivery(row pgx.Row) (*models.Delivery, error) {
	var (
		d                models.Delivery
		lastError        *string
		signature        *string
		lastAttemptAt    *time.Time
		response         *string
		slaDueAt         *time.Time
		escalationTarget *string
		escalatedAt      *time.Time
	)
	err := row.Scan(
		&d.ID, &d.EventID, &d.SubscriptionID, &d.Channel, &d.Target,
		&d.Status, &d.Attempt, &d.MaxAttempts, &lastError,
		&signature, &d.ScheduledAt, &lastAttemptAt,
		&response, &slaDueAt, &escalationTarget, &escalatedAt,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	d.LastError = lastError
	d.SignatureHeader = signature
	d.LastAttemptAt = lastAttemptAt
	d.Response = response
	d.SLADueAt = slaDueAt
	d.EscalationTarget = escalationTarget
	d.EscalatedAt = escalatedAt
	return &d, nil
}

// InsertDelivery creates the per-(event, subscription) delivery row.
func (r *SubscriptionsRepo) InsertDelivery(ctx context.Context, eventID, subID uuid.UUID, channel, target string, slaDueAt *time.Time, escalationTarget *string) (*models.Delivery, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO notification_event_deliveries
		    (id, event_id, subscription_id, channel, target,
		     status, attempt, max_attempts, scheduled_at,
		     sla_due_at, escalation_target)
		 VALUES ($1, $2, $3, $4, $5, 'pending', 0, 3, now(), $6, $7)
		 RETURNING `+deliveryColsRead,
		uuid.New(), eventID, subID, channel, target,
		slaDueAt, escalationTarget,
	)
	return scanDelivery(row)
}

// ListDeliveries returns every delivery row for an event, oldest first.
func (r *SubscriptionsRepo) ListDeliveries(ctx context.Context, eventID uuid.UUID) ([]models.Delivery, error) {
	rows, err := r.Pool.Query(ctx,
		"SELECT "+deliveryColsRead+
			" FROM notification_event_deliveries WHERE event_id = $1 ORDER BY created_at",
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Delivery, 0)
	for rows.Next() {
		d, err := scanDelivery(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

// ClaimDueDeliveries fetches up to `limit` deliveries whose status is
// pending/retrying and whose scheduled_at has passed. Uses
// `FOR UPDATE SKIP LOCKED` so concurrent workers don't double-attempt
// the same row.
func (r *SubscriptionsRepo) ClaimDueDeliveries(ctx context.Context, limit int) ([]models.Delivery, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+deliveryColsRead+`
		   FROM notification_event_deliveries
		  WHERE status IN ('pending', 'retrying')
		    AND scheduled_at <= now()
		  ORDER BY scheduled_at
		  LIMIT $1
		  FOR UPDATE SKIP LOCKED`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Delivery, 0, limit)
	for rows.Next() {
		d, err := scanDelivery(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

// MarkDeliveryAttempt updates one row's status + attempt counters. Used
// by the worker after each attempt; the previous row was claimed via
// ClaimDueDeliveries so this is safe under concurrent workers.
func (r *SubscriptionsRepo) MarkDeliveryAttempt(ctx context.Context, id uuid.UUID, status models.DeliveryStatus, attempt int32, scheduledAt time.Time, lastError, response, signature *string) (*models.Delivery, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE notification_event_deliveries
		    SET status = $2,
		        attempt = $3,
		        scheduled_at = $4,
		        last_attempt_at = now(),
		        last_error = $5,
		        response = $6,
		        signature_header = COALESCE($7, signature_header),
		        updated_at = now()
		  WHERE id = $1
		  RETURNING `+deliveryColsRead,
		id, string(status), attempt, scheduledAt, lastError, response, signature,
	)
	return scanDelivery(row)
}

// ClaimSLABreaches finds in-app deliveries whose SLA window has
// elapsed without an escalation, for the SLA worker to fire on.
func (r *SubscriptionsRepo) ClaimSLABreaches(ctx context.Context, limit int) ([]models.Delivery, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+deliveryColsRead+`
		   FROM notification_event_deliveries
		  WHERE escalated_at IS NULL
		    AND sla_due_at IS NOT NULL
		    AND sla_due_at <= now()
		    AND status IN ('pending', 'retrying', 'sent')
		  ORDER BY sla_due_at
		  LIMIT $1
		  FOR UPDATE SKIP LOCKED`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Delivery, 0, limit)
	for rows.Next() {
		d, err := scanDelivery(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

// MarkEscalated stamps escalated_at + flips status to `escalated`.
func (r *SubscriptionsRepo) MarkEscalated(ctx context.Context, id uuid.UUID) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE notification_event_deliveries
		    SET escalated_at = now(),
		        status = CASE WHEN status = 'sent' THEN 'sent' ELSE 'escalated' END,
		        updated_at = now()
		  WHERE id = $1`,
		id,
	)
	return err
}
