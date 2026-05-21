package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
	repopkg "github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/repo"
)

// Proposals owns the human-in-the-loop review surface for
// agent-proposed Actions. Approving a proposal dispatches to
// ontology-actions-service with the approver's JWT — never the agent's
// service identity — so the audit trail names the human who applied
// the change.
type Proposals struct {
	Repo               *repopkg.Repo
	OntologyActionsURL string
	HTTP               *http.Client
}

// RepoProposalSink adapts the agent-runtime Repo to the
// react.ProposalSink interface. The tool router uses this to stage
// proposals from inside the ReAct loop.
type RepoProposalSink struct {
	Repo *repopkg.Repo
}

// StageActionProposal implements react.ProposalSink.
func (s *RepoProposalSink) StageActionProposal(ctx context.Context, req react.ProposalStageRequest) (string, error) {
	if s.Repo == nil {
		return "", errors.New("proposal sink: repo is nil")
	}
	var initiatorID uuid.UUID
	if req.InitiatingUserID != "" {
		parsed, err := uuid.Parse(req.InitiatingUserID)
		if err != nil {
			return "", fmt.Errorf("initiating user id must be a uuid: %w", err)
		}
		initiatorID = parsed
	}
	var justification *string
	if strings.TrimSpace(req.Justification) != "" {
		j := req.Justification
		justification = &j
	}
	proposal, err := s.Repo.CreateActionProposal(ctx, models.CreateActionProposalRequest{
		InitiatingUserID: initiatorID,
		ActionTypeID:     req.ActionTypeID,
		Arguments:        req.Arguments,
		Justification:    justification,
	})
	if err != nil {
		return "", err
	}
	return proposal.ID.String(), nil
}

// List handles GET /api/v1/agent-runtime/action-proposals?status=…&limit=…
func (h *Proposals) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := logicClaims(w, r); !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	proposals, err := h.Repo.ListActionProposals(r.Context(), status, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListActionProposalsResponse{Data: proposals})
}

// Get handles GET /api/v1/agent-runtime/action-proposals/{id}.
func (h *Proposals) Get(w http.ResponseWriter, r *http.Request) {
	if _, ok := logicClaims(w, r); !ok {
		return
	}
	id, ok := parseProposalID(w, r)
	if !ok {
		return
	}
	proposal, err := h.Repo.GetActionProposal(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if proposal == nil {
		writeError(w, http.StatusNotFound, "action proposal not found")
		return
	}
	writeJSON(w, http.StatusOK, proposal)
}

// Approve handles POST /api/v1/agent-runtime/action-proposals/{id}/approve.
// On approval the action executes downstream with the *approver's* JWT
// — that's what the audit trail will name as the actor. The agent
// that proposed it is recorded in initiating_user_id for traceability,
// but does not own the side effect.
func (h *Proposals) Approve(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseProposalID(w, r)
	if !ok {
		return
	}
	var body models.DecideActionProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	proposal, err := h.Repo.GetActionProposal(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if proposal == nil {
		writeError(w, http.StatusNotFound, "action proposal not found")
		return
	}
	if proposal.Status != models.ActionProposalStatusPending {
		writeError(w, http.StatusConflict, fmt.Sprintf("proposal already %s", proposal.Status))
		return
	}
	// Dispatch the staged action with the approver's JWT, never the
	// agent's. ontology-actions-service applies its own Cedar policy
	// gate against the approver — so a reviewer who could not call
	// the action directly cannot promote a staged proposal either.
	appliedResponse, applyErr := h.executeDownstream(r.Context(), bearerToken(r), proposal.ActionTypeID, proposal.Arguments)
	if applyErr != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("downstream apply failed: %s", applyErr.Error()))
		return
	}
	appliedActionID := proposal.ActionTypeID
	updated, err := h.Repo.MarkActionProposalDecided(
		r.Context(), id, claims.Sub,
		models.ActionProposalStatusApproved,
		body.Note,
		&appliedActionID,
		appliedResponse,
	)
	if errors.Is(err, repopkg.ErrActionProposalAlreadyDecided) {
		// Concurrent approval: somebody beat us to it. Return the
		// current state so the UI re-syncs instead of double-applying.
		writeJSON(w, http.StatusConflict, updated)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// Dismiss handles POST /api/v1/agent-runtime/action-proposals/{id}/dismiss.
// No downstream call — dismissal is local-only by definition.
func (h *Proposals) Dismiss(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseProposalID(w, r)
	if !ok {
		return
	}
	var body models.DecideActionProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.Repo.MarkActionProposalDecided(
		r.Context(), id, claims.Sub,
		models.ActionProposalStatusDismissed,
		body.Note, nil, nil,
	)
	if errors.Is(err, repopkg.ErrActionProposalAlreadyDecided) {
		writeJSON(w, http.StatusConflict, updated)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated == nil {
		writeError(w, http.StatusNotFound, "action proposal not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Proposals) executeDownstream(ctx context.Context, callerJWT, actionTypeID string, args json.RawMessage) (json.RawMessage, error) {
	if strings.TrimSpace(h.OntologyActionsURL) == "" {
		return nil, errors.New("ontology-actions-service URL is not configured")
	}
	endpoint := fmt.Sprintf("%s/api/v1/ontology/actions/%s/execute",
		strings.TrimRight(h.OntologyActionsURL, "/"),
		actionTypeID,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(args))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if callerJWT != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimPrefix(callerJWT, "Bearer "))
	}
	client := h.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return body, fmt.Errorf("downstream returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if len(body) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return body, nil
}

func parseProposalID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return uuid.Nil, false
	}
	return id, true
}
