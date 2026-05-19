// Package models hosts the persistent shape used by the notebook
// runtime: notebooks, cells, sessions, notepad documents, presence,
// and the workspace file projection. Every struct uses the same
// JSON shape as the Rust origin so existing notebook frontends
// (apps/web-react/src/lib/components/notebook/...) keep round-tripping.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Notebook is the top-level container that holds cells.
type Notebook struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	OwnerID       uuid.UUID `json:"owner_id"`
	DefaultKernel string    `json:"default_kernel"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreateNotebookRequest struct {
	Name          string  `json:"name"`
	Description   *string `json:"description,omitempty"`
	DefaultKernel *string `json:"default_kernel,omitempty"`
}

type UpdateNotebookRequest struct {
	Name          *string `json:"name,omitempty"`
	Description   *string `json:"description,omitempty"`
	DefaultKernel *string `json:"default_kernel,omitempty"`
}

// Cell is one entry inside a Notebook (markdown or executable).
type Cell struct {
	ID             uuid.UUID       `json:"id"`
	NotebookID     uuid.UUID       `json:"notebook_id"`
	CellType       string          `json:"cell_type"`
	Kernel         string          `json:"kernel"`
	Source         string          `json:"source"`
	Position       int32           `json:"position"`
	LastOutput     json.RawMessage `json:"last_output,omitempty"`
	ExecutionCount *int32          `json:"execution_count,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type CreateCellRequest struct {
	CellType *string `json:"cell_type,omitempty"`
	Kernel   *string `json:"kernel,omitempty"`
	Source   *string `json:"source,omitempty"`
	Position *int32  `json:"position,omitempty"`
}

type UpdateCellRequest struct {
	Source   *string `json:"source,omitempty"`
	CellType *string `json:"cell_type,omitempty"`
	Kernel   *string `json:"kernel,omitempty"`
	Position *int32  `json:"position,omitempty"`
}

type ExecuteCellRequest struct {
	SessionID *uuid.UUID `json:"session_id,omitempty"`
}

// CellOutput is the response shape every kernel returns.
type CellOutput struct {
	OutputType     string          `json:"output_type"`
	Content        json.RawMessage `json:"content"`
	ExecutionCount int32           `json:"execution_count"`
}

// Session is a kernel session (one per active notebook+kernel pair).
type Session struct {
	ID           uuid.UUID `json:"id"`
	NotebookID   uuid.UUID `json:"notebook_id"`
	Kernel       string    `json:"kernel"`
	Status       string    `json:"status"`
	StartedBy    uuid.UUID `json:"started_by"`
	CreatedAt    time.Time `json:"created_at"`
	LastActivity time.Time `json:"last_activity"`
}

type CreateSessionRequest struct {
	Kernel *string `json:"kernel,omitempty"`
}

