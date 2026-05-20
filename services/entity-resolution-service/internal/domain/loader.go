// Package domain — record loader bridging the resolution engine to
// real ontology data.
//
// Foundry-native shape: entity resolution is a transform whose inputs
// are ontology object types (or curated datasets) and whose output is
// a canonical `Actor` dataset. This file replaces the synthetic
// `SynthesizeEntityRecords` fixture path with a pluggable loader that
// pulls real EntityRecords from object-database-service via its
// SPA-facing wire shape (`GET /api/v1/ontology/types/{type_id}/objects`).
//
// The loader is intentionally an HTTP client rather than a Cassandra
// reader: ER does not own a connection to the object store, and the
// SPA endpoint already handles markings + restricted views + tenant
// scoping for us. Keeping the dependency at HTTP boundary also keeps
// the engine unit-testable with `httptest.Server`.

package domain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/entity-resolution-service/internal/models"
)

// RecordLoader pulls EntityRecord rows from real sources. Concrete
// implementations live in this package; tests inject fakes that
// satisfy the interface.
type RecordLoader interface {
	LoadEntityRecords(
		ctx context.Context,
		sources []models.DatasetSourceBinding,
		fallbackLimit int,
	) ([]models.EntityRecord, error)
}

// HTTPObjectTypeLoader resolves each DatasetSourceBinding to a paged
// GET against object-database-service. Stateless; safe to share.
//
// BaseURL is REQUIRED (no default). Tenant is the default x-of-tenant
// header value applied when the binding does not override it.
type HTTPObjectTypeLoader struct {
	BaseURL    string
	HTTPClient *http.Client
	AuthHeader string
	Tenant     string
}

// NewHTTPObjectTypeLoader returns a loader wired with a sensible
// default HTTP client. Callers can override .HTTPClient afterwards.
func NewHTTPObjectTypeLoader(baseURL, tenant string) *HTTPObjectTypeLoader {
	return &HTTPObjectTypeLoader{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Tenant:     tenant,
		HTTPClient: &http.Client{Timeout: 20 * time.Second},
	}
}

// defaultDisplayPropertyOrder is the fallback search list when a
// source does not pin DisplayProperty. Mirrors the heuristic the
// Workshop widgets use.
var defaultDisplayPropertyOrder = []string{"display_name", "name", "title", "label"}

// LoadEntityRecords pulls records from every source in order, flattens
// the result, and applies the global fallbackLimit when no per-source
// Limit is set. Errors from any single source short-circuit and bubble
// up — the caller decides whether to fail the run or fall back.
func (l *HTTPObjectTypeLoader) LoadEntityRecords(
	ctx context.Context,
	sources []models.DatasetSourceBinding,
	fallbackLimit int,
) ([]models.EntityRecord, error) {
	if l.BaseURL == "" {
		return nil, errors.New("entity-resolution loader: BaseURL is required")
	}
	if l.HTTPClient == nil {
		l.HTTPClient = http.DefaultClient
	}

	out := make([]models.EntityRecord, 0, len(sources)*16)
	for idx, source := range sources {
		if strings.TrimSpace(source.ObjectTypeID) == "" {
			return nil, fmt.Errorf("entity-resolution loader: source[%d] missing object_type_id", idx)
		}
		limit := source.Limit
		if limit <= 0 {
			limit = fallbackLimit
		}
		if limit <= 0 {
			limit = 100
		}

		records, err := l.loadOne(ctx, source, limit)
		if err != nil {
			return nil, fmt.Errorf("entity-resolution loader: source %q: %w", source.SourceLabel, err)
		}
		out = append(out, records...)
	}
	return out, nil
}

// objectsPageResponse is the wire shape returned by
// object-database-service's ListObjectsByOntologyType handler. We only
// decode the fields we use.
type objectsPageResponse struct {
	Data []ontologyObjectWire `json:"data"`
}

type ontologyObjectWire struct {
	ID           string         `json:"id"`
	ObjectTypeID string         `json:"object_type_id"`
	Properties   map[string]any `json:"properties"`
	Marking      *string        `json:"marking,omitempty"`
}

