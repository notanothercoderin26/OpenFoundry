package notepad

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// ErrGotenbergDisabled is returned when an export requests PDF but the
// Gotenberg client has not been configured.
var ErrGotenbergDisabled = errors.New("notepad: PDF export disabled (GOTENBERG_URL is unset)")

// GotenbergClient converts HTML payloads to PDF using a Gotenberg v8
// sidecar. The zero value is unusable; build one with NewGotenbergClient
// or NewGotenbergClientFromEnv.
type GotenbergClient struct {
	BaseURL string
	HTTP    *http.Client
}

// NewGotenbergClient returns a client targeting baseURL. baseURL must
// be the Gotenberg root (e.g. "http://gotenberg:3000"), without a
// trailing slash. A nil http.Client falls back to a sane default.
func NewGotenbergClient(baseURL string, httpClient *http.Client) *GotenbergClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &GotenbergClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    httpClient,
	}
}

// ConvertHTMLToPDF posts htmlBody to Gotenberg's Chromium HTML→PDF
// route and returns the resulting PDF bytes. The body is uploaded as
// `index.html` per the Gotenberg contract.
func (c *GotenbergClient) ConvertHTMLToPDF(ctx context.Context, htmlBody string) ([]byte, error) {
	if c == nil || c.BaseURL == "" {
		return nil, ErrGotenbergDisabled
	}

	body, contentType, err := buildHTMLMultipart(htmlBody)
	if err != nil {
		return nil, fmt.Errorf("build gotenberg multipart: %w", err)
	}

	endpoint := c.BaseURL + "/forms/chromium/convert/html"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return nil, fmt.Errorf("build gotenberg request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Accept", "application/pdf")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("post to gotenberg: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("gotenberg returned %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}

	return io.ReadAll(resp.Body)
}

func buildHTMLMultipart(htmlBody string) (*bytes.Buffer, string, error) {
	buf := &bytes.Buffer{}
	writer := multipart.NewWriter(buf)
	part, err := writer.CreateFormFile("files", "index.html")
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write([]byte(htmlBody)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return buf, writer.FormDataContentType(), nil
}
