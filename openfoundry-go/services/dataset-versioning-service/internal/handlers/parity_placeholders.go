package handlers

import "net/http"

func (h *Handlers) notImplemented(w http.ResponseWriter, _ *http.Request, feature string) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"error":   "not implemented",
		"feature": feature,
	})
}

func (h *Handlers) CompareViews(w http.ResponseWriter, r *http.Request) {
	// TODO(dataset-versioning parity): port dataset view comparison.
	h.notImplemented(w, r, "compare views")
}
