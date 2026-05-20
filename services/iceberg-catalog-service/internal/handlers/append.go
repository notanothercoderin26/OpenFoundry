package handlers

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/repo"
)

const appendEndpointPath = "/openfoundry/iceberg/v1/append"

// idempotencyHeader is the canonical name of the client-supplied dedup
// key. We accept the lowercase form as well — Go's http.Header.Get is
// case-insensitive so this is just documentation.
const idempotencyHeader = "Idempotency-Key"

// maxAppendBodyBytes caps the request size so an unbounded payload
// can't OOM the catalog service. Larger appends should batch.
const maxAppendBodyBytes = 8 << 20 // 8 MiB

// AppendBatch implements the OpenFoundry HTTP table-writer adapter consumed by
// audit-sink and ai-sink. The Go catalog service owns the HTTP contract and
// delegates the durable Iceberg metadata commit to the existing CommitTable
// path; production deployments can swap the store implementation underneath
// this handler to write Parquet/manifests before CommitTable is called.
//
// Idempotency: when the client sends an `Idempotency-Key` header and
// h.Repo implements AppendIdempotencyStore, a redelivery with the
// same body returns the prior snapshot with HTTP 200 (replay); a
// redelivery with the same key but a different body returns HTTP 409
// (the same intent-key must not refer to two distinct payloads).
// Without the header — or against a store that does not implement
// the upcast — the handler keeps the legacy "always commit" behaviour
// so existing callers and the in-memory test fakes stay green.
func (h *Handlers) AppendBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rawBody, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxAppendBodyBytes))
	if err != nil {
		writeJSONErr(w, http.StatusRequestEntityTooLarge, "append body too large")
		return
	}

	var batch models.AppendBatch
	dec := json.NewDecoder(bytes.NewReader(rawBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&batch); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid append body")
		return
	}
	if err := validateAppendSpec(batch.Spec); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(batch.Rows) == 0 {
		writeJSONErr(w, http.StatusBadRequest, "rows must be non-empty")
		return
	}

	namespace := namespacePath(batch.Spec.Namespace)
	table, err := h.Repo.GetTable(r.Context(), projectRID(r), namespace, batch.Spec.Table)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if table == nil {
		writeJSONErr(w, http.StatusNotFound, "table not found")
		return
	}
	if err := validateAppendContract(table, batch); err != nil {
		writeJSONErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	idemKey := strings.TrimSpace(r.Header.Get(idempotencyHeader))
	if len(idemKey) > 200 {
		writeJSONErr(w, http.StatusBadRequest, "Idempotency-Key must be <= 200 chars")
		return
	}

	idemStore, idemEnabled := h.Repo.(AppendIdempotencyStore)
	hash := hashAppendRequest(rawBody)

	if idemKey != "" && idemEnabled {
		prior, found, err := idemStore.LookupAppendIdempotency(r.Context(), idemKey, table.ID)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if found {
			if subtle.ConstantTimeCompare(prior.RequestHash, hash) != 1 {
				writeJSONErr(w, http.StatusConflict,
					"Idempotency-Key was used with a different request body")
				return
			}
			// Replay: return prior commit, do not call CommitTable again.
			writeJSON(w, http.StatusOK, models.AppendBatchResponse{
				Namespace:        batch.Spec.Namespace,
				Table:            batch.Spec.Table,
				Rows:             len(batch.Rows),
				MetadataLocation: prior.MetadataLocation,
			})
			return
		}
	}

	commit := appendCommitRequest(table, batch)
	_, location, err := h.Repo.CommitTable(r.Context(), projectRID(r), namespace, batch.Spec.Table, commit)
	if err != nil {
		writeJSONErr(w, statusFromErr(err), err.Error())
		return
	}

	if idemKey != "" && idemEnabled {
		snapshotID := extractSnapshotIDFromCommit(commit)
		recErr := idemStore.RecordAppendIdempotency(r.Context(), repo.AppendIdempotencyRecord{
			IdempotencyKey:   idemKey,
			TableID:          table.ID,
			RequestHash:      hash,
			SnapshotID:       snapshotID,
			MetadataLocation: location,
		})
		if errors.Is(recErr, repo.ErrAppendIdempotencyRace) {
			// A concurrent submission for the same key won the insert;
			// fold our just-committed snapshot back through the same
			// replay/conflict semantics so the client sees a stable
			// answer per Idempotency-Key.
			prior, found, lookupErr := idemStore.LookupAppendIdempotency(r.Context(), idemKey, table.ID)
			if lookupErr != nil {
				writeJSONErr(w, http.StatusInternalServerError, lookupErr.Error())
				return
			}
			if found && subtle.ConstantTimeCompare(prior.RequestHash, hash) != 1 {
				writeJSONErr(w, http.StatusConflict,
					"Idempotency-Key was used with a different request body")
				return
			}
			if found {
				writeJSON(w, http.StatusOK, models.AppendBatchResponse{
					Namespace:        batch.Spec.Namespace,
					Table:            batch.Spec.Table,
					Rows:             len(batch.Rows),
					MetadataLocation: prior.MetadataLocation,
				})
				return
			}
		} else if recErr != nil {
			// Surface the storage error rather than silently leaking
			// the snapshot — the client needs to know the dedup record
			// did not land so it can retry safely.
			writeJSONErr(w, http.StatusInternalServerError, recErr.Error())
			return
		}
	}

	writeJSON(w, http.StatusAccepted, models.AppendBatchResponse{
		Namespace:        batch.Spec.Namespace,
		Table:            batch.Spec.Table,
		Rows:             len(batch.Rows),
		MetadataLocation: location,
	})
}

