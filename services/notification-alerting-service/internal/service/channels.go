// Package service hosts notification creation + per-channel dispatch.
package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/models"
)

// WebhookSigner carries the outbound webhook signing configuration.
//
// Mirrors the inbound listener pattern in connector-management-service:
// HMAC-SHA256 over `<timestamp>.<body>` with the result emitted in the
// `X-OpenFoundry-Signature` header as `t=<unix>,v1=<hex>` (the leading
// `t=` is the source timestamp the receiver replays into its own HMAC
// computation; `v1=` is the version-tagged signature so we can rotate
// schemes without breaking older receivers). The same timestamp is
// echoed in `X-OpenFoundry-Signature-Timestamp` for receivers that
// only want to parse a single header.
//
// Empty Secret disables signing — the dispatch path stays identical
// to the unsigned path so dev / test setups against httptest servers
// keep working.
type WebhookSigner struct {
	Secret string

	// now and rand are pulled out for tests; production wiring leaves
	// them nil so the helpers default to time.Now and a math/rand
	// source seeded once.
	now  func() time.Time
	rand *rand.Rand
}

// Enabled reports whether outbound signing should be applied.
func (s *WebhookSigner) Enabled() bool {
	return s != nil && strings.TrimSpace(s.Secret) != ""
}

// Sign returns the canonical header pair for a given payload + epoch
// second timestamp. Callers usually pass time.Now().Unix(); tests
// inject a fixed value so the assertion is deterministic.
func (s *WebhookSigner) Sign(payload []byte, ts int64) (sigHeader, tsHeader string) {
	mac := hmac.New(sha256.New, []byte(s.Secret))
	// Format mirrors the inbound listener helper in
	// connector-management-service/internal/handlers/registrations.go:1280
	// (HMAC over body, hex output). The `<timestamp>.` prefix prevents
	// replay: a receiver re-computes HMAC over the same prefix + body
	// and rejects anything older than its window.
	tsStr := strconv.FormatInt(ts, 10)
	_, _ = mac.Write([]byte(tsStr))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write(payload)
	sum := hex.EncodeToString(mac.Sum(nil))
	return "t=" + tsStr + ",v1=" + sum, tsStr
}

// WebhookRetryPolicy controls the small exponential backoff the
// dispatch path applies before recording a delivery as
// `failed_after_retries` in `notification_deliveries`. Zero / negative
// MaxAttempts is treated as "1" (no retry, current behaviour).
type WebhookRetryPolicy struct {
	MaxAttempts int
	BaseDelay   time.Duration
	MaxDelay    time.Duration
	// JitterFraction in [0, 1] adds ±frac×delay of uniform noise to
	// each sleep. 0.2 (20%) is a reasonable default.
	JitterFraction float64
}

// DefaultWebhookRetryPolicy is the demo-time policy: three attempts at
// roughly 1s / 2s / 4s with 20% jitter. Total worst-case wall time ~7s,
// well under the 5s "in-app notification still fires" demo constraint
// (the webhook fan-out runs alongside the in-app push, not before it).
func DefaultWebhookRetryPolicy() WebhookRetryPolicy {
	return WebhookRetryPolicy{
		MaxAttempts:    3,
		BaseDelay:      1 * time.Second,
		MaxDelay:       4 * time.Second,
		JitterFraction: 0.2,
	}
}

// DeliveryResult captures the per-channel outcome of dispatching a single
// notification. Mirrors the Rust DeliveryResult shape.
type DeliveryResult struct {
	Status   string // "sent" | "skipped" | "failed"
	Response string
}

func sent(msg string) DeliveryResult    { return DeliveryResult{Status: "sent", Response: msg} }
func skipped(msg string) DeliveryResult { return DeliveryResult{Status: "skipped", Response: msg} }
func failed(msg string) DeliveryResult  { return DeliveryResult{Status: "failed", Response: msg} }

// SMTPSender owns the small surface notification dispatch needs.
//
// Hand-rolled over net/smtp + crypto/tls to keep the dependency
// footprint small. Uses STARTTLS when the server announces it; falls
// back to plain SMTP otherwise (compatible with mailhog / mailpit /
// dev relays).
type SMTPSender struct {
	Host        string
	Port        uint16
	Username    string
	Password    string
	FromAddress string
	FromName    string
}

