// Package models holds the wire-format types for application-composition-service.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// PrimaryItem mirrors `composition_views`.
type PrimaryItem struct {
	ID        uuid.UUID       `json:"id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

type CreatePrimaryRequest struct {
	Payload json.RawMessage `json:"payload"`
}

// SecondaryItem mirrors `composition_bindings`.
type SecondaryItem struct {
	ID        uuid.UUID       `json:"id"`
	ParentID  uuid.UUID       `json:"parent_id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

type CreateSecondaryRequest struct {
	Payload json.RawMessage `json:"payload"`
}

// App mirrors the `apps` table created by the foundation migration.
// Shape matches the AppDefinition the web frontend (apps/web/src/lib/api/apps.ts)
// already consumes.
type App struct {
	ID                  uuid.UUID       `json:"id"`
	Name                string          `json:"name"`
	Slug                string          `json:"slug"`
	Description         string          `json:"description"`
	Status              string          `json:"status"`
	Pages               json.RawMessage `json:"pages"`
	Theme               json.RawMessage `json:"theme"`
	Settings            json.RawMessage `json:"settings"`
	TemplateKey         *string         `json:"template_key"`
	CreatedBy           *uuid.UUID      `json:"created_by"`
	PublishedVersionID  *uuid.UUID      `json:"published_version_id"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

type CreateAppRequest struct {
	Name        string          `json:"name"`
	Slug        string          `json:"slug,omitempty"`
	Description string          `json:"description,omitempty"`
	Status      string          `json:"status,omitempty"`
	Pages       json.RawMessage `json:"pages,omitempty"`
	Theme       json.RawMessage `json:"theme,omitempty"`
	Settings    json.RawMessage `json:"settings,omitempty"`
	TemplateKey *string         `json:"template_key,omitempty"`
}

type UpdateAppRequest struct {
	Name        *string         `json:"name,omitempty"`
	Slug        *string         `json:"slug,omitempty"`
	Description *string         `json:"description,omitempty"`
	Status      *string         `json:"status,omitempty"`
	Pages       json.RawMessage `json:"pages,omitempty"`
	Theme       json.RawMessage `json:"theme,omitempty"`
	Settings    json.RawMessage `json:"settings,omitempty"`
	TemplateKey *string         `json:"template_key,omitempty"`
}

// AppSummary is what listApps() returns; same shape the frontend AppListResponse expects.
type AppSummary struct {
	ID                 uuid.UUID  `json:"id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	Description        string     `json:"description"`
	Status             string     `json:"status"`
	PageCount          int        `json:"page_count"`
	WidgetCount        int        `json:"widget_count"`
	TemplateKey        *string    `json:"template_key"`
	PublishedVersionID *uuid.UUID `json:"published_version_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// AppVersion mirrors `app_versions`.
type AppVersion struct {
	ID            uuid.UUID       `json:"id"`
	AppID         uuid.UUID       `json:"app_id"`
	VersionNumber int             `json:"version_number"`
	Status        string          `json:"status"`
	AppSnapshot   json.RawMessage `json:"app_snapshot"`
	Notes         string          `json:"notes"`
	CreatedBy     *uuid.UUID      `json:"created_by"`
	CreatedAt     time.Time       `json:"created_at"`
	PublishedAt   *time.Time      `json:"published_at"`
}

type PublishAppRequest struct {
	Notes string `json:"notes"`
}
