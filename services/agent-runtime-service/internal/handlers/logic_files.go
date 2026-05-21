package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
	repopkg "github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/repo"
)

// parseLogicDepthHeader interprets the X-Logic-Depth header. An
// empty value means "this is a top-level invocation" (depth 0).
// Non-numeric or negative values are rejected so a malformed header
// cannot bypass the recursion guard.
func parseLogicDepthHeader(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("invalid %s header %q", react.LogicDepthHeader, raw)
	}
	return n, nil
}

func logicClaims(w http.ResponseWriter, r *http.Request) (*authmw.Claims, bool) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return nil, false
	}
	return claims, true
}

func validateExecutionMode(mode *string) bool {
	if mode == nil {
		return true
	}
	switch *mode {
	case "user_scoped", "project_scoped":
		return true
	default:
		return false
	}
}

func validateRunHistoryMaxRows(value *int32) bool {
	if value == nil {
		return true
	}
	return *value >= 1 && *value <= 1000000
}

func validateLogicName(name string) bool {
	return strings.TrimSpace(name) != ""
}

func isZeroUUID(id uuid.UUID) bool { return id == uuid.Nil }

func parseOptionalUUIDQuery(value string) (*uuid.UUID, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func parseLogicFileID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return uuid.Nil, false
	}
	return id, true
}

func parseLogicVersionID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "version_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "version_id must be a uuid")
		return uuid.Nil, false
	}
	return id, true
}

func requestBaseURL(r *http.Request) string {
	if base := strings.TrimRight(strings.TrimSpace(r.URL.Query().Get("base_url")), "/"); base != "" {
		return base
	}
	scheme := "http"
	if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto != "" {
		scheme = strings.TrimSpace(strings.Split(proto, ",")[0])
	} else if r.TLS != nil {
		scheme = "https"
	}
	host := r.Host
	if forwardedHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); forwardedHost != "" {
		host = strings.TrimSpace(strings.Split(forwardedHost, ",")[0])
	}
	if strings.TrimSpace(host) == "" {
		host = "localhost:8080"
	}
	return scheme + "://" + host
}

func (h *Handlers) CreateLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	var body models.CreateLogicFileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !validateLogicName(body.Name) {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if isZeroUUID(body.ProjectID) || isZeroUUID(body.FolderID) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for Logic files")
		return
	}
	if !validateExecutionMode(body.ExecutionMode) {
		writeError(w, http.StatusBadRequest, "execution_mode must be user_scoped or project_scoped")
		return
	}
	if !validateRunHistoryMaxRows(body.RunHistoryMaxRows) {
		writeError(w, http.StatusBadRequest, "run_history_max_rows must be between 1 and 1000000")
		return
	}
	lf, err := h.Repo.CreateLogicFile(r.Context(), claims.Sub, body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, lf)
}

func (h *Handlers) GetLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	lf, err := h.Repo.GetLogicFile(r.Context(), id, claims.Sub, includeArchived, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, lf)
}