func (l *HTTPObjectTypeLoader) loadOne(
	ctx context.Context,
	source models.DatasetSourceBinding,
	limit int,
) ([]models.EntityRecord, error) {
	if limit > 5000 {
		limit = 5000 // matches the upstream cap in objects_bridge.go
	}

	endpoint := fmt.Sprintf("%s/api/v1/ontology/types/%s/objects",
		l.BaseURL, url.PathEscape(source.ObjectTypeID))
	q := url.Values{}
	q.Set("per_page", strconv.Itoa(limit))
	endpoint += "?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	tenant := source.Tenant
	if tenant == "" {
		tenant = l.Tenant
	}
	if tenant != "" {
		req.Header.Set("x-of-tenant", tenant)
	}
	if l.AuthHeader != "" {
		req.Header.Set("Authorization", l.AuthHeader)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := l.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("object-database GET %s returned %d: %s",
			endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var page objectsPageResponse
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return nil, fmt.Errorf("decode objects page: %w", err)
	}

	defaultConf := source.DefaultConfidence
	if defaultConf <= 0 {
		defaultConf = 0.85
	}

	records := make([]models.EntityRecord, 0, len(page.Data))
	for _, obj := range page.Data {
		records = append(records, BuildEntityRecord(source, obj.ID, obj.Properties, defaultConf))
	}
	return records, nil
}

// BuildEntityRecord projects an object's wire payload into the
// EntityRecord shape consumed by the resolution engine. Exposed for
// reuse by alternative loader backends (e.g. future
// `dataset-versioning-service` reader) and for unit tests.
func BuildEntityRecord(
	source models.DatasetSourceBinding,
	objectID string,
	properties map[string]any,
	defaultConfidence float32,
) models.EntityRecord {
	externalID := objectID
	if source.RecordIDProperty != "" {
		if v, ok := properties[source.RecordIDProperty]; ok {
			if s := stringifyScalar(v); s != "" {
				externalID = s
			}
		}
	}

	displayName := pickDisplayName(source.DisplayProperty, properties)
	if displayName == "" {
		displayName = externalID
	}

	attrs := projectAttributes(source.AttributeProperties, properties)

	confidence := defaultConfidence
	if v, ok := properties["confidence"]; ok {
		if f, ok := toFloat32(v); ok && f > 0 {
			confidence = f
		}
	}

	recordID := fmt.Sprintf("%s:%s:%s", source.SourceLabel, source.ObjectTypeID, externalID)
	return models.EntityRecord{
		RecordID:    recordID,
		Source:      source.SourceLabel,
		ExternalID:  externalID,
		DisplayName: displayName,
		Confidence:  confidence,
		Attributes:  attrs,
	}
}

func pickDisplayName(prefer string, properties map[string]any) string {
	if prefer != "" {
		if v, ok := properties[prefer]; ok {
			if s := stringifyScalar(v); s != "" {
				return s
			}
		}
	}
	for _, candidate := range defaultDisplayPropertyOrder {
		if v, ok := properties[candidate]; ok {
			if s := stringifyScalar(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func projectAttributes(allow []string, properties map[string]any) map[string]any {
	if len(allow) == 0 {
		// Copy so the engine can mutate freely without aliasing the
		// HTTP response buffers.
		out := make(map[string]any, len(properties))
		for k, v := range properties {
			out[k] = v
		}
		return out
	}
	out := make(map[string]any, len(allow))
	for _, key := range allow {
		if v, ok := properties[key]; ok {
			out[key] = v
		}
	}
	return out
}

func stringifyScalar(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return ""
	}
}

func toFloat32(value any) (float32, bool) {
	switch v := value.(type) {
	case float64:
		return float32(v), true
	case float32:
		return v, true
	case int:
		return float32(v), true
	case int64:
		return float32(v), true
	case string:
		if f, err := strconv.ParseFloat(v, 32); err == nil {
			return float32(f), true
		}
	}
	return 0, false
}
