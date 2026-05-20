package lineage

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
)

func TestMintShareTokenIsBase32LowercaseAnd32CharsLong(t *testing.T) {
	token, err := MintShareToken()
	if err != nil {
		t.Fatalf("MintShareToken: %v", err)
	}
	// 20 bytes of entropy at base32 = 32 characters without padding.
	if got := len(token); got != 32 {
		t.Fatalf("token length = %d, want 32 (%q)", got, token)
	}
	if token != strings.ToLower(token) {
		t.Fatalf("token must be lowercase: %q", token)
	}
	for _, r := range token {
		if !(r >= 'a' && r <= 'z') && !(r >= '2' && r <= '7') {
			t.Fatalf("token contains non-base32 rune %q in %q", r, token)
		}
	}
}

func TestMintShareTokenIsUniquePerCall(t *testing.T) {
	seen := make(map[string]struct{}, 64)
	for i := 0; i < 64; i++ {
		token, err := MintShareToken()
		if err != nil {
			t.Fatalf("MintShareToken[%d]: %v", i, err)
		}
		if _, dup := seen[token]; dup {
			t.Fatalf("duplicate token after %d draws: %q", i, token)
		}
		seen[token] = struct{}{}
	}
}

func TestSanitizeNameTrimsAndValidates(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"  Daily extracts  ", "Daily extracts", false},
		{"", "", true},
		{"   ", "", true},
		{strings.Repeat("a", MaxSavedGraphNameLen), strings.Repeat("a", MaxSavedGraphNameLen), false},
		{strings.Repeat("a", MaxSavedGraphNameLen+1), "", true},
	}
	for _, tc := range cases {
		got, err := SanitizeName(tc.in)
		if (err != nil) != tc.wantErr {
			t.Fatalf("SanitizeName(%q) err = %v, wantErr %v", tc.in, err, tc.wantErr)
		}
		if !tc.wantErr && got != tc.want {
			t.Fatalf("SanitizeName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSanitizePayloadAcceptsValidJSON(t *testing.T) {
	got, err := SanitizePayload(json.RawMessage(`{"camera":{"zoom":1.2}}`))
	if err != nil {
		t.Fatalf("SanitizePayload: %v", err)
	}
	if string(got) != `{"camera":{"zoom":1.2}}` {
		t.Fatalf("payload round-trip mismatch: %s", string(got))
	}
}

func TestSanitizePayloadNormalisesEmptyToObject(t *testing.T) {
	got, err := SanitizePayload(nil)
	if err != nil {
		t.Fatalf("SanitizePayload(nil): %v", err)
	}
	if string(got) != `{}` {
		t.Fatalf("SanitizePayload(nil) = %s, want '{}'", string(got))
	}
}

func TestSanitizePayloadRejectsInvalidJSON(t *testing.T) {
	if _, err := SanitizePayload(json.RawMessage(`{not json`)); err == nil {
		t.Fatal("SanitizePayload should reject malformed JSON")
	}
}

func TestSanitizePayloadRejectsOversizedBlobs(t *testing.T) {
	huge := make([]byte, MaxSavedGraphPayloadBytes+1)
	for i := range huge {
		huge[i] = 'a'
	}
	if _, err := SanitizePayload(json.RawMessage(huge)); err == nil {
		t.Fatal("SanitizePayload should reject blobs over the max")
	}
}

func TestSharedResponseFromStripsOwnerID(t *testing.T) {
	sharedAt := time.Date(2026, time.May, 20, 6, 30, 0, 0, time.UTC)
	graph := &models.SavedGraph{
		ID:            uuid.New(),
		OwnerID:       uuid.New(),
		Name:          "Daily extracts",
		Branch:        "master",
		ColoringMode:  "build_status",
		Payload:       json.RawMessage(`{"camera":{}}`),
		ShareReadOnly: true,
		SharedAt:      &sharedAt,
	}
	resp := SharedResponseFrom(graph)
	if resp == nil {
		t.Fatal("SharedResponseFrom returned nil")
	}
	if resp.ID != graph.ID || resp.Name != graph.Name {
		t.Fatalf("identity fields mismatch")
	}
	if !resp.ReadOnly {
		t.Fatal("read-only flag should propagate")
	}
	if !resp.SharedAt.Equal(sharedAt) {
		t.Fatalf("shared_at lost in conversion: %v", resp.SharedAt)
	}
	// The marshalled JSON must not contain owner_id.
	body, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal shared response: %v", err)
	}
	if strings.Contains(string(body), "owner_id") {
		t.Fatalf("shared response leaks owner_id: %s", string(body))
	}
}

func TestSharedResponseFromNilReturnsNil(t *testing.T) {
	if SharedResponseFrom(nil) != nil {
		t.Fatal("SharedResponseFrom(nil) should return nil")
	}
}
