// Subscription / Event / Delivery wire types for the event-fan-out
// flow added in B05.
//
// The earlier `NotificationRecord` shape (notification.go) is the
// inbox-row view used by the in-app feed; this file's types are the
// pub/sub plumbing that produces those rows + the webhook/email/etc.
// deliveries that fan out alongside them.

package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// SubscriptionChannel enumerates how a subscription delivers.
type SubscriptionChannel string

const (
	ChannelInApp   SubscriptionChannel = "in_app"
	ChannelEmail   SubscriptionChannel = "email"
	ChannelWebhook SubscriptionChannel = "webhook"
	ChannelSlack   SubscriptionChannel = "slack"
	ChannelTeams   SubscriptionChannel = "teams"
)

// IsValid reports whether the channel is one we know how to deliver.
func (c SubscriptionChannel) IsValid() bool {
	switch c {
	case ChannelInApp, ChannelEmail, ChannelWebhook, ChannelSlack, ChannelTeams:
		return true
	}
	return false
}

// DeliveryStatus enumerates the lifecycle states for a per-(event,
// subscription) delivery row. Stable: handlers + the worker key off
// these values.
type DeliveryStatus string

const (
	StatusPending   DeliveryStatus = "pending"
	StatusRetrying  DeliveryStatus = "retrying"
	StatusSent      DeliveryStatus = "sent"
	StatusFailed    DeliveryStatus = "failed"
	StatusEscalated DeliveryStatus = "escalated"
)

// Subscription is the per-event-type subscriber declaration.
type Subscription struct {
	ID                uuid.UUID           `json:"id"`
	EventType         string              `json:"event_type"`
	Channel           SubscriptionChannel `json:"channel"`
	Target            string              `json:"target"`
	Template          json.RawMessage     `json:"template,omitempty"`
	HMACSecret        *string             `json:"-"`
	HasHMACSecret     bool                `json:"has_hmac_secret"`
	SLASeconds        *int32              `json:"sla_seconds,omitempty"`
	EscalationTarget  *string             `json:"escalation_target,omitempty"`
	Enabled           bool                `json:"enabled"`
	CreatedAt         time.Time           `json:"created_at"`
	UpdatedAt         time.Time           `json:"updated_at"`
}

// CreateSubscriptionRequest is the POST /subscriptions body.
type CreateSubscriptionRequest struct {
	EventType        string              `json:"event_type"`
	Channel          SubscriptionChannel `json:"channel"`
	Target           string              `json:"target"`
	Template         json.RawMessage     `json:"template,omitempty"`
	HMACSecret       *string             `json:"hmac_secret,omitempty"`
	SLASeconds       *int32              `json:"sla_seconds,omitempty"`
	EscalationTarget *string             `json:"escalation_target,omitempty"`
	Enabled          *bool               `json:"enabled,omitempty"`
}

// SubscriptionListResponse is the GET /subscriptions envelope.
type SubscriptionListResponse struct {
	Data []Subscription `json:"data"`
}

// Event is the inbound submission row.
type Event struct {
	ID        uuid.UUID       `json:"id"`
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	Source    *string         `json:"source,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// SubmitEventRequest is the POST /events body. Producers
// (ontology-actions-service, workflow-automation-service) call this.
type SubmitEventRequest struct {
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	Source    *string         `json:"source,omitempty"`
}

// SubmitEventResponse is what the producer gets back.
type SubmitEventResponse struct {
	Event      Event      `json:"event"`
	Deliveries []Delivery `json:"deliveries"`
}

// Delivery is one row of `notification_event_deliveries`.
type Delivery struct {
	ID               uuid.UUID      `json:"id"`
	EventID          uuid.UUID      `json:"event_id"`
	SubscriptionID   uuid.UUID      `json:"subscription_id"`
	Channel          string         `json:"channel"`
	Target           string         `json:"target"`
	Status           DeliveryStatus `json:"status"`
	Attempt          int32          `json:"attempt"`
	MaxAttempts      int32          `json:"max_attempts"`
	LastError        *string        `json:"last_error,omitempty"`
	SignatureHeader  *string        `json:"signature_header,omitempty"`
	ScheduledAt      time.Time      `json:"scheduled_at"`
	LastAttemptAt    *time.Time     `json:"last_attempt_at,omitempty"`
	Response         *string        `json:"response,omitempty"`
	SLADueAt         *time.Time     `json:"sla_due_at,omitempty"`
	EscalationTarget *string        `json:"escalation_target,omitempty"`
	EscalatedAt      *time.Time     `json:"escalated_at,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

// DeliveryListResponse is the GET /events/{id}/deliveries envelope.
type DeliveryListResponse struct {
	Data []Delivery `json:"data"`
}
