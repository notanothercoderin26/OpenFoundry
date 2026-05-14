// Package audit emits structured audit events for iceberg-catalog-service.
//
// Mirrors services/iceberg-catalog-service/src/audit.rs. Each event is
// logged at INFO (or WARN for denials/security-relevant cases) with the
// `audit_event` slog key set so downstream collectors (audit-compliance-
// service) drain them in the same way they drain Rust-emitted events.
package audit

import (
	"log/slog"

	"github.com/google/uuid"
)

func auditAttrs(event string, kvs ...any) []any {
	out := make([]any, 0, len(kvs)+2)
	out = append(out, slog.String("audit_event", event))
	out = append(out, kvs...)
	return out
}

// OAuthTokenIssued records a successful token issuance from the OAuth2
// surface. `actor` is nil for client_credentials grants.
func OAuthTokenIssued(actor *uuid.UUID, grantType, scope string) {
	a := ""
	if actor != nil {
		a = actor.String()
	}
	slog.Info("iceberg oauth token issued",
		auditAttrs("iceberg.oauth_token.issued",
			slog.String("actor", a),
			slog.String("grant_type", grantType),
			slog.String("scope", scope))...)
}

// APITokenCreated records a long-lived `ofty_*` mint.
func APITokenCreated(actor, tokenID uuid.UUID, scopes []string) {
	slog.Info("iceberg api token created",
		auditAttrs("iceberg.api_token.created",
			slog.String("actor", actor.String()),
			slog.String("token_id", tokenID.String()),
			slog.Any("scopes", scopes))...)
}

// MarkingsUpdated records a marking replacement on a namespace or table.
func MarkingsUpdated(actor uuid.UUID, targetRID, scope string, before, after []string) {
	slog.Info("iceberg markings updated",
		auditAttrs("iceberg.markings.updated",
			slog.String("actor", actor.String()),
			slog.String("target_rid", targetRID),
			slog.String("scope", scope),
			slog.Any("before", before),
			slog.Any("after", after))...)
}

// MarkingsOverrideCreated fires when a new explicit table marking is
// added on top of (or in addition to) an inherited one.
func MarkingsOverrideCreated(actor uuid.UUID, tableRID, marking string) {
	slog.Info("iceberg markings override created",
		auditAttrs("iceberg.markings.override_created",
			slog.String("actor", actor.String()),
			slog.String("table_rid", tableRID),
			slog.String("marking", marking))...)
}

// AccessDenied records an authorization denial. `reason` is one of
// authz.DenialReason values (`missing_scope`, `missing_clearance`,
// `missing_role`, `out_of_tenant`, `unknown`).
func AccessDenied(actor uuid.UUID, targetRID, attemptedAction, reason string) {
	slog.Warn("iceberg access denied",
		auditAttrs("iceberg.access.denied",
			slog.String("actor", actor.String()),
			slog.String("target_rid", targetRID),
			slog.String("attempted_action", attemptedAction),
			slog.String("reason", reason))...)
}
