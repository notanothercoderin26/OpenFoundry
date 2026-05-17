package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
)

// Sealer wraps an AES-256-GCM AEAD keyed by MFA_AT_REST_KEY for
// encrypting TOTP secrets at rest.
//
// The key is expected to be 32 raw bytes carried as standard base64.
// Nonces are 12 random bytes, persisted alongside the ciphertext.
type Sealer struct{ aead cipher.AEAD }

// ErrSealerNotConfigured is returned by handler code when a sealing
// operation is attempted without a configured key. Callers map it to
// HTTP 503 so operators see the misconfiguration.
var ErrSealerNotConfigured = errors.New("mfa: at-rest sealer not configured")

// ErrSealerOpen is returned when AES-GCM authentication fails (wrong
// key, tampered ciphertext, or mismatched nonce).
var ErrSealerOpen = errors.New("mfa: failed to open sealed secret")

// NewSealerFromBase64Key parses a standard-base64 32-byte key and
// returns a ready-to-use Sealer.
func NewSealerFromBase64Key(key string) (*Sealer, error) {
	if key == "" {
		return nil, ErrSealerNotConfigured
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return nil, fmt.Errorf("decode MFA_AT_REST_KEY: %w", err)
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("MFA_AT_REST_KEY must decode to 32 bytes, got %d", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, fmt.Errorf("aes cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm: %w", err)
	}
	return &Sealer{aead: aead}, nil
}

// Seal encrypts plaintext with a fresh random nonce. Returns
// (ciphertext, nonce); both are persisted in user_mfa_totp.
func (s *Sealer) Seal(plaintext []byte) (ciphertext, nonce []byte, err error) {
	if s == nil || s.aead == nil {
		return nil, nil, ErrSealerNotConfigured
	}
	nonce = make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, fmt.Errorf("rand nonce: %w", err)
	}
	ct := s.aead.Seal(nil, nonce, plaintext, nil)
	return ct, nonce, nil
}

// Open decrypts ciphertext using the previously persisted nonce.
// Returns ErrSealerOpen on any auth failure; the caller MUST NOT
// leak the underlying GCM error into responses or logs.
func (s *Sealer) Open(ciphertext, nonce []byte) ([]byte, error) {
	if s == nil || s.aead == nil {
		return nil, ErrSealerNotConfigured
	}
	pt, err := s.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrSealerOpen
	}
	return pt, nil
}
