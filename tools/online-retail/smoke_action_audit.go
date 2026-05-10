// smoke_action_audit — proof-of-concept smoke that publishes one envelope
// matching the wire shape libs/ontology-kernel/handlers/actions/side_effects.go
// emits, so we can confirm the Kafka topic + envelope are wire-compatible
// with the ActionLogStreamSink consumer.
//
// Use: kubectl run + go run inside the cluster. From the host this needs the
// Kafka NodePort or a port-forward; this file is intended for "go run" inside
// a pod that has KAFKA_BOOTSTRAP_SERVERS in scope.
//
//go:build smoke
// +build smoke

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	kafka "github.com/segmentio/kafka-go"
)

func main() {
	brokers := strings.TrimSpace(os.Getenv("KAFKA_BOOTSTRAP_SERVERS"))
	if brokers == "" {
		brokers = "openfoundry-kafka-bootstrap.kafka.svc:9092"
	}
	topic := strings.TrimSpace(os.Getenv("ACTION_AUDIT_TOPIC"))
	if topic == "" {
		topic = "ontology.actions.applied.v1"
	}
	w := &kafka.Writer{
		Addr:         kafka.TCP(strings.Split(brokers, ",")...),
		Topic:        topic,
		RequiredAcks: kafka.RequireAll,
		WriteTimeout: 10 * time.Second,
	}
	defer w.Close()

	envelope := map[string]any{
		"event_id":              uuid.New().String(),
		"action_type_id":        "019e0f02-7dac-76c5-b3ea-3accd44b0639",
		"action_name":           "escalate_anomaly",
		"object_type_id":        "678b55fe-db5f-4d3a-bbf2-8cb643af8d32",
		"object_id":             uuid.New().String(),
		"tenant":                "default",
		"actor_sub":             uuid.New().String(),
		"actor_email":           "smoke@openfoundry.local",
		"organization_id":       "",
		"status":                "success",
		"parameters":            map[string]any{},
		"previous_state":        map[string]any{"review_status": "needs_review"},
		"new_state":             map[string]any{"review_status": "resolved"},
		"target_classification": "public",
		"applied_at_ms":         time.Now().UnixMilli(),
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		log.Fatalf("marshal: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := w.WriteMessages(ctx, kafka.Message{Key: []byte("smoke"), Value: payload}); err != nil {
		log.Fatalf("publish: %v", err)
	}
	fmt.Printf("published 1 envelope to %s on %s\n", topic, brokers)
}
