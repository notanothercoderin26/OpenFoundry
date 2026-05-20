// HTTP handlers for `/api/v1/apps` — the App Builder surface that the SPA's
// lib/api/apps.ts client calls. Scope here is the CRUD + publish path the
// dashboard fixture exercises; advanced editor endpoints (slate, preview,
// per-page CRUD, widget catalog) land in follow-up slices.
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/catalog"
	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/repo"
)

// branchFromRequest reads the `?branch=` query parameter and normalizes
// it through models.NormalizeBranch (defaults to "main" when absent).
// Every handler that touches branch-scoped state should call this.
func branchFromRequest(r *http.Request) string {
	return models.NormalizeBranch(r.URL.Query().Get("branch"))
}

func (h *Handlers) ListApps(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAppAccess(w, r, appAccessView, nil, "app.list"); !ok {
		return
	}
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))
	rows, total, err := h.Repo.ListApps(r.Context(), repo.ListAppsFilter{
		Search:  q.Get("search"),
		Status:  q.Get("status"),
		Branch:  branchFromRequest(r),
		Page:    page,
		PerPage: perPage,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": rows, "total": total})
}

func (h *Handlers) GetApp(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	if _, ok := h.requireAppAccess(w, r, appAccessView, &id, "app.get"); !ok {
		return
	}
	app, err := h.Repo.GetApp(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if app == nil {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (h *Handlers) CreateApp(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireAppAccess(w, r, appAccessEdit, nil, "app.create")
	if !ok {
		return
	}
	var body models.CreateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(body.Branch) == "" {
		body.Branch = branchFromRequest(r)
	} else {
		body.Branch = models.NormalizeBranch(body.Branch)
	}
	creator := claims.Sub
	app, err := h.Repo.CreateApp(r.Context(), &body, &creator)
	if err != nil {
		writeAppMutationError(w, err)
		return
	}
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:     &app.ID,
		AppSlug:   app.Slug,
		EventType: "app.create",
		Status:    "success",
		Details:   mustAuditDetails(map[string]any{"name": app.Name, "slug": app.Slug}),
	})
	writeJSON(w, http.StatusCreated, app)
}

func (h *Handlers) UpdateApp(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	claims, ok := h.requireAppAccess(w, r, appAccessEdit, &id, "app.update")
	if !ok {
		return
	}
	var body models.UpdateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	app, err := h.Repo.UpdateApp(r.Context(), id, &body)
	if err != nil {
		writeAppMutationError(w, err)
		return
	}
	if app == nil {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:     &app.ID,
		AppSlug:   app.Slug,
		EventType: "app.update",
		Status:    "success",
		Details:   mustAuditDetails(map[string]any{"status": app.Status}),
	})
	writeJSON(w, http.StatusOK, app)
}

func (h *Handlers) DeleteApp(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	claims, ok := h.requireAppAccess(w, r, appAccessEdit, &id, "app.delete")
	if !ok {
		return
	}
	deleted, err := h.Repo.DeleteApp(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:     &id,
		EventType: "app.delete",
		Status:    "success",
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) PublishApp(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	claims, ok := h.requireAppAccess(w, r, appAccessPublish, &id, "app.publish")
	if !ok {
		return
	}
	var body models.PublishAppRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	notes := strings.TrimSpace(body.Notes)
	if notes == "" {
		notes = strings.TrimSpace(body.Changelog)
	}
	publisher := claims.Sub
	v, err := h.Repo.PublishApp(r.Context(), id, notes, &publisher)
	if err != nil {
		writeAppMutationError(w, err)
		return
	}
	if v == nil {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:     &id,
		VersionID: &v.ID,
		EventType: "app.publish",
		Status:    "success",
		Details:   mustAuditDetails(map[string]any{"version_number": v.VersionNumber, "notes": v.Notes}),
	})
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) PromoteAppVersion(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	claims, ok := h.requireAppAccess(w, r, appAccessPublish, &id, "app.promote")
	if !ok {
		return
	}
	versionID, err := uuid.Parse(chi.URLParam(r, "versionID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "versionID must be a uuid")
		return
	}
	var body models.PromoteAppVersionRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	notes := strings.TrimSpace(body.Notes)
	if notes == "" {
		notes = strings.TrimSpace(body.Changelog)
	}
	promoter := claims.Sub
	v, err := h.Repo.PromoteAppVersion(r.Context(), id, versionID, notes, &promoter)
	if err != nil {
		writeAppMutationError(w, err)
		return
	}
	if v == nil {
		writeError(w, http.StatusNotFound, "app version not found")
		return
	}
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:     &id,
		VersionID: &v.ID,
		EventType: "app.promote",
		Status:    "success",
		Details:   mustAuditDetails(map[string]any{"source_version_id": versionID, "version_number": v.VersionNumber, "notes": v.Notes}),
	})
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) ListAppVersions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	if _, ok := h.requireAppAccess(w, r, appAccessView, &id, "app.versions.list"); !ok {
		return
	}
	rows, err := h.Repo.ListAppVersions(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": rows})
}

