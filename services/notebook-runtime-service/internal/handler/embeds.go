// Slice C — live embed resolver. Backs the TipTap Embed node so the
// editor can render Object Card / Contour / Quiver / Code Workbook
// previews inline.
//
//	POST /api/v1/notepad/embeds/resolve { kind, ref } → NotepadEmbedPreview
//
// The handler delegates to a WidgetResolver; the default
// implementation in the domain layer returns deterministic mock
// previews so a fresh install of OpenFoundry has working embeds
// without depending on every upstream service being reachable. Real
// implementations (ontology-exploratory-analysis-service /
// pipeline-build-service / notebook-runtime-service) plug in by
// replacing the State.WidgetResolver field.
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

func (s *State) widgetResolver() notepad.WidgetResolver {
	if s.WidgetResolver != nil {
		return s.WidgetResolver
	}
	mock := notepad.NewMockWidgetResolver()
	if s.Now != nil {
		mock.Now = s.Now
	}
	s.WidgetResolver = mock
	return s.WidgetResolver
}

func (s *State) ResolveEmbed(w http.ResponseWriter, r *http.Request) {
	if claims := requireClaims(w, r); claims == nil {
		return
	}
	var body models.NotepadEmbedResolveRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	body.Kind = models.NotepadEmbedKind(strings.TrimSpace(string(body.Kind)))
	preview, err := s.widgetResolver().Resolve(r.Context(), body)
	switch {
	case errors.Is(err, notepad.ErrUnsupportedEmbedKind):
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	case errors.Is(err, notepad.ErrEmbedRefRequired):
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	case err != nil:
		writeJSON(w, http.StatusBadGateway, errBody("embed resolve failed: "+err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, preview)
}