// ListLogicFunctionsAsTools projects every Logic function the
// caller can invoke into the ToolDefinition shape an agent's tool
// manifest stores. The agent-creation UI consumes this to populate
// the "available tools" picker — see ChatbotStudio in apps/web.
// Filterable by project_id so an analyst building an agent inside a
// project only sees the functions scoped to that project.
func (h *Handlers) ListLogicFunctionsAsTools(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	projectID, err := parseOptionalUUIDQuery(r.URL.Query().Get("project_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "project_id must be a uuid")
		return
	}
	fns, err := h.Repo.ListPublishedLogicFunctions(r.Context(), projectID, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools := make([]models.ToolDefinition, 0, len(fns))
	for _, fn := range fns {
		tools = append(tools, models.ToolDefinition{
			Name:        toolDisplayName(fn),
			Kind:        models.ToolKindFunction,
			Description: toolDescription(fn),
			Config:      json.RawMessage(fmt.Sprintf(`{"function_rid":%q}`, fn.FunctionRID)),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

// toolDisplayName converts a Logic function's published name into a
// stable tool identifier (lowercase, underscore-separated). Falls
// back to the function RID so the result is always non-empty.
func toolDisplayName(fn models.LogicFunction) string {
	name := strings.ToLower(strings.TrimSpace(fn.Name))
	if name == "" {
		return fn.FunctionRID
	}
	sb := strings.Builder{}
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			sb.WriteRune(r)
		default:
			sb.WriteRune('_')
		}
	}
	return sb.String()
}

func toolDescription(fn models.LogicFunction) string {
	if fn.Name != "" {
		return fmt.Sprintf("Invoke Logic function %s (%s)", fn.Name, fn.FunctionRID)
	}
	return fmt.Sprintf("Invoke Logic function %s", fn.FunctionRID)
}

func (h *Handlers) ListLogicFiles(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	projectID, err := parseOptionalUUIDQuery(r.URL.Query().Get("project_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "project_id must be a uuid")
		return
	}
	folderID, err := parseOptionalUUIDQuery(r.URL.Query().Get("folder_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "folder_id must be a uuid")
		return
	}
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	files, err := h.Repo.ListLogicFiles(r.Context(), projectID, folderID, claims.Sub, includeArchived, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (h *Handlers) UpdateLogicFileMetadata(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	var body models.UpdateLogicFileMetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name != nil && !validateLogicName(*body.Name) {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if !validateExecutionMode(body.ExecutionMode) {
		writeError(w, http.StatusBadRequest, "execution_mode must be user_scoped or project_scoped")
		return
	}
	if !validateRunHistoryMaxRows(body.RunHistoryMaxRows) {
		writeError(w, http.StatusBadRequest, "run_history_max_rows must be between 1 and 1000000")
		return
	}
	lf, err := h.Repo.UpdateLogicFileMetadata(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, lf)
}

func (h *Handlers) MoveLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	var body models.MoveLogicFileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if isZeroUUID(body.ProjectID) || isZeroUUID(body.FolderID) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for Logic files")
		return
	}
	lf, err := h.Repo.MoveLogicFile(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, lf)
}

func (h *Handlers) DuplicateLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	var body models.DuplicateLogicFileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name != nil && !validateLogicName(*body.Name) {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if (body.ProjectID == nil) != (body.FolderID == nil) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id must be provided together")
		return
	}
	if body.ProjectID != nil && (isZeroUUID(*body.ProjectID) || isZeroUUID(*body.FolderID)) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for Logic files")
		return
	}
	lf, err := h.Repo.DuplicateLogicFile(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusCreated, lf)
}

func (h *Handlers) ArchiveLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	lf, err := h.Repo.ArchiveLogicFile(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, lf)
}

func (h *Handlers) RestoreLogicFile(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	lf, err := h.Repo.RestoreLogicFile(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lf == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, lf)
}

func (h *Handlers) SaveLogicDraftVersion(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	var body models.SaveLogicDraftVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(string(body.Definition)) == "" {
		writeError(w, http.StatusBadRequest, "definition must be a JSON object")
		return
	}
	version, err := h.Repo.SaveLogicDraftVersion(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if version == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusCreated, version)
}

func (h *Handlers) ListLogicVersions(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	versions, err := h.Repo.ListLogicVersions(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, versions)
}

func (h *Handlers) GetLogicVersion(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	versionID, ok := parseLogicVersionID(w, r)
	if !ok {
		return
	}
	version, err := h.Repo.GetLogicVersion(r.Context(), id, versionID, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if version == nil {
		writeError(w, http.StatusNotFound, "logic version not found")
		return
	}
	writeJSON(w, http.StatusOK, version)
}

func (h *Handlers) CompareLogicVersions(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	baseID, err := uuid.Parse(r.URL.Query().Get("base_version_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "base_version_id must be a uuid")
		return
	}
	headID, err := uuid.Parse(r.URL.Query().Get("head_version_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "head_version_id must be a uuid")
		return
	}
	comparison, err := h.Repo.CompareLogicVersions(r.Context(), id, baseID, headID, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if comparison == nil {
		writeError(w, http.StatusNotFound, "logic versions not found")
		return
	}
	writeJSON(w, http.StatusOK, comparison)
}

func (h *Handlers) PublishLogicVersion(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	versionID, ok := parseLogicVersionID(w, r)
	if !ok {
		return
	}
	var body models.PublishLogicVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	published, err := h.Repo.PublishLogicVersion(r.Context(), id, versionID, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if published == nil {
		writeError(w, http.StatusNotFound, "logic version not found")
		return
	}
	writeJSON(w, http.StatusOK, published)
}

func (h *Handlers) GetLogicUsage(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	usage, err := h.Repo.GetLogicUsage(r.Context(), id, claims.Sub, requestBaseURL(r), claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if usage == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, usage)
}

func (h *Handlers) ListLogicRuns(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	runs, err := h.Repo.ListLogicRuns(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

func (h *Handlers) GetLogicMetrics(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseLogicFileID(w, r)
	if !ok {
		return
	}
	metrics, err := h.Repo.GetLogicMetrics(r.Context(), id, claims.Sub, r.URL.Query().Get("window"), claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if metrics == nil {
		writeError(w, http.StatusNotFound, "logic file not found")
		return
	}
	writeJSON(w, http.StatusOK, metrics)
}

func (h *Handlers) InvokeLogicFunction(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	functionRID, err := url.PathUnescape(chi.URLParam(r, "function_rid"))
	if err != nil || strings.TrimSpace(functionRID) == "" {
		writeError(w, http.StatusBadRequest, "function_rid must not be empty")
		return
	}
	// Logic→Tool→Logic recursion guard. The HTTPToolRouter increments
	// X-Logic-Depth on every Logic invocation it dispatches; here we
	// refuse to start one more level past the cap and thread the
	// counter into the context so the executor's own tool calls can
	// keep counting.
	depth, depthErr := parseLogicDepthHeader(r.Header.Get(react.LogicDepthHeader))
	if depthErr != nil {
		writeError(w, http.StatusBadRequest, depthErr.Error())
		return
	}
	if depth >= react.MaxLogicInvocationDepth {
		writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("logic invocation depth %d exceeds limit %d", depth, react.MaxLogicInvocationDepth))
		return
	}
	ctx := react.WithLogicDepth(r.Context(), depth)
	// Stamp the invoker so any proposals the Logic function stages
	// via apply_action tools land with the correct initiator id.
	ctx = react.WithInitiatingUser(ctx, claims.Sub.String())
	var body models.InvokeLogicFunctionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	invocation, err := h.Repo.InvokeLogicFunction(ctx, functionRID, claims.Sub, bearerToken(r), body, claims.HasRole("admin"))
	if errors.Is(err, repopkg.ErrLogicFunctionAPINotSupported) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if invocation == nil {
		writeError(w, http.StatusNotFound, "logic function not found")
		return
	}
	writeJSON(w, http.StatusOK, invocation)
}
