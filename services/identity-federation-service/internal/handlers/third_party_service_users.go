package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
)

const thirdPartyServiceUserWarning = "Client credentials workloads execute as the application's service user. Grant only the platform roles and project/resource roles required for the workload; rotating the client secret does not change existing service-user grants."

func (h *RBAC) GetThirdPartyApplicationServiceUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireThirdPartyApplicationRead(w, r)
	if !ok {
		return
	}
	app, ok := h.loadThirdPartyApplication(w, r)
	if !ok {
		return
	}
	if !canReadThirdPartyApplication(claims, app) {
		writeJSONErr(w, http.StatusForbidden, "forbidden")
		return
	}
	inspection, err := h.buildThirdPartyServiceUserInspection(r, app)
	if err != nil {
		slog.Error("inspect third-party service user", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, inspection)
}

func (h *RBAC) EnsureThirdPartyApplicationServiceUser(w http.ResponseWriter, r *http.Request) {
	claims, app, ok := h.requireThirdPartyServiceUserAdmin(w, r)
	if !ok {
		return
	}
	if app.ClientType != models.ThirdPartyClientTypeConfidential {
		writeJSONErr(w, http.StatusBadRequest, "service users require a confidential OAuth client")
		return
	}
	if !containsThirdPartyString(app.EnabledGrantTypes, models.ThirdPartyGrantClientCredentials) {
		app.EnabledGrantTypes = append(app.EnabledGrantTypes, models.ThirdPartyGrantClientCredentials)
		app.EnabledGrantTypes = normalizeThirdPartyStringSet(app.EnabledGrantTypes)
	}
	serviceUser := serviceUserSeedForThirdPartyApplication(app, claims.Sub)
	if serviceUser == nil {
		writeJSONErr(w, http.StatusBadRequest, "client_credentials grant is required")
		return
	}
	saved, err := h.Repo.EnsureThirdPartyApplicationServiceUser(r.Context(), app, serviceUser, claims.Sub, time.Now().UTC())
	if err != nil {
		slog.Error("ensure third-party service user", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	inspection, err := h.buildThirdPartyServiceUserInspection(r, saved)
	if err != nil {
		slog.Error("inspect ensured third-party service user", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, inspection)
}

func (h *RBAC) AssignThirdPartyServiceUserRole(w http.ResponseWriter, r *http.Request) {
	claims, app, serviceUserID, ok := h.requireThirdPartyServiceUserWithUser(w, r)
	if !ok {
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid role id")
		return
	}
	role, err := h.Repo.GetRole(r.Context(), roleID)
	if err != nil {
		slog.Error("lookup service user role", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if role == nil {
		writeJSONErr(w, http.StatusNotFound, "role not found")
		return
	}
	if err := h.Repo.AssignRoleToUser(r.Context(), serviceUserID, roleID); err != nil {
		slog.Error("assign service user role", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.Repo.RecordThirdPartyServiceUserAuditEvent(r.Context(), app.ID, &serviceUserID, &claims.Sub, models.ThirdPartyServiceUserAuditPlatformRoleGranted, map[string]any{
		"role_id":   role.ID.String(),
		"role_name": role.Name,
	}); err != nil {
		slog.Error("audit service user role grant", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	inspection, err := h.buildThirdPartyServiceUserInspection(r, app)
	if err != nil {
		slog.Error("inspect service user after role grant", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, inspection)
}

func (h *RBAC) RevokeThirdPartyServiceUserRole(w http.ResponseWriter, r *http.Request) {
	claims, app, serviceUserID, ok := h.requireThirdPartyServiceUserWithUser(w, r)
	if !ok {
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid role id")
		return
	}
	role, err := h.Repo.GetRole(r.Context(), roleID)
	if err != nil {
		slog.Error("lookup service user role", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if role == nil {
		writeJSONErr(w, http.StatusNotFound, "role not found")
		return
	}
	if err := h.Repo.RevokeRoleFromUser(r.Context(), serviceUserID, roleID); err != nil {
		slog.Error("revoke service user role", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.Repo.RecordThirdPartyServiceUserAuditEvent(r.Context(), app.ID, &serviceUserID, &claims.Sub, models.ThirdPartyServiceUserAuditPlatformRoleRevoked, map[string]any{
		"role_id":   role.ID.String(),
		"role_name": role.Name,
	}); err != nil {
		slog.Error("audit service user role revoke", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	inspection, err := h.buildThirdPartyServiceUserInspection(r, app)
	if err != nil {
		slog.Error("inspect service user after role revoke", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, inspection)
}

func (h *RBAC) CreateThirdPartyServiceUserGrant(w http.ResponseWriter, r *http.Request) {
	claims, app, serviceUserID, ok := h.requireThirdPartyServiceUserWithUser(w, r)
	if !ok {
		return
	}
	var body models.CreateThirdPartyServiceUserGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	grant, err := buildThirdPartyServiceUserGrant(app.ID, serviceUserID, claims.Sub, body)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := h.Repo.CreateThirdPartyServiceUserGrant(r.Context(), grant)
	if err != nil {
		slog.Error("create service user grant", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.Repo.RecordThirdPartyServiceUserAuditEvent(r.Context(), app.ID, &serviceUserID, &claims.Sub, models.ThirdPartyServiceUserAuditGrantCreated, map[string]any{
		"grant_id":   saved.ID.String(),
		"scope_type": saved.ScopeType,
		"scope_id":   saved.ScopeID,
		"role_key":   saved.RoleKey,
	}); err != nil {
		slog.Error("audit service user grant", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (h *RBAC) RevokeThirdPartyServiceUserGrant(w http.ResponseWriter, r *http.Request) {
	claims, app, _, ok := h.requireThirdPartyServiceUserWithUser(w, r)
	if !ok {
		return
	}
	grantID, err := uuid.Parse(chi.URLParam(r, "grant_id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid grant id")
		return
	}
	grant, err := h.Repo.RevokeThirdPartyServiceUserGrant(r.Context(), app.ID, grantID, claims.Sub, time.Now().UTC())
	if err != nil {
		slog.Error("revoke service user grant", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if grant == nil {
		writeJSONErr(w, http.StatusNotFound, "grant not found")
		return
	}
	writeJSON(w, http.StatusOK, grant)
}

func (h *RBAC) ListThirdPartyServiceUserAuditEvents(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireThirdPartyApplicationRead(w, r)
	if !ok {
		return
	}
	app, ok := h.loadThirdPartyApplication(w, r)
	if !ok {
		return
	}
	if !canReadThirdPartyApplication(claims, app) {
		writeJSONErr(w, http.StatusForbidden, "forbidden")
		return
	}
	events, err := h.Repo.ListThirdPartyServiceUserAuditEvents(r.Context(), app.ID, 100)
	if err != nil {
		slog.Error("list service user audit", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": events, "total": len(events)})
}

func (h *RBAC) requireThirdPartyServiceUserAdmin(w http.ResponseWriter, r *http.Request) (*authmw.Claims, *models.ThirdPartyApplication, bool) {
	claims, ok := requireThirdPartyApplicationAdmin(w, r)
	if !ok {
		return nil, nil, false
	}
	app, ok := h.loadThirdPartyApplication(w, r)
	if !ok {
		return nil, nil, false
	}
	if !canManageThirdPartyApplicationOrganization(claims, app.ManagingOrganizationID) {
		writeJSONErr(w, http.StatusForbidden, "missing Manage OAuth 2.0 clients permission for managing organization")
		return nil, nil, false
	}
	return claims, app, true
}

func (h *RBAC) requireThirdPartyServiceUserWithUser(w http.ResponseWriter, r *http.Request) (*authmw.Claims, *models.ThirdPartyApplication, uuid.UUID, bool) {
	claims, app, ok := h.requireThirdPartyServiceUserAdmin(w, r)
	if !ok {
		return nil, nil, uuid.Nil, false
	}
	if app.ServiceUserID == nil || *app.ServiceUserID == uuid.Nil {
		writeJSONErr(w, http.StatusBadRequest, "application has no service user; enable client_credentials first")
		return nil, nil, uuid.Nil, false
	}
	return claims, app, *app.ServiceUserID, true
}

func (h *RBAC) buildThirdPartyServiceUserInspection(r *http.Request, app *models.ThirdPartyApplication) (models.ThirdPartyServiceUserInspection, error) {
	inspection := models.ThirdPartyServiceUserInspection{
		Application:              *app,
		ClientCredentialsEnabled: containsThirdPartyString(app.EnabledGrantTypes, models.ThirdPartyGrantClientCredentials),
		Warning:                  thirdPartyServiceUserWarning,
	}
	grants, err := h.Repo.ListThirdPartyServiceUserGrants(r.Context(), app.ID, false)
	if err != nil {
		return inspection, err
	}
	inspection.ResourceGrants = grants
	events, err := h.Repo.ListThirdPartyServiceUserAuditEvents(r.Context(), app.ID, 25)
	if err != nil {
		return inspection, err
	}
	inspection.AuditEvents = events
	if app.ServiceUserID == nil || *app.ServiceUserID == uuid.Nil {
		return inspection, nil
	}
	user, err := h.Repo.FindUserByID(r.Context(), *app.ServiceUserID)
	if err != nil {
		return inspection, err
	}
	if user == nil {
		return inspection, nil
	}
	inspection.ServiceUser = user
	roles, err := h.Repo.ListUserRoles(r.Context(), user.ID)
	if err != nil {
		return inspection, err
	}
	inspection.PlatformRoles = roles
	_, permissions, err := h.Repo.ListUserSecuritySnapshot(r.Context(), user.ID)
	if err != nil {
		return inspection, err
	}
	inspection.Permissions = permissions
	return inspection, nil
}

func buildThirdPartyServiceUserGrant(applicationID, serviceUserID, actor uuid.UUID, body models.CreateThirdPartyServiceUserGrantRequest) (*models.ThirdPartyServiceUserGrant, error) {
	scopeType := strings.TrimSpace(body.ScopeType)
	scopeID := strings.TrimSpace(body.ScopeID)
	roleKey := strings.TrimSpace(body.RoleKey)
	switch scopeType {
	case models.ThirdPartyServiceUserGrantScopeProject, models.ThirdPartyServiceUserGrantScopeResource:
	default:
		return nil, fmt.Errorf("scope_type must be project or resource")
	}
	if scopeID == "" {
		return nil, fmt.Errorf("scope_id is required")
	}
	if roleKey == "" {
		return nil, fmt.Errorf("role_key is required")
	}
	return &models.ThirdPartyServiceUserGrant{
		ID:            uuid.New(),
		ApplicationID: applicationID,
		ServiceUserID: serviceUserID,
		ScopeType:     scopeType,
		ScopeID:       scopeID,
		RoleKey:       roleKey,
		GrantedBy:     &actor,
	}, nil
}
