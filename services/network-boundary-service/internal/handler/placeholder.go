package handler

import (
	"encoding/json"
	"net/http"
)

// NotImplemented returns a 501 with the canonical stub payload. Every
// gateway-mapped route lands here until ADR-0030 / S8.6 ships a real
// handler.
//
// `milestone` should match the consolidation phase that owns the
// missing capability (e.g. "S8.6/B14" for the network-boundary
// absorption into authorization-policy-service).
func NotImplemented(milestone string) http.HandlerFunc {
	body := map[string]string{
		"code":      "not_implemented",
		"service":   "network-boundary-service",
		"milestone": milestone,
	}
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotImplemented)
		_ = json.NewEncoder(w).Encode(body)
	}
}
