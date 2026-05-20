package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fixedSigner returns a signer whose `now()` is pinned, so the test
// asserts deterministic header values.
func fixedSigner(secret string, ts int64) *WebhookSigner {
	t := time.Unix(ts, 0).UTC()
	return &WebhookSigner{
		Secret: secret,
		now:    func() time.Time { return t },
		rand:   rand.New(rand.NewSource(1)),
	}
}

func TestWebhookSigner_DisabledWhenSecretEmpty(t *testing.T) {
	if (&WebhookSigner{}).Enabled() {
		t.Fatal("empty secret must disable signing")
	}
	if !fixedSigner("s", 1).Enabled() {
		t.Fatal("non-empty secret must enable signing")
	}
}

func TestWebhookSigner_Sign_Deterministic(t *testing.T) {
	s := fixedSigner("shh-it-is-a-secret", 1717000000)
	got, ts := s.Sign([]byte(`{"text":"hello"}`), 1717000000)

	// Expected = HMAC-SHA256("1717000000.{\"text\":\"hello\"}", secret)
	mac := hmac.New(sha256.New, []byte("shh-it-is-a-secret"))
	mac.Write([]byte("1717000000."))
	mac.Write([]byte(`{"text":"hello"}`))
	want := hex.EncodeToString(mac.Sum(nil))

	wantHeader := "t=1717000000,v1=" + want
	if got != wantHeader {
		t.Fatalf("signature header mismatch:\n got=%s\nwant=%s", got, wantHeader)
	}
	if ts != "1717000000" {
		t.Fatalf("timestamp echo mismatch: got=%s want=1717000000", ts)
	}
}

func TestPostWebhook_SignsRequest(t *testing.T) {
	var gotSig, gotTS string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-OpenFoundry-Signature")
		gotTS = r.Header.Get("X-OpenFoundry-Signature-Timestamp")
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	signer := fixedSigner("k", 1717000000)
	res := PostWebhook(
		context.Background(),
		srv.Client(),
		srv.URL,
		map[string]string{"text": "hi"},
		signer,
		WebhookRetryPolicy{MaxAttempts: 1},
	)
	if res.Status != "sent" {
		t.Fatalf("expected sent, got %+v", res)
	}
	if !strings.HasPrefix(gotSig, "t=1717000000,v1=") {
		t.Fatalf("signature header malformed: %q", gotSig)
	}
	if gotTS != "1717000000" {
		t.Fatalf("timestamp header malformed: %q", gotTS)
	}
}

func TestPostWebhook_NoSigningWhenSecretEmpty(t *testing.T) {
	var gotSig string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-OpenFoundry-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	res := PostWebhook(context.Background(), srv.Client(), srv.URL,
		map[string]string{"text": "hi"}, &WebhookSigner{}, WebhookRetryPolicy{MaxAttempts: 1})
	if res.Status != "sent" {
		t.Fatalf("expected sent, got %+v", res)
	}
	if gotSig != "" {
		t.Fatalf("expected no signature header, got %q", gotSig)
	}
}

func TestPostWebhook_RetriesOn5xx_ThenSucceeds(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		if n < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	// Force backoff to be small so the test completes quickly.
	policy := WebhookRetryPolicy{MaxAttempts: 3, BaseDelay: 1 * time.Millisecond,
		MaxDelay: 4 * time.Millisecond, JitterFraction: 0}

	res := PostWebhook(context.Background(), srv.Client(), srv.URL,
		map[string]string{"text": "hi"}, &WebhookSigner{}, policy)
	if res.Status != "sent" {
		t.Fatalf("expected sent after retries, got %+v", res)
	}
	if !strings.Contains(res.Response, "attempts=3") {
		t.Fatalf("response should reflect attempt count, got %q", res.Response)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("expected 3 calls, got %d", got)
	}
}

func TestPostWebhook_FailedAfterRetries_DLQStatus(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	policy := WebhookRetryPolicy{MaxAttempts: 3, BaseDelay: 1 * time.Millisecond,
		MaxDelay: 4 * time.Millisecond, JitterFraction: 0}

	res := PostWebhook(context.Background(), srv.Client(), srv.URL,
		map[string]string{"text": "hi"}, &WebhookSigner{}, policy)
	if res.Status != "failed_after_retries" {
		t.Fatalf("expected failed_after_retries, got %+v", res)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
	if !strings.Contains(res.Response, "attempts=3") || !strings.Contains(res.Response, "status=500") {
		t.Fatalf("response should encode attempts + last status, got %q", res.Response)
	}
}

func TestPostWebhook_4xxNotRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	policy := WebhookRetryPolicy{MaxAttempts: 5, BaseDelay: 1 * time.Millisecond, JitterFraction: 0}
	res := PostWebhook(context.Background(), srv.Client(), srv.URL,
		map[string]string{"text": "hi"}, &WebhookSigner{}, policy)
	if res.Status != "failed" {
		t.Fatalf("4xx should terminate as 'failed', got %+v", res)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("4xx must not be retried, got %d calls", got)
	}
	if !strings.Contains(res.Response, "client error") {
		t.Fatalf("response should mark client error, got %q", res.Response)
	}
}

func TestPostWebhook_429IsRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		if n < 2 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	policy := WebhookRetryPolicy{MaxAttempts: 3, BaseDelay: 1 * time.Millisecond, JitterFraction: 0}
	res := PostWebhook(context.Background(), srv.Client(), srv.URL,
		map[string]string{"text": "hi"}, &WebhookSigner{}, policy)
	if res.Status != "sent" {
		t.Fatalf("429 then 200 should resolve as sent, got %+v", res)
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("expected 2 calls, got %d", got)
	}
}

// SignWebhook receiver-side verification flow — proves the canonical
// HMAC over `<ts>.<body>` round-trips so the SIEM operator can pin
// their verifier against this signing scheme.
func TestPostWebhook_SignatureVerifiesAtReceiver(t *testing.T) {
	const secret = "siem-shared-secret"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sig := r.Header.Get("X-OpenFoundry-Signature")
		// Parse `t=<ts>,v1=<hex>` per the header contract.
		parts := strings.Split(sig, ",")
		if len(parts) != 2 || !strings.HasPrefix(parts[0], "t=") || !strings.HasPrefix(parts[1], "v1=") {
			t.Errorf("bad signature header shape: %q", sig)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		ts := strings.TrimPrefix(parts[0], "t=")
		got := strings.TrimPrefix(parts[1], "v1=")

		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(ts + "."))
		mac.Write(body)
		want := hex.EncodeToString(mac.Sum(nil))
		if got != want {
			t.Errorf("signature mismatch: got=%s want=%s", got, want)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		// Sanity check: timestamp is recent (within 5 min window).
		tsInt, _ := strconv.ParseInt(ts, 10, 64)
		if time.Since(time.Unix(tsInt, 0)) > 5*time.Minute {
			t.Errorf("stale timestamp")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	res := PostWebhook(
		context.Background(),
		srv.Client(),
		srv.URL,
		map[string]string{"event": "case.opened", "case_id": "CASE-7711"},
		&WebhookSigner{Secret: secret},
		WebhookRetryPolicy{MaxAttempts: 1},
	)
	if res.Status != "sent" {
		t.Fatalf("expected sent (sig verified at receiver), got %+v", res)
	}
}
