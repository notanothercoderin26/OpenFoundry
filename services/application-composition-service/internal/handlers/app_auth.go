package handlers

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/models"
)

const (
	appAccessView    = "view"
	appAccessEdit    = "edit"
	appAccessPublish = "publish"
)

func (h *Handlers) requireAppAccess(w http.ResponseWriter, r *http.Request, action string, appID *uuid.UUID, eventType string) (*authmw.Claims, bool) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return nil, false
	}
	if claimsCanAccessApp(claims, action, appID) {
		return claims, true
	}
	permission := "apps:" + action
	h.auditAppEvent(r.Context(), r, claims, models.AppAuditEvent{
		AppID:      appID,
		ActorID:    &claims.Sub,
		EventType:  eventType,
		Status:     "denied",
		Permission: permission,
		Details:    mustAuditDetails(map[string]any{"reason": "missing permission", "action": action}),
	})
	writeError(w, http.StatusForbidden, "missing permission "+permission)
	return nil, false
}

func claimsCanAccessApp(claims *authmw.Claims, action string, appID *uuid.UUID) bool {
	if claims == nil {
		return false
	}
	keys := []string{"apps:" + action}
	switch action {
	case appAccessView:
		keys = append(keys, "apps:read")
	case appAccessEdit:
		keys = append(keys, "apps:write", "apps:create")
	case appAccessPublish:
		keys = append(keys, "apps:release")
	}
	if appID != nil {
		id := appID.String()
		keys = append(keys, "app:"+id+":"+action, "apps:"+id+":"+action)
	}
	for _, key := range keys {
		if claims.HasPermissionKey(key) {
			return true
		}
	}

	switch action {
	case appAccessView:
		return claims.HasAnyRole([]string{
			"builder", "viewer",
			"apps.viewer", "apps.editor", "apps.publisher",
			"workshop.viewer", "workshop.editor", "workshop.publisher",
		})
	case appAccessEdit:
		return claims.HasAnyRole([]string{
			"builder",
			"apps.editor",
			"workshop.editor",
		})
	case appAccessPublish:
		return claims.HasAnyRole([]string{
			"builder",
			"apps.publisher",
			"workshop.publisher",
		})
	}
	return false
}

func (h *Handlers) auditAppEvent(ctx context.Context, r *http.Request, claims *authmw.Claims, event models.AppAuditEvent) {
	if h == nil || h.Repo == nil {
		return
	}
	if claims != nil && event.ActorID == nil {
		event.ActorID = &claims.Sub
	}
	if event.IPAddress == "" {
		event.IPAddress = requestIP(r)
	}
	if event.UserAgent == "" && r != nil {
		event.UserAgent = r.UserAgent()
	}
	_ = h.Repo.RecordAppAuditEvent(ctx, event)
}

func mustAuditDetails(v map[string]any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return raw
}

func requestIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		if idx := strings.Index(forwarded, ","); idx >= 0 {
			forwarded = forwarded[:idx]
		}
		return strings.TrimSpace(forwarded)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