// NotepadDocument is the live-collaboration document shape.
//
// `Content` is the legacy markdown body kept for the HTML mini-renderer
// and Knowledge-Base ingestion path. `ContentDoc` carries the TipTap /
// ProseMirror JSON document and is the source of truth for the rich
// editor.
type NotepadDocument struct {
	ID            uuid.UUID       `json:"id"`
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	OwnerID       uuid.UUID       `json:"owner_id"`
	Content       string          `json:"content"`
	ContentDoc    json.RawMessage `json:"content_doc"`
	TemplateKey   *string         `json:"template_key,omitempty"`
	Widgets       json.RawMessage `json:"widgets"`
	LastIndexedAt *time.Time      `json:"last_indexed_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type NotepadPresence struct {
	ID          uuid.UUID `json:"id"`
	DocumentID  uuid.UUID `json:"document_id"`
	UserID      uuid.UUID `json:"user_id"`
	SessionID   string    `json:"session_id"`
	DisplayName string    `json:"display_name"`
	CursorLabel string    `json:"cursor_label"`
	Color       string    `json:"color"`
	LastSeenAt  time.Time `json:"last_seen_at"`
}

type CreateNotepadDocumentRequest struct {
	Title       string          `json:"title"`
	Description *string         `json:"description,omitempty"`
	Content     *string         `json:"content,omitempty"`
	ContentDoc  json.RawMessage `json:"content_doc,omitempty"`
	TemplateKey *string         `json:"template_key,omitempty"`
	Widgets     json.RawMessage `json:"widgets,omitempty"`
}

type UpdateNotepadDocumentRequest struct {
	Title         *string         `json:"title,omitempty"`
	Description   *string         `json:"description,omitempty"`
	Content       *string         `json:"content,omitempty"`
	ContentDoc    json.RawMessage `json:"content_doc,omitempty"`
	TemplateKey   *string         `json:"template_key,omitempty"`
	Widgets       json.RawMessage `json:"widgets,omitempty"`
	LastIndexedAt *time.Time      `json:"last_indexed_at,omitempty"`
}

type UpsertNotepadPresenceRequest struct {
	SessionID   string  `json:"session_id"`
	DisplayName string  `json:"display_name"`
	CursorLabel *string `json:"cursor_label,omitempty"`
	Color       *string `json:"color,omitempty"`
}

// NotepadTemplateInputType enumerates the input field types a template
// can declare. Kept small on purpose — extending this set is a
// schema-only change in Slice G follow-ups (date, multiline, etc.).
type NotepadTemplateInputType string

const (
	NotepadTemplateInputString NotepadTemplateInputType = "string"
	NotepadTemplateInputNumber NotepadTemplateInputType = "number"
	NotepadTemplateInputEnum   NotepadTemplateInputType = "enum"
)

// NotepadTemplateInput is one parameterizable field on a template.
// The substitution engine looks for `{{input.<key>}}` tokens in the
// template body and replaces them with the value supplied at
// instantiate time.
type NotepadTemplateInput struct {
	Key         string                   `json:"key"`
	Label       string                   `json:"label"`
	Type        NotepadTemplateInputType `json:"type"`
	Required    bool                     `json:"required,omitempty"`
	Default     string                   `json:"default,omitempty"`
	Options     []string                 `json:"options,omitempty"`
	Description string                   `json:"description,omitempty"`
}

// NotepadTemplate is the standalone template artifact. Its body
// fields mirror NotepadDocument so "Save as template" is a verbatim
// copy + an inputs schema.
type NotepadTemplate struct {
	ID           uuid.UUID              `json:"id"`
	OwnerID      uuid.UUID              `json:"owner_id"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	Title        string                 `json:"title"`
	Content      string                 `json:"content"`
	ContentDoc   json.RawMessage        `json:"content_doc"`
	Widgets      json.RawMessage        `json:"widgets"`
	InputsSchema []NotepadTemplateInput `json:"inputs_schema"`
	Visibility   string                 `json:"visibility"`
	TemplateKey  *string                `json:"template_key,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

// CreateNotepadTemplateRequest is the POST body — "Save as template".
type CreateNotepadTemplateRequest struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description,omitempty"`
	Title        string                 `json:"title,omitempty"`
	Content      string                 `json:"content,omitempty"`
	ContentDoc   json.RawMessage        `json:"content_doc,omitempty"`
	Widgets      json.RawMessage        `json:"widgets,omitempty"`
	InputsSchema []NotepadTemplateInput `json:"inputs_schema,omitempty"`
	Visibility   string                 `json:"visibility,omitempty"`
	TemplateKey  *string                `json:"template_key,omitempty"`
}

// UpdateNotepadTemplateRequest is the PATCH body.
type UpdateNotepadTemplateRequest struct {
	Name         *string                `json:"name,omitempty"`
	Description  *string                `json:"description,omitempty"`
	Title        *string                `json:"title,omitempty"`
	Content      *string                `json:"content,omitempty"`
	ContentDoc   json.RawMessage        `json:"content_doc,omitempty"`
	Widgets      json.RawMessage        `json:"widgets,omitempty"`
	InputsSchema []NotepadTemplateInput `json:"inputs_schema,omitempty"`
	Visibility   *string                `json:"visibility,omitempty"`
	TemplateKey  *string                `json:"template_key,omitempty"`
}

// InstantiateNotepadTemplateRequest is the body of the instantiate
// endpoint. `Inputs` keys must match NotepadTemplateInput.Key values
// declared on the template.
type InstantiateNotepadTemplateRequest struct {
	Title       string            `json:"title,omitempty"`
	Description string            `json:"description,omitempty"`
	Inputs      map[string]string `json:"inputs,omitempty"`
}

// AIPTransformOp enumerates the AIP "Edit with AIP" operations
// supported by /notepad/aip/transform. Mirrors the Foundry-documented
// dropdown actions: custom prompt, fix grammar, change writing style,
// shorten, translate, and call a published function.
type AIPTransformOp string

const (
	AIPTransformCustomPrompt AIPTransformOp = "custom_prompt"
	AIPTransformFixGrammar   AIPTransformOp = "fix_grammar"
	AIPTransformShorten      AIPTransformOp = "shorten"
	AIPTransformChangeStyle  AIPTransformOp = "change_style"
	AIPTransformTranslate    AIPTransformOp = "translate"
	AIPTransformFunction     AIPTransformOp = "function"
)

// AIPTransformRequest is the body of POST /notepad/aip/transform.
type AIPTransformRequest struct {
	Op AIPTransformOp `json:"op"`
	// Text is the user's current selection (the source of truth for
	// the transform). When the user chains operations, the result of
	// the previous transform is passed back in here.
	Text string `json:"text"`
	// Prompt is the freeform instruction for custom_prompt; ignored
	// by every other op.
	Prompt string `json:"prompt,omitempty"`
	// Options carries op-specific knobs: `style` for change_style,
	// `target_lang` for translate, `function_id` for function.
	Options map[string]string `json:"options,omitempty"`
}

// AIPTransformResult is what the frontend renders in the preview pane.
type AIPTransformResult struct {
	Op         AIPTransformOp `json:"op"`
	SourceText string         `json:"source_text"`
	Result     string         `json:"result"`
	// Annotation is the breadcrumb the docs show ("Original text →
	// French → Function") so users can see what stack of ops produced
	// the preview.
	Annotation string `json:"annotation,omitempty"`
	// Provider identifies the backend that produced the result —
	// "deterministic" for the local mock, "agent-runtime-service"
	// when wired to the real LLM service, etc.
	Provider string `json:"provider,omitempty"`
}

