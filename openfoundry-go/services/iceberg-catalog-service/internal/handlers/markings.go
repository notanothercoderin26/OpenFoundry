package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/audit"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/authz"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/domain/markings"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/handlers/auth"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
)

// MarkingsStore is the slice of repo behaviour the markings handlers
// depend on. Defining the shape here keeps the package free of pgx
// coupling so unit tests can pass a fake.
type MarkingsStore interface {
	GetNamespaceByProjectName(ctx context.Context, projectRID, name string) (*models.IcebergNamespace, error)
	GetTable(ctx context.Context, projectRID string, namespace []string, tableName string) (*models.IcebergTable, error)
	LoadNamespaceMarkings(ctx context.Context, namespaceID uuid.UUID) (*markings.NamespaceMarkings, error)
	LoadTableMarkings(ctx context.Context, tableID uuid.UUID) (*markings.TableMarkings, error)
	SetNamespaceMarkings(ctx context.Context, namespaceID uuid.UUID, ids []uuid.UUID, actor uuid.UUID) error
	SetTableExplicitMarkings(ctx context.Context, tableID uuid.UUID, ids []uuid.UUID, actor uuid.UUID) error
	ResolveMarkingName(ctx context.Context, name string) (uuid.UUID, error)
}

// MarkingsHandlers serves the /iceberg/v1/.../markings endpoints.
//
// Mirrors services/iceberg-catalog-service/src/handlers/markings.rs.
// The enforcement-side `ensureMarkingsAllowed` (read-time clearance
// check) lives in handlers.go and operates on a different surface;
// this handler owns the marking *management* (CRUD) side.
type MarkingsHandlers struct {
	Store         MarkingsStore
	Authz         authz.Engine
	DefaultTenant string
}

// UpdateMarkingsRequest is the body of POST .../namespaces/{ns}/markings
// and PATCH .../tables/{tbl}/markings. The replacement set is resolved
// to ids via `iceberg_marking_names`; unknown names → 400.
type UpdateMarkingsRequest struct {
	Markings []string `json:"markings"`
}

