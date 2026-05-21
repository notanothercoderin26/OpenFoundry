package react

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// fakeProposalSink records every stage call so tests can assert
// arguments + initiator without spinning up a DB.
type fakeProposalSink struct {
	mu    sync.Mutex
	calls []ProposalStageRequest
	id    string
	err   error
}

func (s *fakeProposalSink) StageActionProposal(_ context.Context, req ProposalStageRequest) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, req)
	if s.err != nil {
		return "", s.err
	}
	if s.id == "" {
		return "stub-proposal-id", nil
	}
	return s.id, nil
}

// TestActionTool_StagesWhenRequiresApproval is the load-bearing test
// for the human-in-the-loop guarantee: when the agent's tool config
// flags an action as require-approval, the router must NEVER call
// ontology-actions — it must hand the proposal to the sink.
func TestActionTool_StagesWhenRequiresApproval(t *testing.T) {
	t.Parallel()
	calledDownstream := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calledDownstream = true
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	sink := &fakeProposalSink{id: "p-42"}
	router := &HTTPToolRouter{
		OntologyActionsURL: srv.URL,
		Proposals:          sink,
		HTTP:               srv.Client(),
	}
	def := models.ToolDefinition{
		Name: "confirm_sanctions_match",
		Kind: models.ToolKindAction,
		Config: json.RawMessage(`{
			"action_id":"confirm_sanctions_match",
			"requires_human_approval":true,
			"justification":"agent proposes match on high score"
		}`),
	}
	ctx := WithInitiatingUser(context.Background(), "11111111-2222-3333-4444-555555555555")
	out, err := router.Invoke(ctx, "agent-jwt", def, json.RawMessage(`{"supplier_id":"s-1","opensanctions_id":"os-9"}`))
	if err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if calledDownstream {
		t.Fatal("router must not call ontology-actions when require-approval is set")
	}
	if len(sink.calls) != 1 {
		t.Fatalf("expected one staged proposal, got %d", len(sink.calls))
	}
	staged := sink.calls[0]
	if staged.ActionTypeID != "confirm_sanctions_match" {
		t.Errorf("action_type_id = %q", staged.ActionTypeID)
	}
	if staged.InitiatingUserID != "11111111-2222-3333-4444-555555555555" {
		t.Errorf("initiating user not propagated: %q", staged.InitiatingUserID)
	}
	if !strings.Contains(string(staged.Arguments), "supplier_id") {
		t.Errorf("arguments not forwarded: %s", string(staged.Arguments))
	}
	if !strings.Contains(string(out), "staged") || !strings.Contains(string(out), "p-42") {
		t.Errorf("LLM observation should contain staged + proposal id, got %s", string(out))
	}
}

func TestActionTool_ExecutesWhenApprovalFlagAbsent(t *testing.T) {
	t.Parallel()
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		_, _ = w.Write([]byte(`{"applied":true}`))
	}))
	defer srv.Close()
	sink := &fakeProposalSink{}
	router := &HTTPToolRouter{
		OntologyActionsURL: srv.URL,
		Proposals:          sink,
		HTTP:               srv.Client(),
	}
	def := models.ToolDefinition{
		Kind:   models.ToolKindAction,
		Config: json.RawMessage(`{"action_id":"safe_action"}`),
	}
	if _, err := router.Invoke(context.Background(), "j", def, json.RawMessage(`{}`)); err != nil {
		t.Fatalf("invoke: %v", err)
	}
	if !hit {
		t.Error("router should have executed the action when require-approval is unset")
	}
	if len(sink.calls) != 0 {
		t.Errorf("sink should not be called when approval is not required, got %d calls", len(sink.calls))
	}
}

// TestActionTool_RequiresSinkWhenFlagSet ensures we refuse to fall
// back to direct execution when the flag is set but no sink is wired.
// That misconfiguration would silently bypass the gate — fail closed.
func TestActionTool_RequiresSinkWhenFlagSet(t *testing.T) {
	t.Parallel()
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	router := &HTTPToolRouter{
		OntologyActionsURL: srv.URL,
		// Proposals deliberately nil
		HTTP: srv.Client(),
	}
	def := models.ToolDefinition{
		Kind:   models.ToolKindAction,
		Config: json.RawMessage(`{"action_id":"dangerous","requires_human_approval":true}`),
	}
	out, err := router.Invoke(context.Background(), "j", def, json.RawMessage(`{}`))
	if err == nil {
		t.Error("expected error when require-approval flag is set without a wired sink")
	}
	if hit {
		t.Fatal("router must never execute a require-approval action without a sink")
	}
	if !strings.Contains(string(out), "refusing to auto-execute") {
		t.Errorf("unexpected observation: %s", string(out))
	}
}

func TestInitiatingUserContext_RoundTrips(t *testing.T) {
	t.Parallel()
	ctx := WithInitiatingUser(context.Background(), "user-42")
	if got := InitiatingUserFromContext(ctx); got != "user-42" {
		t.Errorf("got %q, want user-42", got)
	}
	if got := InitiatingUserFromContext(context.Background()); got != "" {
		t.Errorf("unset should be empty, got %q", got)
	}
}
