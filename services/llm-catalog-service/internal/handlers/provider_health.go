package handlers

import (
	"net/http"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/providers"
)

// ProviderHealth serves GET /api/v1/llm/providers/health from the
// in-memory Prober snapshot. Closes B04 acceptance #6 — the Model
// Catalog UI renders the per-provider status badge from this
// endpoint, and Chatbot Studio reads it to pick a fallback when the
// primary provider is `down`.
type ProviderHealth struct {
	Prober *providers.Prober
}

func (h *ProviderHealth) Snapshot(w http.ResponseWriter, _ *http.Request) {
	if h == nil || h.Prober == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "provider health prober not configured",
		})
		return
	}
	writeJSON(w, http.StatusOK, h.Prober.CurrentSnapshot())
}