// NotepadEmbedKind enumerates the live-embed types the Notepad
// editor supports. Each kind routes to a different upstream service
// resolver on the backend; the frontend picks a matching React
// NodeView renderer based on the same enum.
type NotepadEmbedKind string

const (
	NotepadEmbedObjectCard        NotepadEmbedKind = "object_card"
	NotepadEmbedContourChart      NotepadEmbedKind = "contour_chart"
	NotepadEmbedQuiverChart       NotepadEmbedKind = "quiver_chart"
	NotepadEmbedCodeWorkbookChart NotepadEmbedKind = "code_workbook_chart"
)

// NotepadEmbedField is one key/value row rendered in the embed card.
type NotepadEmbedField struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// NotepadEmbedPreview is the normalised envelope every embed resolver
// returns. The frontend renders it directly; PDF / DOCX exports use
// the same data so the static export matches the live preview.
type NotepadEmbedPreview struct {
	Kind        NotepadEmbedKind    `json:"kind"`
	Ref         string              `json:"ref"`
	Title       string              `json:"title"`
	Subtitle    string              `json:"subtitle,omitempty"`
	Status      string              `json:"status,omitempty"`
	Summary     string              `json:"summary,omitempty"`
	Thumbnail   string              `json:"thumbnail_url,omitempty"`
	Fields      []NotepadEmbedField `json:"fields,omitempty"`
	PreviewURL  string              `json:"preview_url,omitempty"`
	FetchedAt   time.Time           `json:"fetched_at"`
	Annotations map[string]string   `json:"annotations,omitempty"`
}

// NotepadEmbedResolveRequest is the body of POST /notepad/embeds/resolve.
type NotepadEmbedResolveRequest struct {
	Kind NotepadEmbedKind `json:"kind"`
	Ref  string           `json:"ref"`
}

// NotepadRevisionKind enumerates the snapshot sources tracked in
// notepad_revisions. `initial` is reserved for the implicit v0
// snapshot created on document creation so the UI can always render
// a "v0 Initial empty document" entry at the bottom of the history.
type NotepadRevisionKind string

const (
	NotepadRevisionKindAutosave NotepadRevisionKind = "autosave"
	NotepadRevisionKindManual   NotepadRevisionKind = "manual"
	NotepadRevisionKindInitial  NotepadRevisionKind = "initial"
)

// NotepadRevision is one snapshot in a document's version history.
type NotepadRevision struct {
	ID          uuid.UUID           `json:"id"`
	DocumentID  uuid.UUID           `json:"document_id"`
	Rev         int64               `json:"rev"`
	Kind        NotepadRevisionKind `json:"kind"`
	Name        string              `json:"name"`
	Endorsed    bool                `json:"endorsed"`
	AuthorID    uuid.UUID           `json:"author_id"`
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Content     string              `json:"content"`
	ContentDoc  json.RawMessage     `json:"content_doc"`
	Widgets     json.RawMessage     `json:"widgets"`
	TemplateKey *string             `json:"template_key,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
}

// CreateNotepadRevisionRequest is the body for a manual snapshot.
type CreateNotepadRevisionRequest struct {
	Name     string `json:"name,omitempty"`
	Endorsed bool   `json:"endorsed,omitempty"`
}

// NotepadExportPayload is the JSON envelope returned for HTML exports.
// Binary formats (PDF / DOCX) stream the file body directly instead
// of wrapping it in this envelope.
type NotepadExportPayload struct {
	FileName       string `json:"file_name"`
	MimeType       string `json:"mime_type"`
	Title          string `json:"title"`
	HTML           string `json:"html"`
	PreviewExcerpt string `json:"preview_excerpt"`
}

// NotepadExportFormat is the export target requested via `?format=`
// or the JSON body of the export endpoint.
type NotepadExportFormat string

const (
	NotepadExportFormatHTML NotepadExportFormat = "html"
	NotepadExportFormatPDF  NotepadExportFormat = "pdf"
	NotepadExportFormatDOCX NotepadExportFormat = "docx"
)

// NotepadExportRequest is the JSON body the frontend POSTs to the
// export endpoint. The full document is included so unsaved edits can
// be exported without round-tripping through Postgres first; `HTMLBody`
// carries the TipTap-rendered body so the backend does not need a
// ProseMirror→HTML renderer of its own.
type NotepadExportRequest struct {
	Format     NotepadExportFormat `json:"format,omitempty"`
	HTMLBody   string              `json:"html_body,omitempty"`
	NotepadDocument
}

// NotebookWorkspaceFile mirrors the file projection returned by the
// /workspace endpoints.
type NotebookWorkspaceFile struct {
	Path      string    `json:"path"`
	Language  string    `json:"language"`
	Content   string    `json:"content"`
	SizeBytes int64     `json:"size_bytes"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UpsertNotebookWorkspaceFileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}
