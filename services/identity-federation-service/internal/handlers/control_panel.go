package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

type ControlPanel struct {
	mu       sync.RWMutex
	settings ControlPanelSettings
}

type ControlPanelSettings struct {
	PlatformName               string              `json:"platform_name"`
	SupportEmail               string              `json:"support_email"`
	DocsURL                    string              `json:"docs_url"`
	StatusPageURL              string              `json:"status_page_url"`
	AnnouncementBanner         string              `json:"announcement_banner"`
	MaintenanceMode            bool                `json:"maintenance_mode"`
	ReleaseChannel             string              `json:"release_channel"`
	DefaultRegion              string              `json:"default_region"`
	DeploymentMode             string              `json:"deployment_mode"`
	AllowSelfSignup            bool                `json:"allow_self_signup"`
	SupportedLocales           []string            `json:"supported_locales"`
	DefaultLocale              string              `json:"default_locale"`
	AllowedEmailDomains        []string            `json:"allowed_email_domains"`
	DefaultAppBranding         json.RawMessage     `json:"default_app_branding"`
	RestrictedOperations       []string            `json:"restricted_operations"`
	IdentityProviderMappings   json.RawMessage     `json:"identity_provider_mappings"`
	ResourceManagementPolicies json.RawMessage     `json:"resource_management_policies"`
	UpgradeAssistant           json.RawMessage     `json:"upgrade_assistant"`
	ScopedSessions             ScopedSessionConfig `json:"scoped_sessions"`
	UpdatedBy                  *string             `json:"updated_by"`
	UpdatedAt                  time.Time           `json:"updated_at"`
}

type ScopedSessionConfig struct {
	Enabled              bool                  `json:"enabled"`
	AllowNoScopedSession bool                  `json:"allow_no_scoped_session"`
	AlwaysShowSelector   bool                  `json:"always_show_selector"`
	AllowedBypassGroups  []string              `json:"allowed_bypass_groups"`
	Presets              []ScopedSessionPreset `json:"presets"`
}

type ScopedSessionPreset struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Description      string   `json:"description,omitempty"`
	RequiredMarkings []string `json:"required_markings"`
	AllowedMarkings  []string `json:"allowed_markings"`
	Enabled          bool     `json:"enabled"`
}

type UpdateControlPanelRequest struct {
	PlatformName               *string              `json:"platform_name"`
	SupportEmail               *string              `json:"support_email"`
	DocsURL                    *string              `json:"docs_url"`
	StatusPageURL              *string              `json:"status_page_url"`
	AnnouncementBanner         *string              `json:"announcement_banner"`
	MaintenanceMode            *bool                `json:"maintenance_mode"`
	ReleaseChannel             *string              `json:"release_channel"`
	DefaultRegion              *string              `json:"default_region"`
	DeploymentMode             *string              `json:"deployment_mode"`
	AllowSelfSignup            *bool                `json:"allow_self_signup"`
	SupportedLocales           *[]string            `json:"supported_locales"`
	DefaultLocale              *string              `json:"default_locale"`
	AllowedEmailDomains        *[]string            `json:"allowed_email_domains"`
	DefaultAppBranding         *json.RawMessage     `json:"default_app_branding"`
	RestrictedOperations       *[]string            `json:"restricted_operations"`
	IdentityProviderMappings   *json.RawMessage     `json:"identity_provider_mappings"`
	ResourceManagementPolicies *json.RawMessage     `json:"resource_management_policies"`
	UpgradeAssistant           *json.RawMessage     `json:"upgrade_assistant"`
	ScopedSessions             *ScopedSessionConfig `json:"scoped_sessions"`
}

type UpgradeReadinessResponse struct {
	CurrentVersion             string                  `json:"current_version"`
	TargetVersion              string                  `json:"target_version"`
	ReleaseChannel             string                  `json:"release_channel"`
	Readiness                  string                  `json:"readiness"`
	Checks                     []UpgradeReadinessCheck `json:"checks"`
	Blockers                   []string                `json:"blockers"`
	RecommendedActions         []string                `json:"recommended_actions"`
	NextStage                  *UpgradeAssistantStage  `json:"next_stage"`
	CompletedStageCount        int                     `json:"completed_stage_count"`
	TotalStageCount            int                     `json:"total_stage_count"`
	PreflightReadyCount        int                     `json:"preflight_ready_count"`
	PreflightTotalCount        int                     `json:"preflight_total_count"`
	CompletedRolloutPercentage int                     `json:"completed_rollout_percentage"`
	GeneratedAt                time.Time               `json:"generated_at"`
}