// extractSnapshotIDFromCommit pulls the snapshot-id out of the
// add-snapshot update we just built — it's the same value the catalog
// will persist in iceberg_snapshots once CommitTable runs. We pluck it
// here rather than re-querying after commit because the response shape
// of CommitTable does not expose it directly.
func extractSnapshotIDFromCommit(commit *models.CommitTableRequest) int64 {
	if commit == nil {
		return 0
	}
	for _, update := range commit.Updates {
		var head struct {
			Action   string `json:"action"`
			Snapshot struct {
				SnapshotID int64 `json:"snapshot-id"`
			} `json:"snapshot"`
		}
		if err := json.Unmarshal(update, &head); err != nil {
			continue
		}
		if head.Action == "add-snapshot" && head.Snapshot.SnapshotID != 0 {
			return head.Snapshot.SnapshotID
		}
	}
	return 0
}

func validateAppendSpec(spec models.TableSpec) error {
	if strings.TrimSpace(spec.Catalog) == "" {
		return fmt.Errorf("catalog is required")
	}
	if strings.TrimSpace(spec.Namespace) == "" || strings.TrimSpace(spec.Table) == "" {
		return fmt.Errorf("namespace and table are required")
	}
	if strings.TrimSpace(spec.PartitionTransform) == "" {
		return fmt.Errorf("partition_transform is required")
	}
	if strings.TrimSpace(spec.SortOrder) == "" {
		return fmt.Errorf("sort_order is required")
	}
	if len(spec.Schema) == 0 {
		return fmt.Errorf("schema is required")
	}
	seenIDs := map[int]struct{}{}
	seenNames := map[string]struct{}{}
	for _, field := range spec.Schema {
		if field.ID <= 0 || strings.TrimSpace(field.Name) == "" || strings.TrimSpace(field.Type) == "" {
			return fmt.Errorf("schema fields require id, name and type")
		}
		if _, ok := seenIDs[field.ID]; ok {
			return fmt.Errorf("duplicate schema field id %d", field.ID)
		}
		seenIDs[field.ID] = struct{}{}
		name := strings.TrimSpace(field.Name)
		if _, ok := seenNames[name]; ok {
			return fmt.Errorf("duplicate schema field name %s", name)
		}
		seenNames[name] = struct{}{}
	}
	return nil
}

func validateAppendContract(table *models.IcebergTable, batch models.AppendBatch) error {
	if got := normalizeSimpleSchema(table.SchemaJSON); len(got) > 0 && !reflect.DeepEqual(got, batch.Spec.Schema) {
		return fmt.Errorf("schema mismatch")
	}
	if !matchesPartition(table.PartitionSpec, batch.Spec.PartitionTransform) {
		return fmt.Errorf("partition metadata mismatch")
	}
	if !matchesSortOrder(table.SortOrder, batch.Spec.SortOrder) {
		return fmt.Errorf("sort metadata mismatch")
	}
	for i, row := range batch.Rows {
		if err := validateAppendRow(batch.Spec.Schema, row); err != nil {
			return fmt.Errorf("row %d: %w", i, err)
		}
	}
	return nil
}