// GetNamespaceMarkings serves GET /iceberg/v1/namespaces/{ns}/markings.
func (h *MarkingsHandlers) GetNamespaceMarkings(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		auth.WriteAuthError(w, auth.ErrUnauthenticated{})
		return
	}
	ns, err := h.fetchNamespace(r)
	if err != nil {
		writeMarkingsErr(w, err)
		return
	}
	projection, err := h.Store.LoadNamespaceMarkings(r.Context(), ns.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	resource := authz.NamespaceResource(
		fmt.Sprintf("ri.foundry.main.iceberg-namespace.%s", ns.ID),
		ns.ProjectRID,
		h.tenant(principal),
		ns.Name,
		markings.Names(projection.Effective),
	)
	if err := h.enforce(r.Context(), principal, "iceberg::namespace::view", resource); err != nil {
		writeAuthzErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

// UpdateNamespaceMarkings serves POST /iceberg/v1/namespaces/{ns}/markings.
// Requires the iceberg::namespace::manage_markings policy.
func (h *MarkingsHandlers) UpdateNamespaceMarkings(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		auth.WriteAuthError(w, auth.ErrUnauthenticated{})
		return
	}
	ns, err := h.fetchNamespace(r)
	if err != nil {
		writeMarkingsErr(w, err)
		return
	}

	before, err := h.Store.LoadNamespaceMarkings(r.Context(), ns.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	resource := authz.NamespaceResource(
		fmt.Sprintf("ri.foundry.main.iceberg-namespace.%s", ns.ID),
		ns.ProjectRID,
		h.tenant(principal),
		ns.Name,
		markings.Names(before.Effective),
	)
	if err := h.enforce(r.Context(), principal, "iceberg::namespace::manage_markings", resource); err != nil {
		writeAuthzErr(w, err)
		return
	}

	var body UpdateMarkingsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	ids, err := h.resolveMarkingIDs(r.Context(), body.Markings)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	actor := parseActor(principal)
	if err := h.Store.SetNamespaceMarkings(r.Context(), ns.ID, ids, actor); err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	after, err := h.Store.LoadNamespaceMarkings(r.Context(), ns.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	audit.MarkingsUpdated(
		actor,
		fmt.Sprintf("ri.foundry.main.iceberg-namespace.%s", ns.ID),
		"namespace",
		markings.Names(before.Effective),
		markings.Names(after.Effective),
	)
	writeJSON(w, http.StatusOK, after)
}

// GetTableMarkings serves GET /iceberg/v1/namespaces/{ns}/tables/{tbl}/markings.
func (h *MarkingsHandlers) GetTableMarkings(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		auth.WriteAuthError(w, auth.ErrUnauthenticated{})
		return
	}
	tab, err := h.fetchTable(r)
	if err != nil {
		writeMarkingsErr(w, err)
		return
	}
	projection, err := h.Store.LoadTableMarkings(r.Context(), tab.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	resource := authz.TableResource(
		tab.RID,
		fmt.Sprintf("ri.foundry.main.iceberg-namespace.%s", tab.NamespaceID),
		h.tenant(principal),
		tab.FormatVersion,
		markings.Names(projection.Effective),
		markings.Names(projection.Explicit),
	)
	if err := h.enforce(r.Context(), principal, "iceberg::table::view", resource); err != nil {
		writeAuthzErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

// UpdateTableMarkings serves PATCH .../tables/{tbl}/markings.
// Requires iceberg::table::manage_markings.
func (h *MarkingsHandlers) UpdateTableMarkings(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		auth.WriteAuthError(w, auth.ErrUnauthenticated{})
		return
	}
	tab, err := h.fetchTable(r)
	if err != nil {
		writeMarkingsErr(w, err)
		return
	}

	before, err := h.Store.LoadTableMarkings(r.Context(), tab.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	resource := authz.TableResource(
		tab.RID,
		fmt.Sprintf("ri.foundry.main.iceberg-namespace.%s", tab.NamespaceID),
		h.tenant(principal),
		tab.FormatVersion,
		markings.Names(before.Effective),
		markings.Names(before.Explicit),
	)
	if err := h.enforce(r.Context(), principal, "iceberg::table::manage_markings", resource); err != nil {
		writeAuthzErr(w, err)
		return
	}

	var body UpdateMarkingsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	ids, err := h.resolveMarkingIDs(r.Context(), body.Markings)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	actor := parseActor(principal)
	if err := h.Store.SetTableExplicitMarkings(r.Context(), tab.ID, ids, actor); err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	after, err := h.Store.LoadTableMarkings(r.Context(), tab.ID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	beforeExplicit := markings.Names(before.Explicit)
	for _, n := range markings.Names(after.Explicit) {
		if !containsString(beforeExplicit, n) {
			audit.MarkingsOverrideCreated(actor, tab.RID, n)
		}
	}
	audit.MarkingsUpdated(
		actor, tab.RID, "table",
		markings.Names(before.Effective),
		markings.Names(after.Effective),
	)
	writeJSON(w, http.StatusOK, after)
}

func (h *MarkingsHandlers) fetchNamespace(r *http.Request) (*models.IcebergNamespace, error) {
	parts := namespacePath(chi.URLParam(r, "namespace"))
	encoded := joinNamespacePath(parts)
	ns, err := h.Store.GetNamespaceByProjectName(r.Context(), projectRID(r), encoded)
	if err != nil {
		return nil, err
	}
	if ns == nil {
		return nil, errMarkingsNotFound{kind: "namespace"}
	}
	return ns, nil
}

func (h *MarkingsHandlers) fetchTable(r *http.Request) (*models.IcebergTable, error) {
	parts := namespacePath(chi.URLParam(r, "namespace"))
	tab, err := h.Store.GetTable(r.Context(), projectRID(r), parts, chi.URLParam(r, "table"))
	if err != nil {
		return nil, err
	}
	if tab == nil {
		return nil, errMarkingsNotFound{kind: "table"}
	}
	return tab, nil
}

func (h *MarkingsHandlers) tenant(p *auth.AuthenticatedPrincipal) string {
	if p != nil && p.Tenant != "" {
		return p.Tenant
	}
	if h.DefaultTenant != "" {
		return h.DefaultTenant
	}
	return "default"
}

func (h *MarkingsHandlers) resolveMarkingIDs(ctx context.Context, names []string) ([]uuid.UUID, error) {
	out := make([]uuid.UUID, 0, len(names))
	for _, n := range names {
		id, err := h.Store.ResolveMarkingName(ctx, n)
		if err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, nil
}

func (h *MarkingsHandlers) enforce(ctx context.Context, principal *auth.AuthenticatedPrincipal, action string, resource *authz.Resource) error {
	if h.Authz == nil {
		return nil
	}
	return h.Authz.Enforce(ctx, principal.AsAuthzPrincipal(), action, resource)
}

func parseActor(p *auth.AuthenticatedPrincipal) uuid.UUID {
	if p == nil {
		return uuid.Nil
	}
	id, err := uuid.Parse(p.Subject)
	if err != nil {
		return uuid.Nil
	}
	return id
}

func containsString(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func writeAuthzErr(w http.ResponseWriter, err error) {
	var denied *authz.DenyError
	if errors.As(err, &denied) {
		writeJSONErr(w, http.StatusForbidden, denied.Error())
		return
	}
	writeJSONErr(w, http.StatusInternalServerError, err.Error())
}

type errMarkingsNotFound struct{ kind string }

func (e errMarkingsNotFound) Error() string { return e.kind + " not found" }

func writeMarkingsErr(w http.ResponseWriter, err error) {
	var nf errMarkingsNotFound
	if errors.As(err, &nf) {
		writeJSONErr(w, http.StatusNotFound, nf.Error())
		return
	}
	writeJSONErr(w, http.StatusInternalServerError, err.Error())
}

// joinNamespacePath rebuilds the dotted form GetNamespaceByProjectName
// expects. Mirrors `domain::namespace::encode_path` in Rust.
func joinNamespacePath(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for _, p := range parts[1:] {
		out += "." + p
	}
	return out
}