type UpgradeReadinessCheck struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

type UpgradeAssistantStage struct {
	ID                string `json:"id"`
	Label             string `json:"label"`
	RolloutPercentage int    `json:"rollout_percentage"`
	Status            string `json:"status"`
}

type IdentityProviderMappingPreviewRequest struct {
	ProviderSlug string         `json:"provider_slug"`
	Email        string         `json:"email"`
	RawClaims    map[string]any `json:"raw_claims"`
}

type IdentityProviderMappingPreviewResponse struct {
	ProviderSlug            string          `json:"provider_slug"`
	Email                   string          `json:"email"`
	MappingFound            bool            `json:"mapping_found"`
	MatchedRuleName         *string         `json:"matched_rule_name"`
	OrganizationID          *string         `json:"organization_id"`
	Workspace               *string         `json:"workspace"`
	ClassificationClearance *string         `json:"classification_clearance"`
	RoleNames               []string        `json:"role_names"`
	TenantTier              *string         `json:"tenant_tier"`
	ResourcePolicyName      *string         `json:"resource_policy_name"`
	Quota                   json.RawMessage `json:"quota"`
	Notes                   []string        `json:"notes"`
}

func NewControlPanel() *ControlPanel {
	now := time.Now().UTC()
	return &ControlPanel{settings: ControlPanelSettings{
		PlatformName:               "OpenFoundry",
		SupportEmail:               "support@openfoundry.dev",
		DocsURL:                    "https://docs.openfoundry.dev",
		StatusPageURL:              "https://status.openfoundry.dev",
		ReleaseChannel:             "stable",
		DefaultRegion:              "eu-west-1",
		DeploymentMode:             "self_hosted",
		SupportedLocales:           []string{"en", "es"},
		DefaultLocale:              "en",
		DefaultAppBranding:         json.RawMessage(`{"display_name":"OpenFoundry","primary_color":"#0f766e","accent_color":"#2563eb","logo_url":null,"favicon_url":null,"show_powered_by":true}`),
		IdentityProviderMappings:   json.RawMessage(`[]`),
		ResourceManagementPolicies: json.RawMessage(`[]`),
		UpgradeAssistant:           json.RawMessage(`{"current_version":"dev","target_version":"dev","maintenance_window":"manual","rollback_channel":"stable","preflight_checks":[],"rollout_stages":[],"rollback_steps":[]}`),
		ScopedSessions:             defaultScopedSessionConfig(),
		UpdatedAt:                  now,
	}}
}

func (h *ControlPanel) Get(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireControlPanelRead(w, r); !ok {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.settings)
}

func (h *ControlPanel) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireControlPanelWrite(w, r)
	if !ok {
		return
	}
	var body UpdateControlPanelRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := applyControlPanelUpdate(&h.settings, &body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	updatedBy := claims.Email
	if strings.TrimSpace(updatedBy) == "" {
		updatedBy = claims.Sub.String()
	}
	h.settings.UpdatedBy = &updatedBy
	h.settings.UpdatedAt = time.Now().UTC()
	writeJSON(w, http.StatusOK, h.settings)
}

