// Package handler hosts the HTTP handlers for network-boundary-service.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
)

// Health handles GET /healthz with the platform-canonical liveness payload.
func Health(serviceName, version string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(serviceName, version))
	}
}