func (h *Handlers) PreviewApp(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	if _, ok := h.requireAppAccess(w, r, appAccessView, &id, "app.preview"); !ok {
		return
	}
	app, err := h.Repo.GetApp(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if app == nil {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	catalogDoc, err := catalog.LoadWidgetCatalog()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"app":                  app,
		"widget_catalog":       catalogDoc.Items,
		"embed":                embedInfo(app.Slug),
		"preview_mode":         "draft",
		"published_version_id": app.PublishedVersionID,
		"draft_updated_at":     app.UpdatedAt,
	})
}

func (h *Handlers) GetAppEmbedInfo(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	writeJSON(w, http.StatusOK, embedInfo(slug))
}

// GetPublishedApp serves the public-facing read endpoint used by embedded /
// runtime app surfaces. No auth required: published apps are designed to be
// consumed by anonymous portal visitors. Accepts an optional `?branch=` query
// parameter; defaults to `main` for backward compatibility.
func (h *Handlers) GetPublishedApp(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	branch := branchFromRequest(r)
	app, err := h.Repo.GetAppBySlug(r.Context(), slug, branch)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if app == nil || app.PublishedVersionID == nil {
		writeError(w, http.StatusNotFound, "no published version for slug")
		return
	}
	v, err := h.Repo.GetPublishedVersion(r.Context(), app.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeError(w, http.StatusNotFound, "published version missing")
		return
	}
	publishedApp, err := appFromPublishedVersion(app, v)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !publishedAppIsPublic(app, v) {
		writeError(w, http.StatusNotFound, "no public published version for slug")
		return
	}
	publishedAt := v.CreatedAt
	if v.PublishedAt != nil {
		publishedAt = *v.PublishedAt
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"app":                      publishedApp,
		"embed":                    embedInfo(slug),
		"published_version_number": v.VersionNumber,
		"published_at":             publishedAt,
	})
}

type appVersionSnapshot struct {
	SchemaVersion string          `json:"schema_version"`
	Name          string          `json:"name"`
	Slug          string          `json:"slug"`
	Description   string          `json:"description"`
	Status        string          `json:"status"`
	Pages         json.RawMessage `json:"pages"`
	Theme         json.RawMessage `json:"theme"`
	Settings      json.RawMessage `json:"settings"`
	TemplateKey   *string         `json:"template_key"`
}

func appFromPublishedVersion(current *models.App, version *models.AppVersion) (*models.App, error) {
	if current == nil || version == nil {
		return current, nil
	}
	published := *current
	published.PublishedVersionID = &version.ID
	published.Status = "published"
	published.UpdatedAt = version.CreatedAt
	if len(version.AppSnapshot) == 0 || string(version.AppSnapshot) == "null" {
		return &published, nil
	}
	var snapshot appVersionSnapshot
	if err := json.Unmarshal(version.AppSnapshot, &snapshot); err != nil {
		return nil, err
	}
	if strings.TrimSpace(snapshot.Name) != "" {
		published.Name = snapshot.Name
	}
	if strings.TrimSpace(snapshot.Slug) != "" {
		published.Slug = snapshot.Slug
	}
	published.Description = snapshot.Description
	if strings.TrimSpace(snapshot.Status) != "" {
		published.Status = snapshot.Status
	}
	if len(snapshot.Pages) > 0 {
		published.Pages = snapshot.Pages
	}
	if len(snapshot.Theme) > 0 {
		published.Theme = snapshot.Theme
	}
	if len(snapshot.Settings) > 0 {
		published.Settings = snapshot.Settings
	}
	published.TemplateKey = snapshot.TemplateKey
	published.Status = "published"
	return &published, nil
}

func publishedAppIsPublic(current *models.App, version *models.AppVersion) bool {
	if current == nil || version == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(current.Status), "archived") {
		return false
	}
	if len(version.AppSnapshot) == 0 || string(version.AppSnapshot) == "null" {
		return version.Status == "published"
	}
	var snapshot appVersionSnapshot
	if err := json.Unmarshal(version.AppSnapshot, &snapshot); err != nil {
		return false
	}
	status := strings.TrimSpace(snapshot.Status)
	return status == "" || status == "published"
}

func embedInfo(slug string) map[string]any {
	url := "/apps/runtime/" + slug
	return map[string]any{
		"url":         url,
		"iframe_html": `<iframe src="` + url + `" loading="lazy" style="width:100%;height:720px;border:0;"></iframe>`,
	}
}
