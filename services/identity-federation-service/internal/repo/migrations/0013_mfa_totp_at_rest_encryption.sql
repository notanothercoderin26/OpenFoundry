-- identity-federation-service: at-rest encryption + replay protection
-- for TOTP secrets (additive to slice-3 user_mfa_totp).
--
-- New rows store the secret as AES-GCM ciphertext + 12-byte nonce
-- under MFA_AT_REST_KEY; the legacy plaintext `secret` column stays
-- for backward compatibility and is set to '' for new enrolments.
--
-- last_used_counter / last_used_at gate RFC 6238 replay: a TOTP code
-- is only accepted when its 30-second counter is strictly greater
-- than the last counter we observed for the user.

ALTER TABLE user_mfa_totp
    ADD COLUMN IF NOT EXISTS secret_encrypted  BYTEA,
    ADD COLUMN IF NOT EXISTS secret_nonce      BYTEA,
    ADD COLUMN IF NOT EXISTS last_used_counter BIGINT,
    ADD COLUMN IF NOT EXISTS last_used_at      TIMESTAMPTZ;

ALTER TABLE user_mfa_totp ALTER COLUMN secret DROP NOT NULL;
ALTER TABLE user_mfa_totp ALTER COLUMN secret SET DEFAULT '';