func (h *ControlPanel) UpgradeReadiness(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireControlPanelRead(w, r); !ok {
		return
	}
	h.mu.RLock()
	settings := h.settings
	h.mu.RUnlock()
	checks := []UpgradeReadinessCheck{
		{ID: "control-panel-settings", Label: "Control panel settings reachable", Status: "pass", Detail: "Admin settings endpoint is responding."},
		{ID: "release-channel", Label: "Release channel selected", Status: "pass", Detail: settings.ReleaseChannel},
	}
	blockers := []string{}
	if settings.MaintenanceMode {
		checks = append(checks, UpgradeReadinessCheck{ID: "maintenance-mode", Label: "Maintenance mode", Status: "warn", Detail: "Maintenance mode is enabled."})
		blockers = append(blockers, "maintenance_mode_enabled")
	}
	writeJSON(w, http.StatusOK, UpgradeReadinessResponse{
		CurrentVersion:             "dev",
		TargetVersion:              "dev",
		ReleaseChannel:             settings.ReleaseChannel,
		Readiness:                  readinessLabel(blockers),
		Checks:                     checks,
		Blockers:                   blockers,
		RecommendedActions:         recommendedUpgradeActions(blockers),
		CompletedStageCount:        0,
		TotalStageCount:            0,
		PreflightReadyCount:        len(checks) - len(blockers),
		PreflightTotalCount:        len(checks),
		CompletedRolloutPercentage: 0,
		GeneratedAt:                time.Now().UTC(),
	})
}

func (h *ControlPanel) PreviewIdentityProviderMapping(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireControlPanelRead(w, r); !ok {
		return
	}
	var body IdentityProviderMappingPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	notes := []string{"No typed mapping rule matched; preview returned defaults only."}
	mappingFound := strings.TrimSpace(body.ProviderSlug) != "" && strings.Contains(body.Email, "@")
	if mappingFound {
		notes = []string{"Provider slug and email are syntactically valid."}
	}
	writeJSON(w, http.StatusOK, IdentityProviderMappingPreviewResponse{
		ProviderSlug: body.ProviderSlug,
		Email:        body.Email,
		MappingFound: mappingFound,
		RoleNames:    []string{},
		Notes:        notes,
		Quota:        json.RawMessage(`null`),
	})
}

func applyControlPanelUpdate(settings *ControlPanelSettings, body *UpdateControlPanelRequest) error {
	if body.PlatformName != nil {
		settings.PlatformName = *body.PlatformName
	}
	if body.SupportEmail != nil {
		settings.SupportEmail = *body.SupportEmail
	}
	if body.DocsURL != nil {
		settings.DocsURL = *body.DocsURL
	}
	if body.StatusPageURL != nil {
		settings.StatusPageURL = *body.StatusPageURL
	}
	if body.AnnouncementBanner != nil {
		settings.AnnouncementBanner = *body.AnnouncementBanner
	}
	if body.MaintenanceMode != nil {
		settings.MaintenanceMode = *body.MaintenanceMode
	}
	if body.ReleaseChannel != nil {
		settings.ReleaseChannel = *body.ReleaseChannel
	}
	if body.DefaultRegion != nil {
		settings.DefaultRegion = *body.DefaultRegion
	}
	if body.DeploymentMode != nil {
		settings.DeploymentMode = *body.DeploymentMode
	}
	if body.AllowSelfSignup != nil {
		settings.AllowSelfSignup = *body.AllowSelfSignup
	}
	if body.SupportedLocales != nil {
		settings.SupportedLocales = append([]string(nil), (*body.SupportedLocales)...)
	}
	if body.DefaultLocale != nil {
		settings.DefaultLocale = *body.DefaultLocale
	}
	if body.AllowedEmailDomains != nil {
		settings.AllowedEmailDomains = append([]string(nil), (*body.AllowedEmailDomains)...)
	}
	if body.DefaultAppBranding != nil {
		settings.DefaultAppBranding = cloneRaw(*body.DefaultAppBranding, `{}`)
	}
	if body.RestrictedOperations != nil {
		settings.RestrictedOperations = append([]string(nil), (*body.RestrictedOperations)...)
	}
	if body.IdentityProviderMappings != nil {
		settings.IdentityProviderMappings = cloneRaw(*body.IdentityProviderMappings, `[]`)
	}
	if body.ResourceManagementPolicies != nil {
		settings.ResourceManagementPolicies = cloneRaw(*body.ResourceManagementPolicies, `[]`)
	}
	if body.UpgradeAssistant != nil {
		settings.UpgradeAssistant = cloneRaw(*body.UpgradeAssistant, `{}`)
	}
	if body.ScopedSessions != nil {
		cfg, err := normalizeScopedSessionConfig(*body.ScopedSessions)
		if err != nil {
			return err
		}
		settings.ScopedSessions = cfg
	}
	return nil
}

