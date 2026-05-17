package handlers

import (
	"context"
	"errors"
	"net/http"

	cedar "github.com/cedar-policy/cedar-go"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	servicecedar "github.com/openfoundry/openfoundry-go/services/object-database-service/internal/cedarauthz"
)

// CedarGate is the policy-gate contract the ontology handlers depend
// on. The production implementation lives in
// services/object-database-service/internal/cedarauthz; tests can pass
// `nil` (gate disabled) or a hand-rolled fake.
type CedarGate interface {
	CheckObjectType(
		ctx context.Context,
		claims *authmw.Claims,
		action cedar.EntityUID,
		objectTypeRID string,
		markings []string,
	) error
}

// runCedarGate evaluates the gate (when wired) and maps an
// `*ErrForbidden` to HTTP 403 with a precise reason. Returns true when
// the handler should continue.
func runCedarGate(h *Handlers, r *http.Request, action cedar.EntityUID, objectTypeRID string, markings []string) (bool, error) {
	if h == nil || h.Cedar == nil {
		return true, nil
	}
	claims, _ := authmw.FromContext(r.Context())
	if err := h.Cedar.CheckObjectType(r.Context(), claims, action, objectTypeRID, markings); err != nil {
		return false, err
	}
	return true, nil
}

func writeCedarError(w http.ResponseWriter, err error) {
	var forbidden *servicecedar.ErrForbidden
	if errors.As(err, &forbidden) {
		http.Error(w, forbidden.Error(), http.StatusForbidden)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
