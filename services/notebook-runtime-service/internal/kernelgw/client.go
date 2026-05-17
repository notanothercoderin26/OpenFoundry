// Package kernelgw is a thin proxy client for jupyter/kernel-gateway
// (https://jupyter-kernel-gateway.readthedocs.io/). It speaks the
// upstream REST surface for kernel lifecycle (/api/kernels) and the
// per-kernel Jupyter messaging WebSocket (/api/kernels/{id}/channels)
// for execute-and-stream.
//
// The client is intentionally narrow: notebook-runtime-service owns
// session ↔ kernel mapping (Postgres), authn (its own JWT chain), and
// authz (Cedar guard via ExecuteGuard). The gateway is treated as an
// untrusted execution backend.
package kernelgw

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/google/uuid"
)

// Client wraps jupyter/kernel-gateway. Safe for concurrent use.
type Client struct {
	httpBase  *url.URL
	wsBase    *url.URL
	authToken string
	http      *http.Client
}

// Kernel mirrors the gateway's /api/kernels payload (only the fields
// the service actually consumes).
type Kernel struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	LastActivity   time.Time `json:"last_activity"`
	ExecutionState string    `json:"execution_state"`
	Connections    int       `json:"connections"`
}

// Config configures a Client.
type Config struct {
	HTTPBaseURL string
	WSBaseURL   string
	AuthToken   string
	HTTPClient  *http.Client
}

// New returns a Client. wsBase is derived from httpBase when empty
// (http→ws, https→wss). Returns an error when httpBase is unset or
// malformed.
func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.HTTPBaseURL) == "" {
		return nil, errors.New("kernelgw: HTTPBaseURL is required")
	}
	hb, err := url.Parse(cfg.HTTPBaseURL)
	if err != nil {
		return nil, fmt.Errorf("kernelgw: parse http base: %w", err)
	}
	if hb.Scheme != "http" && hb.Scheme != "https" {
		return nil, fmt.Errorf("kernelgw: http base must use http(s), got %q", hb.Scheme)
	}
	wsRaw := cfg.WSBaseURL
	if strings.TrimSpace(wsRaw) == "" {
		// http://… → ws://…  /  https://… → wss://…
		wb := *hb
		switch hb.Scheme {
		case "http":
			wb.Scheme = "ws"
		case "https":
			wb.Scheme = "wss"
		}
		wsRaw = wb.String()
	}
	wb, err := url.Parse(wsRaw)
	if err != nil {
		return nil, fmt.Errorf("kernelgw: parse ws base: %w", err)
	}
	if wb.Scheme != "ws" && wb.Scheme != "wss" {
		return nil, fmt.Errorf("kernelgw: ws base must use ws(s), got %q", wb.Scheme)
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{httpBase: hb, wsBase: wb, authToken: cfg.AuthToken, http: hc}, nil
}

// CreateKernel POSTs /api/kernels with {"name":<spec>}. spec="" → gateway default ("python3").
func (c *Client) CreateKernel(ctx context.Context, spec string) (*Kernel, error) {
	body := map[string]string{}
	if spec != "" {
		body["name"] = spec
	}
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.urlJoin("/api/kernels"), bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	c.setAuth(req)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("kernelgw: create kernel: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, gatewayErr("create kernel", resp)
	}
	var k Kernel
	if err := json.NewDecoder(resp.Body).Decode(&k); err != nil {
		return nil, fmt.Errorf("kernelgw: decode create response: %w", err)
	}
	return &k, nil
}

// ListKernels returns every kernel known to the gateway.
func (c *Client) ListKernels(ctx context.Context) ([]Kernel, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.urlJoin("/api/kernels"), nil)
	if err != nil {
		return nil, err
	}
	c.setAuth(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("kernelgw: list kernels: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, gatewayErr("list kernels", resp)
	}
	var out []Kernel
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("kernelgw: decode list response: %w", err)
	}
	return out, nil
}

