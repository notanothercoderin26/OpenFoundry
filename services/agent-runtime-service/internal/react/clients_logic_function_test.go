package react

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// TestHTTPToolRouter_FunctionTool_RoutesToLogicInvoke validates the
// production binding: a ToolKindFunction with function_rid hits the
// /logic/functions/{rid}/invoke endpoint, wraps args under inputs,
// sends the depth header, and returns the outputs field.
func TestHTTPToolRouter_FunctionTool_RoutesToLogicInvoke(t *testing.T) {
	t.Parallel()
	var (
		seenPath        string
		seenAuth        string
		seenDepth       string
		seenContentType string
		seenBody        []byte
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		seenAuth = r.Header.Get("Authorization")
		seenDepth = r.Header.Get(LogicDepthHeader)
		seenContentType = r.Header.Get("Content-Type")
		seenBody, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"status":"succeeded","outputs":{"summary":"3 contracts"}}`))
	}))
	defer srv.Close()

	router := &HTTPToolRouter{LogicFunctionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{
		Name:   "lookup_supplier",
		Kind:   models.ToolKindFunction,
		Config: json.RawMessage(`{"function_rid":"logic.supplier-lookup"}`),
	}
	out, err := router.Invoke(context.Background(), "user-jwt", def, json.RawMessage(`{"name":"Foo Ltd"}`))
	if err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if got, want := seenPath, "/api/v1/agent-runtime/logic/functions/logic.supplier-lookup/invoke"; got != want {
		t.Errorf("path = %q, want %q", got, want)
	}
	if seenAuth != "Bearer user-jwt" {
		t.Errorf("auth header = %q, want Bearer user-jwt", seenAuth)
	}
	if seenDepth != "1" {
		t.Errorf("depth header = %q, want 1 (top-level call)", seenDepth)
	}
	if !strings.Contains(seenContentType, "application/json") {
		t.Errorf("content type = %q", seenContentType)
	}
	var envelope struct {
		Inputs map[string]any `json:"inputs"`
	}
	if err := json.Unmarshal(seenBody, &envelope); err != nil {
		t.Fatalf("decode body: %v body=%s", err, string(seenBody))
	}
	if envelope.Inputs["name"] != "Foo Ltd" {
		t.Errorf("args not wrapped under inputs: %v", envelope)
	}
	var decoded map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("decode output: %v out=%s", err, string(out))
	}
	if decoded["summary"] != "3 contracts" {
		t.Errorf("expected outputs to be unwrapped to summary, got %v", decoded)
	}
}

// TestHTTPToolRouter_FunctionTool_IncrementsDepth proves the router
// reads LogicDepthFromContext and sends depth+1 to the downstream.
func TestHTTPToolRouter_FunctionTool_IncrementsDepth(t *testing.T) {
	t.Parallel()
	var seenDepth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenDepth = r.Header.Get(LogicDepthHeader)
		_, _ = w.Write([]byte(`{"outputs":{}}`))
	}))
	defer srv.Close()

	router := &HTTPToolRouter{LogicFunctionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{Kind: models.ToolKindFunction, Config: json.RawMessage(`{"function_rid":"logic.x"}`)}
	ctx := WithLogicDepth(context.Background(), 2)
	if _, err := router.Invoke(ctx, "j", def, json.RawMessage(`{}`)); err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if seenDepth != "3" {
		t.Errorf("depth = %q, want 3 (incremented from 2)", seenDepth)
	}
}

// TestHTTPToolRouter_FunctionTool_RejectsAtDepthCap ensures the
// router refuses to fan out one more level once the cap is reached,
// even before sending the HTTP request.
func TestHTTPToolRouter_FunctionTool_RejectsAtDepthCap(t *testing.T) {
	t.Parallel()
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{LogicFunctionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{Kind: models.ToolKindFunction, Config: json.RawMessage(`{"function_rid":"logic.x"}`)}
	ctx := WithLogicDepth(context.Background(), MaxLogicInvocationDepth)
	out, err := router.Invoke(ctx, "j", def, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if called {
		t.Error("router should not have called the downstream when at depth cap")
	}
	if !strings.Contains(string(out), "exceeds limit") {
		t.Errorf("expected limit-exceeded observation, got %s", string(out))
	}
}

// TestHTTPToolRouter_FunctionTool_NoLogicURL handles the misconfigured
// case where LogicFunctionsURL is empty: surface a friendly error,
// don't crash.
func TestHTTPToolRouter_FunctionTool_NoLogicURL(t *testing.T) {
	t.Parallel()
	router := &HTTPToolRouter{} // no URL set
	def := models.ToolDefinition{Kind: models.ToolKindFunction, Config: json.RawMessage(`{"function_rid":"logic.x"}`)}
	out, err := router.Invoke(context.Background(), "j", def, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if !strings.Contains(string(out), "logic function tool not configured") {
		t.Errorf("unexpected observation: %s", string(out))
	}
}

// TestHTTPToolRouter_FunctionTool_FallsBackToFunctionsURL keeps the
// legacy "generic function endpoint" path alive for tools that have
// no function_rid (pre-Logic agents).
func TestHTTPToolRouter_FunctionTool_FallsBackToFunctionsURL(t *testing.T) {
	t.Parallel()
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{FunctionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{Kind: models.ToolKindFunction, Config: json.RawMessage(`{}`)}
	if _, err := router.Invoke(context.Background(), "j", def, json.RawMessage(`{}`)); err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if !hit {
		t.Error("expected legacy FunctionsURL endpoint to be called")
	}
}

func TestHTTPToolRouter_FunctionTool_SurfaceFailedRunWithError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"failed","outputs":{"partial":1},"error_message":"upstream timeout"}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{LogicFunctionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{Kind: models.ToolKindFunction, Config: json.RawMessage(`{"function_rid":"logic.x"}`)}
	out, err := router.Invoke(context.Background(), "j", def, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if !strings.Contains(string(out), "upstream timeout") {
		t.Errorf("error from failed run not surfaced to LLM: %s", string(out))
	}
}

func TestLogicDepthContext_RoundTrips(t *testing.T) {
	t.Parallel()
	ctx := WithLogicDepth(context.Background(), 7)
	if got := LogicDepthFromContext(ctx); got != 7 {
		t.Errorf("depth = %d, want 7", got)
	}
	if got := LogicDepthFromContext(context.Background()); got != 0 {
		t.Errorf("unset depth should default to 0, got %d", got)
	}
}
