package react

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

func TestHTTPLLMClient_ParsesFinalAnswer(t *testing.T) {
	t.Parallel()
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{
			"messages": [{"role":"assistant","content":"Hello there."}],
			"usage": {"prompt_tokens": 12, "completion_tokens": 5}
		}`))
	}))
	defer srv.Close()
	c := NewHTTPLLMClient(srv.URL)
	resp, err := c.Invoke(context.Background(), "service-jwt", LLMInvocation{
		ModelRID: uuid.New(),
		Messages: []LLMMessage{{Role: "user", Content: "hi"}},
	})
	require.NoError(t, err)
	assert.Equal(t, "Hello there.", resp.Final)
	assert.Nil(t, resp.ToolCall)
	assert.Equal(t, int32(12), resp.PromptTokens)
	assert.Equal(t, "Bearer service-jwt", seenAuth, "JWT propagated as Bearer")
}

func TestHTTPLLMClient_ParsesToolCallJSON(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{
			"messages": [{"role":"assistant","content":"{\"tool\":\"FindAircraftByTail\",\"arguments\":{\"tail\":\"N12345\"}}"}],
			"usage": {}
		}`))
	}))
	defer srv.Close()
	c := NewHTTPLLMClient(srv.URL)
	resp, err := c.Invoke(context.Background(), "", LLMInvocation{
		ModelRID: uuid.New(),
		Tools:    []LLMToolDecl{{Name: "FindAircraftByTail"}},
	})
	require.NoError(t, err)
	require.NotNil(t, resp.ToolCall)
	assert.Equal(t, "FindAircraftByTail", resp.ToolCall.Name)
	assert.Contains(t, string(resp.ToolCall.Arguments), "N12345")
}

func TestHTTPLLMClient_SurfacesNon2xx(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"upstream busy"}`))
	}))
	defer srv.Close()
	c := NewHTTPLLMClient(srv.URL)
	_, err := c.Invoke(context.Background(), "", LLMInvocation{ModelRID: uuid.New()})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
}

func TestHTTPToolRouter_ObjectQueryForwardsJWTAndArgs(t *testing.T) {
	t.Parallel()
	var seenAuth, seenPath, seenBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenPath = r.URL.Path
		body := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(body)
		seenBody = string(body)
		_, _ = w.Write([]byte(`{"items":[{"id":"ac-1"}]}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{ObjectDatabaseURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{
		Name: "FindAircraftByTail", Kind: models.ToolKindObjectQuery,
		Config: json.RawMessage(`{"type_id":"Aircraft"}`),
	}
	out, err := router.Invoke(context.Background(), "service-jwt", def, json.RawMessage(`{"filters":{"tail":"N12345"}}`))
	require.NoError(t, err)
	assert.Contains(t, string(out), "ac-1")
	assert.Equal(t, "Bearer service-jwt", seenAuth)
	assert.Equal(t, "/api/v1/ontology/types/Aircraft/objects/query", seenPath)
	assert.Contains(t, seenBody, "N12345")
}

func TestHTTPToolRouter_ActionForwardsJWTToExecute(t *testing.T) {
	t.Parallel()
	var seenPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		_, _ = w.Write([]byte(`{"executed":true}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{OntologyActionsURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{
		Name: "ScheduleMaintenance", Kind: models.ToolKindAction,
		Config: json.RawMessage(`{"action_id":"b-check"}`),
	}
	_, err := router.Invoke(context.Background(), "x", def, json.RawMessage(`{"target_object_id":"ac-1"}`))
	require.NoError(t, err)
	assert.Equal(t, "/api/v1/ontology/actions/b-check/execute", seenPath)
}

func TestHTTPToolRouter_PropagatesForbiddenAsObservation(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"cedar denied"}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{ObjectDatabaseURL: srv.URL, HTTP: srv.Client()}
	def := models.ToolDefinition{
		Name: "Q", Kind: models.ToolKindObjectQuery,
		Config: json.RawMessage(`{"type_id":"Aircraft"}`),
	}
	out, err := router.Invoke(context.Background(), "service-jwt", def, json.RawMessage(`{}`))
	require.NoError(t, err, "permission denial is propagated as an observation, not an error (B07 §AC#6)")
	assert.Contains(t, string(out), "permission denied")
	assert.Contains(t, string(out), "403")
}

func TestHTTPToolRouter_UnconfiguredEndpointReturnsFriendlyObservation(t *testing.T) {
	t.Parallel()
	router := &HTTPToolRouter{HTTP: http.DefaultClient}
	def := models.ToolDefinition{Name: "Q", Kind: models.ToolKindObjectQuery,
		Config: json.RawMessage(`{"type_id":"Aircraft"}`)}
	out, err := router.Invoke(context.Background(), "", def, json.RawMessage(`{}`))
	require.NoError(t, err)
	assert.True(t, strings.Contains(string(out), "object database not configured"))
}
