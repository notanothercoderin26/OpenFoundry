package models

import (
	"time"

	"github.com/google/uuid"
)

// TOTPConfig is the wire type for the `user_mfa_totp` row.
//
// Storage rules:
//   - Rows enrolled after migration 0013 carry the secret in
//     `SecretEncrypted` + `SecretNonce` (AES-256-GCM under
//     MFA_AT_REST_KEY) and leave `Secret` empty.
//   - Pre-0013 rows still carry the legacy plaintext base32 in
//     `Secret`. Verification falls back to it when SecretEncrypted
//     is nil. On the next enroll cycle the row is re-stored encrypted.
//
// `LastUsedCounter` is the absolute 30-second RFC 6238 counter of
// the most recently accepted code; the verifier rejects any new code
// whose matching counter is <= this value (replay protection).
type TOTPConfig struct {
	UserID             uuid.UUID  `json:"user_id"`
	Secret             string     `json:"-"` // never serialised
	SecretEncrypted    []byte     `json:"-"`
	SecretNonce        []byte     `json:"-"`
	RecoveryCodeHashes []string   `json:"recovery_code_hashes"`
	Enabled            bool       `json:"enabled"`
	VerifiedAt         *time.Time `json:"verified_at,omitempty"`
	LastUsedCounter    *int64     `json:"-"`
	LastUsedAt         *time.Time `json:"last_used_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// MFAStatusResponse is the payload of GET /auth/mfa/status.
type MFAStatusResponse struct {
	TOTPEnabled        bool `json:"totp_enabled"`
	WebAuthnConfigured bool `json:"webauthn_configured"`
}

// EnrollTOTPResponse is the payload of POST /auth/mfa/totp/enroll.
//
// Returns the secret + recovery codes ONCE — clients must persist them
// because they are never available again from the server.
type EnrollTOTPResponse struct {
	Secret        string   `json:"secret"`
	RecoveryCodes []string `json:"recovery_codes"`
	OTPAuthURI    string   `json:"otpauth_uri"`
}

// VerifyTOTPRequest is the body of POST /auth/mfa/totp/verify.
type VerifyTOTPRequest struct {
	Code string `json:"code"`
}

// CompleteLoginRequest is the body of POST /auth/mfa/totp/complete-login.
type CompleteLoginRequest struct {
	ChallengeToken string `json:"challenge_token"`
	Code           string `json:"code"`
	RecoveryCode   string `json:"recovery_code,omitempty"`
}

// FactorType enumerates the values stored in the MFA `type` discriminator
// (forward-compatible with a generic mfa_factors table).
const (
	FactorTypeTOTP     = "totp"
	FactorTypeWebAuthn = "webauthn"
)

// Factor is the wire shape returned by GET /auth/mfa/factors.
type Factor struct {
	Type        string     `json:"type"`
	Enabled     bool       `json:"enabled"`
	ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
}

// ListFactorsResponse is the payload of GET /auth/mfa/factors.
type ListFactorsResponse struct {
	Factors []Factor `json:"factors"`
}
