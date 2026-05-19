// Slice D — Edit with AIP. Backs the toolbar dropdown in the TipTap
// editor:
//
//	POST /api/v1/notepad/aip/transform { op, text, prompt?, options? }
//	  → AIPTransformResult
//
// Implementation routes to a notepad.AIPTransformer; the default is a
// deterministic mock so dev installs work without ai-service.
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

func (s *State) aipTransformer() notepad.AIPTransformer {
	if s.AIPTransformer != nil {
		return s.AIPTransformer
	}
	s.AIPTransformer = notepad.NewMockAIPTransformer()
	return s.AIPTransformer
}

func (s *State) AIPTransform(w http.ResponseWriter, r *http.Request) {
	if claims := requireClaims(w, r); claims == nil {
		return
	}
	var body models.AIPTransformRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	body.Op = models.AIPTransformOp(strings.TrimSpace(string(body.Op)))

	result, err := s.aipTransformer().Transform(r.Context(), body)
	switch {
	case errors.Is(err, notepad.ErrAIPTextRequired):
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	case errors.Is(err, notepad.ErrAIPUnsupportedOp):
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	case err != nil:
		writeJSON(w, http.StatusBadGateway, errBody("aip transform failed: "+err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, result)
}
