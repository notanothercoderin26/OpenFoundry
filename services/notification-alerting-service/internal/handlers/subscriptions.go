package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/notification-alerting-service/internal/service"
)

// Subscriptions hosts the B05 CRUD + event-submission HTTP surface.
type Subscriptions struct {
	Repo       *repo.SubscriptionsRepo
	Dispatcher *service.Dispatcher
}

// Create handles POST /api/v1/notifications/subscriptions.
func (h *Subscriptions) Create(w http.ResponseWriter, r *http.Request) {
	var body models.CreateSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body: " + err.Error()})
		return
	}
	sub, err := h.Repo.CreateSubscription(r.Context(), body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, sub)
}

// List handles GET /api/v1/notifications/subscriptions?event_type=…
func (h *Subscriptions) List(w http.ResponseWriter, r *http.Request) {
	subs, err := h.Repo.ListSubscriptions(r.Context(), r.URL.Query().Get("event_type"))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.SubscriptionListResponse{Data: subs})
}

// Delete handles DELETE /api/v1/notifications/subscriptions/{id}.
func (h *Subscriptions) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a uuid"})
		return
	}
	if err := h.Repo.DeleteSubscription(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SubmitEvent handles POST /api/v1/notifications/events. Producers
// (ontology-actions-service, workflow-automation-service, the
// internal SLA escalator) call this.
func (h *Subscriptions) SubmitEvent(w http.ResponseWriter, r *http.Request) {
	var body models.SubmitEventRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body: " + err.Error()})
		return
	}
	event, deliveries, err := h.Dispatcher.Submit(r.Context(), body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, models.SubmitEventResponse{Event: *event, Deliveries: deliveries})
}

// ListDeliveries handles GET /api/v1/notifications/events/{id}/deliveries.
// Used by ops + the Approvals UI to inspect the per-event delivery
// status (sent/retrying/failed/escalated). Failed rows are the DLQ.
func (h *Subscriptions) ListDeliveries(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a uuid"})
		return
	}
	if _, err := h.Repo.GetEvent(r.Context(), id); err != nil {
		if errors.Is(err, repo.ErrEventNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "event not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	deliveries, err := h.Repo.ListDeliveries(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.DeliveryListResponse{Data: deliveries})
}
