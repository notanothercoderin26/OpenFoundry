package repo

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
)

// FindTOTPConfig returns (nil, nil) when no row exists.
func (r *Repo) FindTOTPConfig(ctx context.Context, userID uuid.UUID) (*models.TOTPConfig, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT user_id, secret, secret_encrypted, secret_nonce,
		        recovery_code_hashes, enabled, verified_at,
		        last_used_counter, last_used_at, created_at, updated_at
		 FROM user_mfa_totp WHERE user_id = $1`,
		userID,
	)
	c := &models.TOTPConfig{}
	var hashesRaw []byte
	var legacySecret *string
	if err := row.Scan(&c.UserID, &legacySecret, &c.SecretEncrypted, &c.SecretNonce,
		&hashesRaw, &c.Enabled, &c.VerifiedAt,
		&c.LastUsedCounter, &c.LastUsedAt, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if legacySecret != nil {
		c.Secret = *legacySecret
	}
	if len(hashesRaw) > 0 {
		if err := json.Unmarshal(hashesRaw, &c.RecoveryCodeHashes); err != nil {
			return nil, err
		}
	}
	return c, nil
}

// UpsertTOTPSecretEncrypted stores the AES-GCM-sealed secret + nonce
// alongside the recovery hashes (enabled=false until verify). It also
// resets the legacy plaintext column to '' and clears any prior
// last_used bookkeeping so a fresh enrolment cannot be replayed by a
// captured pre-rotation code.
func (r *Repo) UpsertTOTPSecretEncrypted(ctx context.Context, userID uuid.UUID, secretEncrypted, nonce []byte, recoveryHashes []string) error {
	hashesJSON, err := json.Marshal(recoveryHashes)
	if err != nil {
		return err
	}
	_, err = r.Pool.Exec(ctx,
		`INSERT INTO user_mfa_totp (user_id, secret, secret_encrypted, secret_nonce, recovery_code_hashes, enabled)
		 VALUES ($1, '', $2, $3, $4, false)
		 ON CONFLICT (user_id) DO UPDATE SET
		   secret = '',
		   secret_encrypted = EXCLUDED.secret_encrypted,
		   secret_nonce = EXCLUDED.secret_nonce,
		   recovery_code_hashes = EXCLUDED.recovery_code_hashes,
		   enabled = false,
		   verified_at = NULL,
		   last_used_counter = NULL,
		   last_used_at = NULL,
		   updated_at = NOW()`,
		userID, secretEncrypted, nonce, hashesJSON,
	)
	return err
}

// RecordTOTPUsage stamps the counter + timestamp of an accepted code.
// Callers MUST have already checked counter > existing last_used_counter
// (see handlers/mfa.go); the UPDATE is unconditional so we capture
// the exact accepted window, not the request time bucket.
func (r *Repo) RecordTOTPUsage(ctx context.Context, userID uuid.UUID, counter int64, at time.Time) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE user_mfa_totp SET last_used_counter = $2, last_used_at = $3, updated_at = NOW() WHERE user_id = $1`,
		userID, counter, at,
	)
	return err
}

// EnableTOTP marks the configuration verified + enabled.
func (r *Repo) EnableTOTP(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE user_mfa_totp SET enabled = true, verified_at = $2, updated_at = NOW() WHERE user_id = $1`,
		userID, at,
	)
	return err
}

// DisableTOTP removes the row entirely.
func (r *Repo) DisableTOTP(ctx context.Context, userID uuid.UUID) error {
	_, err := r.Pool.Exec(ctx, `DELETE FROM user_mfa_totp WHERE user_id = $1`, userID)
	return err
}

// UpdateRecoveryHashes replaces the hashes (used after consuming a code).
func (r *Repo) UpdateRecoveryHashes(ctx context.Context, userID uuid.UUID, hashes []string) error {
	hashesJSON, err := json.Marshal(hashes)
	if err != nil {
		return err
	}
	_, err = r.Pool.Exec(ctx,
		`UPDATE user_mfa_totp SET recovery_code_hashes = $2, updated_at = NOW() WHERE user_id = $1`,
		userID, hashesJSON,
	)
	return err
}