func validateAppendRow(schema []models.FieldSpec, row map[string]any) error {
	allowed := map[string]models.FieldSpec{}
	for _, field := range schema {
		allowed[field.Name] = field
		value, exists := row[field.Name]
		if field.Required && (!exists || value == nil) {
			return fmt.Errorf("required field %s missing", field.Name)
		}
		if exists && value != nil && !valueMatchesFieldType(value, field.Type) {
			return fmt.Errorf("field %s has invalid %s value", field.Name, field.Type)
		}
	}
	for name := range row {
		if _, ok := allowed[name]; !ok {
			return fmt.Errorf("unknown field %s", name)
		}
	}
	return nil
}

func valueMatchesFieldType(value any, typ string) bool {
	switch typ {
	case "uuid":
		s, ok := value.(string)
		if !ok {
			return false
		}
		_, err := uuid.Parse(s)
		return err == nil
	case "string":
		_, ok := value.(string)
		return ok
	case "uint32":
		n, ok := jsonNumber(value)
		return ok && n >= 0 && n == float64(uint32(n))
	case "timestamptz":
		if _, ok := jsonNumber(value); ok {
			return true
		}
		_, err := time.Parse(time.RFC3339Nano, fmt.Sprint(value))
		return err == nil
	default:
		return true
	}
}

func jsonNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	case json.Number:
		n, err := v.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

func normalizeSimpleSchema(raw json.RawMessage) []models.FieldSpec {
	var direct []models.FieldSpec
	if err := json.Unmarshal(raw, &direct); err == nil && len(direct) > 0 {
		return direct
	}
	var iceberg struct {
		Fields []models.FieldSpec `json:"fields"`
	}
	if err := json.Unmarshal(raw, &iceberg); err == nil && len(iceberg.Fields) > 0 {
		return iceberg.Fields
	}
	return nil
}

func matchesPartition(raw json.RawMessage, want string) bool {
	if strings.TrimSpace(want) == "" {
		return false
	}
	if jsonStringValue(raw) == want {
		return true
	}
	var spec struct {
		Fields []struct {
			Transform  string `json:"transform"`
			SourceName string `json:"source-name"`
		} `json:"fields"`
	}
	if json.Unmarshal(raw, &spec) != nil || len(spec.Fields) != 1 {
		return len(raw) == 0 || string(raw) == "null" || string(raw) == "{}"
	}
	field := spec.Fields[0]
	return fmt.Sprintf("%s(%s)", field.Transform, field.SourceName) == want
}

func matchesSortOrder(raw json.RawMessage, want string) bool {
	if strings.TrimSpace(want) == "" {
		return false
	}
	if jsonStringValue(raw) == want {
		return true
	}
	var order struct {
		Fields []struct {
			SourceName string `json:"source-name"`
			Direction  string `json:"direction"`
		} `json:"fields"`
	}
	if json.Unmarshal(raw, &order) != nil || len(order.Fields) != 1 {
		return len(raw) == 0 || string(raw) == "null" || string(raw) == "{}"
	}
	field := order.Fields[0]
	return strings.TrimSpace(field.SourceName+" "+strings.ToUpper(field.Direction)) == want
}

func jsonStringValue(raw json.RawMessage) string {
	var value string
	if err := json.Unmarshal(raw, &value); err == nil {
		return value
	}
	return ""
}

func appendCommitRequest(table *models.IcebergTable, batch models.AppendBatch) *models.CommitTableRequest {
	now := time.Now().UTC().UnixMilli()
	snapshotID := now
	seq := table.LastSequenceNumber + 1
	manifest := fmt.Sprintf("%s/metadata/openfoundry-append-%d.avro", strings.TrimRight(table.Location, "/"), snapshotID)
	summary, _ := json.Marshal(map[string]string{
		"operation":        "append",
		"added-records":    fmt.Sprintf("%d", len(batch.Rows)),
		"added-data-files": "1",
	})
	snapshot, _ := json.Marshal(map[string]any{
		"snapshot-id":     snapshotID,
		"sequence-number": seq,
		"manifest-list":   manifest,
		"summary":         json.RawMessage(summary),
		"schema-id":       0,
	})
	return &models.CommitTableRequest{
		Identifier: &models.TableIdentifier{Namespace: namespacePath(batch.Spec.Namespace), Name: batch.Spec.Table},
		Updates: []json.RawMessage{mustMarshalJSON(map[string]any{
			"action":   "add-snapshot",
			"snapshot": json.RawMessage(snapshot),
		})},
	}
}

func mustMarshalJSON(value any) json.RawMessage {
	out, _ := json.Marshal(value)
	return out
}
