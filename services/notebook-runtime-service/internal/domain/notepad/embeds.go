package notepad

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// DecodeEmbedSnapshot reads a base64-encoded JSON snapshot from the
// `data-snapshot` attribute of a TipTap embed div and decodes it
// back into a NotepadEmbedPreview. Returns ok=false (no error) when
// the attribute is empty so callers can render a placeholder card.
func DecodeEmbedSnapshot(raw string) (models.NotepadEmbedPreview, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return models.NotepadEmbedPreview{}, false
	}
	body, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return models.NotepadEmbedPreview{}, false
	}
	var preview models.NotepadEmbedPreview
	if err := json.Unmarshal(body, &preview); err != nil {
		return models.NotepadEmbedPreview{}, false
	}
	return preview, true
}

// EncodeEmbedSnapshot is the inverse of DecodeEmbedSnapshot. Used by
// tests and by callers (e.g. the frontend, via a helper API) that
// need to serialise a preview into the `data-snapshot` attribute
// without parsing it back through TipTap.
func EncodeEmbedSnapshot(preview models.NotepadEmbedPreview) (string, error) {
	body, err := json.Marshal(preview)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(body), nil
}

// ErrUnsupportedEmbedKind is returned by a resolver when the kind is
// not one of the documented NotepadEmbedKind constants.
var ErrUnsupportedEmbedKind = errors.New("notepad: unsupported embed kind")

// ErrEmbedRefRequired is returned when a request omits the upstream
// reference (object rid, contour board id, quiver chart id, etc.).
var ErrEmbedRefRequired = errors.New("notepad: embed ref is required")

// WidgetResolver is the port the embed handler talks to. The default
// implementation produces deterministic mock previews so a fresh
// install of OpenFoundry has working embeds without depending on
// every upstream service being reachable; real implementations
// (ontology-exploratory-analysis-service / pipeline-build-service /
// notebook-runtime-service) slot in by satisfying this interface.
type WidgetResolver interface {
	Resolve(ctx context.Context, req models.NotepadEmbedResolveRequest) (models.NotepadEmbedPreview, error)
}

// MockWidgetResolver returns deterministic previews. The output is a
// function of (kind, ref) so the same input yields identical bytes;
// this keeps snapshot tests reliable and the dev experience honest.
type MockWidgetResolver struct {
	// Now lets tests stamp a known timestamp on the FetchedAt field.
	Now func() time.Time
}

// NewMockWidgetResolver builds a resolver that stamps FetchedAt with
// the real wall clock by default.
func NewMockWidgetResolver() *MockWidgetResolver {
	return &MockWidgetResolver{Now: func() time.Time { return time.Now().UTC() }}
}

func (m *MockWidgetResolver) Resolve(_ context.Context, req models.NotepadEmbedResolveRequest) (models.NotepadEmbedPreview, error) {
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		return models.NotepadEmbedPreview{}, ErrEmbedRefRequired
	}
	preview := models.NotepadEmbedPreview{
		Kind:      req.Kind,
		Ref:       ref,
		FetchedAt: m.now(),
		Status:    "live",
	}
	switch req.Kind {
	case models.NotepadEmbedObjectCard:
		preview.Title = fmt.Sprintf("Ontology object · %s", ref)
		preview.Subtitle = "Object Card preview"
		preview.Summary = "Live ontology object snapshot resolved from ontology-exploratory-analysis-service."
		preview.Fields = []models.NotepadEmbedField{
			{Label: "Object Id", Value: ref},
			{Label: "Type", Value: deriveType(ref)},
			{Label: "Owner", Value: "notepad-service"},
		}
	case models.NotepadEmbedContourChart:
		preview.Title = fmt.Sprintf("Contour chart · %s", ref)
		preview.Subtitle = "Tabular analysis chart"
		preview.Summary = "Latest Contour board execution attached to this document."
		preview.Fields = []models.NotepadEmbedField{
			{Label: "Board Id", Value: ref},
			{Label: "Last run", Value: m.now().Format(time.RFC3339)},
		}
		preview.PreviewURL = fmt.Sprintf("/api/v1/contour/boards/%s/preview", ref)
	case models.NotepadEmbedQuiverChart:
		preview.Title = fmt.Sprintf("Quiver chart · %s", ref)
		preview.Subtitle = "Object lens / time-series view"
		preview.Summary = "Quiver chart snapshot synchronised at save time."
		preview.Fields = []models.NotepadEmbedField{
			{Label: "Chart Id", Value: ref},
			{Label: "Series", Value: "3"},
			{Label: "Window", Value: "P30D"},
		}
		preview.PreviewURL = fmt.Sprintf("/api/v1/quiver/charts/%s/preview", ref)
	case models.NotepadEmbedCodeWorkbookChart:
		preview.Title = fmt.Sprintf("Code Workbook chart · %s", ref)
		preview.Subtitle = "Notebook cell output"
		preview.Summary = "Last successful execution of the referenced notebook chart cell."
		preview.Fields = []models.NotepadEmbedField{
			{Label: "Cell Id", Value: ref},
			{Label: "Kernel", Value: "python"},
			{Label: "Status", Value: "ok"},
		}
	default:
		return models.NotepadEmbedPreview{}, ErrUnsupportedEmbedKind
	}
	return preview, nil
}

func (m *MockWidgetResolver) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now().UTC()
}

// deriveType is a tiny heuristic so different refs produce different
// "Type" rows in the mock Object Card. Real implementations look this
// up via ontology-definition-service.
func deriveType(ref string) string {
	switch {
	case strings.Contains(strings.ToLower(ref), "pipeline"):
		return "Pipeline"
	case strings.Contains(strings.ToLower(ref), "dataset"):
		return "Dataset"
	case strings.Contains(strings.ToLower(ref), "model"):
		return "Model"
	default:
		return "Object"
	}
}