// SendEmail sends a text/plain email with `subject` and `body`.
//
// Returns DeliveryResult so callers don't need to distinguish errors
// from "not configured" — the result type carries that information.
func (s *SMTPSender) SendEmail(ctx context.Context, to, subject, body string) DeliveryResult {
	if s.Host == "" {
		return skipped("SMTP adapter not configured")
	}
	if s.FromAddress == "" {
		return skipped("SMTP from address not configured")
	}

	addr := net.JoinHostPort(s.Host, strconv.Itoa(int(s.Port)))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return failed(fmt.Sprintf("dial smtp: %s", err))
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		return failed(fmt.Sprintf("smtp client: %s", err))
	}
	defer c.Quit()

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return failed(fmt.Sprintf("starttls: %s", err))
		}
	}

	if s.Username != "" && s.Password != "" {
		auth := smtp.PlainAuth("", s.Username, s.Password, s.Host)
		if err := c.Auth(auth); err != nil {
			return failed(fmt.Sprintf("smtp auth: %s", err))
		}
	}

	from := s.FromAddress
	if err := c.Mail(from); err != nil {
		return failed(fmt.Sprintf("smtp mail: %s", err))
	}
	if err := c.Rcpt(to); err != nil {
		return failed(fmt.Sprintf("smtp rcpt: %s", err))
	}

	wc, err := c.Data()
	if err != nil {
		return failed(fmt.Sprintf("smtp data: %s", err))
	}

	displayFrom := from
	if s.FromName != "" {
		displayFrom = fmt.Sprintf("%s <%s>", s.FromName, from)
	}
	msg := buildEmailMessage(displayFrom, to, subject, body)
	if _, err := wc.Write([]byte(msg)); err != nil {
		_ = wc.Close()
		return failed(fmt.Sprintf("smtp write: %s", err))
	}
	if err := wc.Close(); err != nil {
		return failed(fmt.Sprintf("smtp close: %s", err))
	}

	return sent(fmt.Sprintf("email delivered to %s", to))
}

func buildEmailMessage(from, to, subject, body string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	return b.String()
}

// PostWebhook delivers `payload` as a JSON POST to `url`.
//
// When `signer` is non-nil and enabled, the body is signed with
// HMAC-SHA256 over `<timestamp>.<body>` and the signature is attached
// in `X-OpenFoundry-Signature` (plus an `X-OpenFoundry-Signature-
// Timestamp` echo so a receiver only needs to parse one header).
//
// When `policy.MaxAttempts > 1`, the call is retried with exponential
// backoff on transport failures and on 5xx / 429 responses. 4xx (other
// than 429) is treated as a terminal client error and not retried —
// signature mismatches would loop forever otherwise. Each attempt
// shares the same signature, mirroring the at-least-once contract
// downstream receivers should already expect.
//
// On terminal failure the returned DeliveryResult is `failed_after_
// retries` (when attempts > 1) so the deliveries table doubles as the
// DLQ for the SOC — see GET /api/v1/notifications/{id}/deliveries.
func PostWebhook(
	ctx context.Context,
	client *http.Client,
	url string,
	payload any,
	signer *WebhookSigner,
	policy WebhookRetryPolicy,
) DeliveryResult {
	body, err := json.Marshal(payload)
	if err != nil {
		return failed(fmt.Sprintf("encode webhook payload: %s", err))
	}
	attempts := policy.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}

	var lastErr string
	for attempt := 1; attempt <= attempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			// Non-retryable: malformed URL etc.
			return failed(err.Error())
		}
		req.Header.Set("Content-Type", "application/json")
		if signer.Enabled() {
			ts := signer.nowUnix()
			sig, tsHdr := signer.Sign(body, ts)
			req.Header.Set("X-OpenFoundry-Signature", sig)
			req.Header.Set("X-OpenFoundry-Signature-Timestamp", tsHdr)
		}

		resp, doErr := client.Do(req)
		if doErr != nil {
			lastErr = doErr.Error()
			if attempt == attempts {
				break
			}
			if waitErr := sleepWithBackoff(ctx, policy, attempt, signer); waitErr != nil {
				return failed(fmt.Sprintf("attempts=%d, last_error=%s, ctx=%s",
					attempt, lastErr, waitErr))
			}
			continue
		}

		status := resp.StatusCode
		_ = resp.Body.Close()
		if status >= 200 && status < 300 {
			if attempt > 1 {
				return sent(fmt.Sprintf("webhook delivered with status %d (attempts=%d)", status, attempt))
			}
			return sent(fmt.Sprintf("webhook delivered with status %d", status))
		}
		lastErr = fmt.Sprintf("status=%d", status)
		// Non-retryable 4xx (except 429) breaks the loop immediately.
		if status >= 400 && status < 500 && status != 429 {
			return failed(fmt.Sprintf("attempts=%d, last_status=%d (client error, not retried)",
				attempt, status))
		}
		if attempt == attempts {
			break
		}
		if waitErr := sleepWithBackoff(ctx, policy, attempt, signer); waitErr != nil {
			return failed(fmt.Sprintf("attempts=%d, last_status=%d, ctx=%s",
				attempt, status, waitErr))
		}
	}

	// Loop exhausted without a 2xx.
	if attempts > 1 {
		return DeliveryResult{
			Status:   "failed_after_retries",
			Response: fmt.Sprintf("attempts=%d, last=%s", attempts, lastErr),
		}
	}
	return failed(fmt.Sprintf("webhook %s", lastErr))
}