// DeleteKernel removes a kernel. A 404 is treated as success — the
// caller asked for the kernel to be gone and it is.
func (c *Client) DeleteKernel(ctx context.Context, kernelID string) error {
	if kernelID == "" {
		return errors.New("kernelgw: empty kernel id")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.urlJoin("/api/kernels/"+url.PathEscape(kernelID)), nil)
	if err != nil {
		return err
	}
	c.setAuth(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("kernelgw: delete kernel: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode/100 != 2 {
		return gatewayErr("delete kernel", resp)
	}
	return nil
}

// OutputEvent is the normalized shape emitted on the Execute stream.
// It is JSON-stable (NDJSON line per event). One of stdout/stderr/data
// fields is populated depending on Type.
type OutputEvent struct {
	Type           string          `json:"type"`
	Text           string          `json:"text,omitempty"`
	Data           json.RawMessage `json:"data,omitempty"`
	ExecutionCount *int            `json:"execution_count,omitempty"`
	Ename          string          `json:"ename,omitempty"`
	Evalue         string          `json:"evalue,omitempty"`
	Traceback      []string        `json:"traceback,omitempty"`
	State          string          `json:"state,omitempty"`
}

// Execute opens a WS to /api/kernels/{id}/channels, sends an
// execute_request for `code`, and pushes normalized output events
// onto out until the upstream emits status=idle for our request (or
// ctx is cancelled). out is closed when Execute returns.
//
// Caller is responsible for draining out promptly; this method blocks
// the goroutine that called it.
func (c *Client) Execute(ctx context.Context, kernelID, code string, out chan<- OutputEvent) error {
	defer close(out)
	if kernelID == "" {
		return errors.New("kernelgw: empty kernel id")
	}
	wsURL := c.wsBase.ResolveReference(&url.URL{Path: "/api/kernels/" + kernelID + "/channels"})
	hdr := http.Header{}
	if c.authToken != "" {
		hdr.Set("Authorization", "token "+c.authToken)
	}
	conn, resp, err := websocket.Dial(ctx, wsURL.String(), &websocket.DialOptions{
		HTTPHeader: hdr,
	})
	if err != nil {
		return fmt.Errorf("kernelgw: ws dial: %w", err)
	}
	// coder/websocket: the upgrade response body is non-nil and the
	// linter expects it to be closed even though it's discarded.
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	msgID, _ := uuid.NewV7()
	sessID, _ := uuid.NewV7()
	req := jupyterMessage{
		Header: jupyterHeader{
			MsgID:    msgID.String(),
			Username: "openfoundry",
			Session:  sessID.String(),
			MsgType:  "execute_request",
			Version:  "5.3",
			Date:     time.Now().UTC().Format(time.RFC3339Nano),
		},
		ParentHeader: map[string]any{},
		Metadata:     map[string]any{},
		Channel:      "shell",
		Content: executeRequestContent{
			Code:            code,
			Silent:          false,
			StoreHistory:    true,
			UserExpressions: map[string]any{},
			AllowStdin:      false,
			StopOnError:     true,
		},
	}
	if err := wsjson.Write(ctx, conn, req); err != nil {
		return fmt.Errorf("kernelgw: ws write execute_request: %w", err)
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		var raw jupyterMessageRaw
		if err := wsjson.Read(ctx, conn, &raw); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			return fmt.Errorf("kernelgw: ws read: %w", err)
		}
		// Only react to messages whose parent is our execute_request.
		// status messages on iopub channel are how we know we're done.
		parentMsgID, _ := raw.ParentHeader["msg_id"].(string)
		if parentMsgID != "" && parentMsgID != msgID.String() {
			continue
		}
		ev, terminal, perr := normalizeMessage(raw)
		if perr != nil {
			out <- OutputEvent{Type: "error", Ename: "GatewayProtocolError", Evalue: perr.Error()}
			return perr
		}
		if ev != nil {
			select {
			case out <- *ev:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		if terminal {
			return nil
		}
	}
}

// ---- internals ----

func (c *Client) urlJoin(p string) string {
	u := c.httpBase.ResolveReference(&url.URL{Path: p})
	return u.String()
}

func (c *Client) setAuth(req *http.Request) {
	if c.authToken != "" {
		req.Header.Set("Authorization", "token "+c.authToken)
	}
}

func gatewayErr(op string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<14))
	return fmt.Errorf("kernelgw: %s: upstream %d: %s", op, resp.StatusCode, bytes.TrimSpace(body))
}

type jupyterHeader struct {
	MsgID    string `json:"msg_id"`
	Username string `json:"username"`
	Session  string `json:"session"`
	MsgType  string `json:"msg_type"`
	Version  string `json:"version"`
	Date     string `json:"date"`
}

type jupyterMessage struct {
	Header       jupyterHeader  `json:"header"`
	ParentHeader map[string]any `json:"parent_header"`
	Metadata     map[string]any `json:"metadata"`
	Channel      string         `json:"channel"`
	Content      any            `json:"content"`
}

type executeRequestContent struct {
	Code            string         `json:"code"`
	Silent          bool           `json:"silent"`
	StoreHistory    bool           `json:"store_history"`
	UserExpressions map[string]any `json:"user_expressions"`
	AllowStdin      bool           `json:"allow_stdin"`
	StopOnError     bool           `json:"stop_on_error"`
}

type jupyterMessageRaw struct {
	Header       map[string]any  `json:"header"`
	ParentHeader map[string]any  `json:"parent_header"`
	Channel      string          `json:"channel"`
	Content      json.RawMessage `json:"content"`
}

// normalizeMessage translates a Jupyter iopub message into an
// OutputEvent. The bool is true when this message terminates the
// current execute_request (status=idle on iopub).
func normalizeMessage(raw jupyterMessageRaw) (*OutputEvent, bool, error) {
	msgType, _ := raw.Header["msg_type"].(string)
	switch msgType {
	case "stream":
		var c struct {
			Name string `json:"name"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(raw.Content, &c); err != nil {
			return nil, false, err
		}
		ev := &OutputEvent{Text: c.Text}
		if c.Name == "stderr" {
			ev.Type = "stderr"
		} else {
			ev.Type = "stdout"
		}
		return ev, false, nil
	case "display_data":
		var c struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(raw.Content, &c); err != nil {
			return nil, false, err
		}
		return &OutputEvent{Type: "display_data", Data: c.Data}, false, nil
	case "execute_result":
		var c struct {
			Data           json.RawMessage `json:"data"`
			ExecutionCount int             `json:"execution_count"`
		}
		if err := json.Unmarshal(raw.Content, &c); err != nil {
			return nil, false, err
		}
		n := c.ExecutionCount
		return &OutputEvent{Type: "execute_result", Data: c.Data, ExecutionCount: &n}, false, nil
	case "error":
		var c struct {
			Ename     string   `json:"ename"`
			Evalue    string   `json:"evalue"`
			Traceback []string `json:"traceback"`
		}
		if err := json.Unmarshal(raw.Content, &c); err != nil {
			return nil, false, err
		}
		return &OutputEvent{Type: "error", Ename: c.Ename, Evalue: c.Evalue, Traceback: c.Traceback}, false, nil
	case "status":
		var c struct {
			State string `json:"execution_state"`
		}
		if err := json.Unmarshal(raw.Content, &c); err != nil {
			return nil, false, err
		}
		if c.State == "idle" {
			return &OutputEvent{Type: "status", State: c.State}, true, nil
		}
		return nil, false, nil
	default:
		// execute_input, execute_reply (shell), comm_*, history, etc — ignore.
		return nil, false, nil
	}
}
