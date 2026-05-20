package handlers

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// ListAuditLog is GET /api/v1/ontology/audit-log.
//
// Query parameters (all optional):
//   - resource_kind  one of object_type / property / link_type /
//                    object_type_group / shared_property_type
//   - resource_id    uuid; scopes to a single resource's history
//   - batch_id       uuid; scopes to one Save click in the modal
//   - changed_by     uuid; scopes to one author
//   - limit          int 1..1000, default 100
//   - offset         int >= 0, default 0
//
// Returns `AuditLogPage` so the frontend can render the History view
// with stable date ordering and paginate as the list grows.
func (h *Handlers) ListAuditLog(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}

	filter := models.AuditLogFilter{
		ResourceKind: r.URL.Query().Get("resource_kind"),
	}
	if raw := r.URL.Query().Get("resource_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid resource_id")
			return
		}
		filter.ResourceID = &id
	}
	if raw := r.URL.Query().Get("batch_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid batch_id")
			return
		}
		filter.BatchID = &id
	}
	if raw := r.URL.Query().Get("changed_by"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid changed_by")
			return
		}
		filter.ChangedBy = &id
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			writeJSONErr(w, http.StatusBadRequest, "invalid limit")
			return
		}
		filter.Limit = v
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 0 {
			writeJSONErr(w, http.StatusBadRequest, "invalid offset")
			return
		}
		filter.Offset = v
	}

	entries, err := h.Repo.ListAuditLog(r.Context(), filter)
	if err != nil {
		slog.Error("list audit log", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list audit log")
		return
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	writeJSON(w, http.StatusOK, models.AuditLogPage{
		Data:   entries,
		Limit:  limit,
		Offset: filter.Offset,
	})
}
