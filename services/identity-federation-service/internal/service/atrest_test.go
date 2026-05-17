package service_test

import (
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/service"
)

func newKeyB64(t *testing.T) string {
	t.Helper()
	k := make([]byte, 32)
	_, err := rand.Read(k)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(k)
}

func TestSealerRoundTrip(t *testing.T) {
	t.Parallel()
	s, err := service.NewSealerFromBase64Key(newKeyB64(t))
	require.NoError(t, err)

	plaintext := []byte("JBSWY3DPEHPK3PXP")
	ct, nonce, err := s.Seal(plaintext)
	require.NoError(t, err)
	assert.NotEqual(t, plaintext, ct, "ciphertext must differ from plaintext")
	assert.Len(t, nonce, 12, "GCM standard nonce size is 12 bytes")

	got, err := s.Open(ct, nonce)
	require.NoError(t, err)
	assert.Equal(t, plaintext, got)
}

func TestSealerNonceUnique(t *testing.T) {
	t.Parallel()
	s, err := service.NewSealerFromBase64Key(newKeyB64(t))
	require.NoError(t, err)

	_, n1, err := s.Seal([]byte("x"))
	require.NoError(t, err)
	_, n2, err := s.Seal([]byte("x"))
	require.NoError(t, err)
	assert.NotEqual(t, n1, n2, "each Seal call must mint a fresh random nonce")
}

func TestSealerRejectsWrongKey(t *testing.T) {
	t.Parallel()
	s1, err := service.NewSealerFromBase64Key(newKeyB64(t))
	require.NoError(t, err)
	s2, err := service.NewSealerFromBase64Key(newKeyB64(t))
	require.NoError(t, err)

	ct, nonce, err := s1.Seal([]byte("secret-data"))
	require.NoError(t, err)
	_, err = s2.Open(ct, nonce)
	assert.ErrorIs(t, err, service.ErrSealerOpen,
		"AEAD auth must fail when the key differs — and we must surface ErrSealerOpen so handler code can map it to 5xx without leaking the underlying cipher error")
}

func TestSealerRejectsTamperedCiphertext(t *testing.T) {
	t.Parallel()
	s, err := service.NewSealerFromBase64Key(newKeyB64(t))
	require.NoError(t, err)
	ct, nonce, err := s.Seal([]byte("secret-data"))
	require.NoError(t, err)
	ct[0] ^= 0xff
	_, err = s.Open(ct, nonce)
	assert.ErrorIs(t, err, service.ErrSealerOpen)
}

func TestSealerRejectsMalformedKey(t *testing.T) {
	t.Parallel()
	_, err := service.NewSealerFromBase64Key("")
	assert.ErrorIs(t, err, service.ErrSealerNotConfigured)

	_, err = service.NewSealerFromBase64Key("not-base64-!!!")
	assert.Error(t, err)

	short := base64.StdEncoding.EncodeToString(make([]byte, 16))
	_, err = service.NewSealerFromBase64Key(short)
	assert.Error(t, err)
}

func TestSealerNilSafe(t *testing.T) {
	t.Parallel()
	var s *service.Sealer
	_, _, err := s.Seal([]byte("x"))
	assert.ErrorIs(t, err, service.ErrSealerNotConfigured)
	_, err = s.Open([]byte("x"), make([]byte, 12))
	assert.ErrorIs(t, err, service.ErrSealerNotConfigured)
}