func cloneRaw(raw json.RawMessage, fallback string) json.RawMessage {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage(fallback)
	}
	out := make([]byte, len(raw))
	copy(out, raw)
	return out
}

func defaultScopedSessionConfig() ScopedSessionConfig {
	return ScopedSessionConfig{
		Enabled:              false,
		AllowNoScopedSession: true,
		AlwaysShowSelector:   false,
		AllowedBypassGroups:  []string{},
		Presets:              []ScopedSessionPreset{},
	}
}

func cloneScopedSessionConfig(cfg ScopedSessionConfig) ScopedSessionConfig {
	out := cfg
	out.AllowedBypassGroups = append([]string(nil), cfg.AllowedBypassGroups...)
	out.Presets = make([]ScopedSessionPreset, 0, len(cfg.Presets))
	for _, preset := range cfg.Presets {
		cp := preset
		cp.RequiredMarkings = append([]string(nil), preset.RequiredMarkings...)
		cp.AllowedMarkings = append([]string(nil), preset.AllowedMarkings...)
		out.Presets = append(out.Presets, cp)
	}
	return out
}

func normalizeScopedSessionConfig(cfg ScopedSessionConfig) (ScopedSessionConfig, error) {
	cfg.AllowedBypassGroups = normalizeStringSet(cfg.AllowedBypassGroups)
	presets := make([]ScopedSessionPreset, 0, len(cfg.Presets))
	seen := map[string]struct{}{}
	for _, preset := range cfg.Presets {
		preset.ID = strings.TrimSpace(preset.ID)
		preset.Name = strings.TrimSpace(preset.Name)
		preset.Description = strings.TrimSpace(preset.Description)
		if preset.ID == "" {
			return ScopedSessionConfig{}, errBadScopedSessionConfig("scoped session preset id is required")
		}
		key := strings.ToLower(preset.ID)
		if _, ok := seen[key]; ok {
			return ScopedSessionConfig{}, errBadScopedSessionConfig("scoped session preset ids must be unique")
		}
		seen[key] = struct{}{}
		if preset.Name == "" {
			return ScopedSessionConfig{}, errBadScopedSessionConfig("scoped session preset name is required")
		}
		preset.RequiredMarkings = normalizeStringSet(preset.RequiredMarkings)
		preset.AllowedMarkings = normalizeStringSet(preset.AllowedMarkings)
		if len(preset.AllowedMarkings) == 0 {
			preset.AllowedMarkings = append([]string(nil), preset.RequiredMarkings...)
		}
		if len(preset.RequiredMarkings) == 0 {
			preset.RequiredMarkings = append([]string(nil), preset.AllowedMarkings...)
		}
		if len(preset.AllowedMarkings) == 0 {
			return ScopedSessionConfig{}, errBadScopedSessionConfig("scoped session presets must include at least one marking")
		}
		presets = append(presets, preset)
	}
	cfg.Presets = presets
	return cfg, nil
}

func normalizeStringSet(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	return out
}

type errBadScopedSessionConfig string

func (e errBadScopedSessionConfig) Error() string { return string(e) }

func readinessLabel(blockers []string) string {
	if len(blockers) > 0 {
		return "blocked"
	}
	return "ready"
}

func recommendedUpgradeActions(blockers []string) []string {
	if len(blockers) == 0 {
		return []string{"Continue monitoring audit history before rollout."}
	}
	return []string{"Disable maintenance mode or schedule the upgrade inside the approved window."}
}

func requireControlPanelRead(w http.ResponseWriter, r *http.Request) (*authmw.Claims, bool) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "missing claims")
		return nil, false
	}
	if claims.HasRole("admin") || claims.HasPermission("control_panel", "read") || claims.HasPermission("control_panel", "write") {
		return claims, true
	}
	writeJSONErr(w, http.StatusForbidden, "missing permission control_panel:read")
	return nil, false
}

func requireControlPanelWrite(w http.ResponseWriter, r *http.Request) (*authmw.Claims, bool) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "missing claims")
		return nil, false
	}
	if claims.HasRole("admin") || claims.HasPermission("control_panel", "write") {
		return claims, true
	}
	writeJSONErr(w, http.StatusForbidden, "missing permission control_panel:write")
	return nil, false
}
