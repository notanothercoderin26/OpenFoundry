package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

func controlPanelClaims(permissions ...string) *authmw.Claims {
	return &authmw.Claims{
		Sub:         uuid.New(),
		Email:       "admin@example.com",
		Permissions: permissions,
	}
}

func TestControlPanelRequiresReadPermission(t *testing.T) {
	t.Parallel()
	h := NewControlPanel()
	req := httptest.NewRequest(http.MethodGet, "/control-panel", nil)
	rec := httptest.NewRecorder()
	h.Get(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	req = httptest.NewRequest(http.MethodGet, "/control-panel", nil).
		WithContext(authmw.ContextWithClaims(context.Background(), controlPanelClaims("users:read")))
	rec = httptest.NewRecorder()
	h.Get(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestControlPanelUpdatePersistsInProcess(t *testing.T) {
	t.Parallel()
	h := NewControlPanel()
	claims := controlPanelClaims("control_panel:write")
	req := httptest.NewRequest(http.MethodPut, "/control-panel",
		strings.NewReader(`{"platform_name":"OpenFoundry Enterprise","maintenance_mode":true,"restricted_operations":["dataset.delete"]}`)).
		WithContext(authmw.ContextWithClaims(context.Background(), claims))
	rec := httptest.NewRecorder()
	h.Update(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	req = httptest.NewRequest(http.MethodGet, "/control-panel", nil).
		WithContext(authmw.ContextWithClaims(context.Background(), controlPanelClaims("control_panel:read")))
	rec = httptest.NewRecorder()
	h.Get(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var settings ControlPanelSettings
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&settings))
	require.Equal(t, "OpenFoundry Enterprise", settings.PlatformName)
	require.True(t, settings.MaintenanceMode)
	require.Equal(t, []string{"dataset.delete"}, settings.RestrictedOperations)
}

func TestControlPanelWriteRequiresWritePermission(t *testing.T) {
	t.Parallel()
	h := NewControlPanel()
	req := httptest.NewRequest(http.MethodPut, "/control-panel", strings.NewReader(`{"platform_name":"x"}`)).
		WithContext(authmw.ContextWithClaims(context.Background(), controlPanelClaims("control_panel:read")))
	rec := httptest.NewRecorder()
	h.Update(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestControlPanelUpdatesScopedSessionConfig(t *testing.T) {
	t.Parallel()
	h := NewControlPanel()
	claims := controlPanelClaims("control_panel:write")
	req := httptest.NewRequest(http.MethodPut, "/control-panel", strings.NewReader(`{
		"scoped_sessions":{
			"enabled":true,
			"allow_no_scoped_session":true,
			"always_show_selector":true,
			"allowed_bypass_groups":["security-admins","security-admins"],
			"presets":[
				{"id":"pii-review","name":"PII review","required_markings":["public","pii"],"allowed_markings":["public","pii"],"enabled":true}
			]
		}
	}`)).WithContext(authmw.ContextWithClaims(context.Background(), claims))
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var settings ControlPanelSettings
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&settings))
	require.True(t, settings.ScopedSessions.Enabled)
	require.True(t, settings.ScopedSessions.AlwaysShowSelector)
	require.Equal(t, []string{"security-admins"}, settings.ScopedSessions.AllowedBypassGroups)
	require.Len(t, settings.ScopedSessions.Presets, 1)
	require.Equal(t, []string{"public", "pii"}, settings.ScopedSessions.Presets[0].AllowedMarkings)
}