// nowUnix returns the signer's current epoch seconds. Pulled out for
// test injection.
func (s *WebhookSigner) nowUnix() int64 {
	if s != nil && s.now != nil {
		return s.now().Unix()
	}
	return time.Now().Unix()
}

// sleepWithBackoff blocks for the per-attempt delay with jitter, or
// returns when the context is cancelled. attempt is 1-indexed.
func sleepWithBackoff(ctx context.Context, p WebhookRetryPolicy, attempt int, signer *WebhookSigner) error {
	base := p.BaseDelay
	if base <= 0 {
		base = 1 * time.Second
	}
	// Exponential: base * 2^(attempt-1)
	delay := base
	for i := 1; i < attempt; i++ {
		delay *= 2
	}
	if p.MaxDelay > 0 && delay > p.MaxDelay {
		delay = p.MaxDelay
	}
	if frac := p.JitterFraction; frac > 0 {
		jr := jitterRand(signer)
		// Uniform in [-frac, +frac].
		noise := (jr.Float64()*2 - 1) * frac
		delay = time.Duration(float64(delay) * (1 + noise))
		if delay < 0 {
			delay = 0
		}
	}
	t := time.NewTimer(delay)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// jitterRand returns the signer's PRNG when one is injected (test
// determinism), otherwise the package-default math/rand source.
func jitterRand(s *WebhookSigner) *rand.Rand {
	if s != nil && s.rand != nil {
		return s.rand
	}
	return defaultJitterRand
}

var defaultJitterRand = rand.New(rand.NewSource(time.Now().UnixNano()))

// dispatch picks the right adapter for `channel`. Mirrors the Rust
// dispatch_channel match block verbatim.
func (n *Notifier) dispatch(
	ctx context.Context,
	notification *models.NotificationRecord,
	preference *models.NotificationPreference,
	channel string,
) DeliveryResult {
	switch channel {
	case "in_app":
		return sent("delivered to in-app center")
	case "email":
		if preference == nil || !preference.EmailEnabled {
			return skipped("email channel disabled")
		}
		if preference.EmailAddress == nil || *preference.EmailAddress == "" {
			return skipped("email address not configured")
		}
		if n.SMTP == nil {
			return skipped("SMTP adapter not configured")
		}
		rendered := RenderEmailForDelivery(notification, *preference.EmailAddress, n.EmailRedaction)
		result := n.SMTP.SendEmail(ctx, *preference.EmailAddress, rendered.Subject, rendered.Body)
		if rendered.Redacted && result.Response != "" {
			result.Response += "; email content redacted: " + rendered.Reason
		}
		return result
	case "slack":
		if preference == nil || preference.SlackWebhookURL == nil || *preference.SlackWebhookURL == "" {
			return skipped("slack webhook not configured")
		}
		return PostWebhook(ctx, n.HTTP, *preference.SlackWebhookURL,
			map[string]string{"text": notification.Title + "\n" + notification.Body},
			n.WebhookSigner, n.WebhookRetry)
	case "teams":
		if preference == nil || preference.TeamsWebhookURL == nil || *preference.TeamsWebhookURL == "" {
			return skipped("teams webhook not configured")
		}
		return PostWebhook(ctx, n.HTTP, *preference.TeamsWebhookURL,
			map[string]string{"text": notification.Title + "\n" + notification.Body},
			n.WebhookSigner, n.WebhookRetry)
	default:
		return skipped(fmt.Sprintf("unknown channel '%s'", channel))
	}
}

// errAdapter unused — placeholder for future typed errors per channel.
var errAdapter = errors.New("adapter error")
var _ = errAdapter
