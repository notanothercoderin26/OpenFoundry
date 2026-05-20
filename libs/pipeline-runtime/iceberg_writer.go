// HTTP-backed Writer (Phase B per ADR-0045) that POSTs rows to the
// iceberg-catalog-service `/openfoundry/iceberg/v1/append` endpoint.
//
// The catalog service is the durability seam: it owns the Parquet /
// manifest writes against the object store and the Postgres transaction
// that publishes a new Iceberg snapshot atomically. The Writer here
// only owns the wire concern — JSON-encoding rows + the schema
// metadata the append handler needs to validate against the table's
// registered schema.
//
// Schema discovery: the catalog stores per-table FieldSpec rows; the
// Writer fetches them on first call and caches them per (catalog,
// namespace, table) tuple. Subsequent writes reuse the cached schema
// so steady-state throughput is one HTTP round-trip per Write call.

package pipelineruntime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	pp "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
)

const appendPath = "/openfoundry/iceberg/v1/append"
const defaultPartitionTransform = "identity(id)"
const defaultSortOrder = "id ASC NULLS LAST"

// IcebergHTTPWriter posts row batches to iceberg-catalog-service.
//
// Concurrent calls are safe: the schema cache uses a RWMutex; the
// HTTP client is goroutine-safe.
type IcebergHTTPWriter struct {
	// BaseURL is the catalog's HTTP root (no trailing slash). The
	// caller is responsible for ensuring it's reachable from the
	// pipeline runner pod.
	BaseURL string
	// HTTP is the client used for all calls. Zero value falls back to
	// `&http.Client{Timeout: 30 * time.Second}`.
	HTTP *http.Client
	// AuthHeader is the value sent as `Authorization` on every
	// request (typically a service-account JWT). Empty = no header.
	AuthHeader string
	// ProjectRID is the Foundry project id surfaced by the catalog
	// for tenant isolation. Forwarded as the `x-of-project-rid`
	// header that the catalog handlers parse via projectRID(r).
	ProjectRID string
	// SchemaProvider returns the [FieldSpec] list for a table. The
	// default implementation fetches it from the catalog at runtime;
	// tests inject a static one.
	SchemaProvider SchemaProvider

	cacheMu sync.RWMutex
	cache   map[string][]FieldSpec
}

// SchemaProvider abstracts "fetch the schema for catalog/namespace/table".
type SchemaProvider interface {
	Schema(ctx context.Context, catalog, namespace, table string) ([]FieldSpec, error)
}

// FieldSpec mirrors the catalog's schema row shape. The Writer
// re-declares it here so consumers don't pull the entire catalog
// service into their dependency graph.
type FieldSpec struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
}

// NewIcebergHTTPWriter builds a Writer pointed at baseURL. The
// default schema provider performs a lookup against the catalog's
// `GET /iceberg/v1/namespaces/{namespace}/tables/{table}` endpoint.
func NewIcebergHTTPWriter(baseURL string) *IcebergHTTPWriter {
	w := &IcebergHTTPWriter{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		cache:   map[string][]FieldSpec{},
	}
	w.SchemaProvider = &catalogSchemaProvider{writer: w}
	return w
}

// Write implements [Writer]. Calls AppendBatch on the catalog with
// the supplied rows and the table's registered schema; the catalog
// validates row shapes against the schema, writes parquet/manifests,
// and publishes a new Iceberg snapshot inside one Postgres
// transaction.
//
// Mode is currently informational — the catalog's CommitTable path is
// versioned by design (snapshot id per call); a future enhancement
// could pass mode through the append spec so the catalog can honour
// `replace` vs `append` semantics.
func (w *IcebergHTTPWriter) Write(ctx context.Context, catalog, namespace, table string, mode pp.WriteMode, rows []Row) error {
	if strings.TrimSpace(w.BaseURL) == "" {
		return fmt.Errorf("IcebergHTTPWriter: BaseURL is empty")
	}
	if catalog == "" || namespace == "" || table == "" {
		return fmt.Errorf("IcebergHTTPWriter: catalog/namespace/table required")
	}
	if len(rows) == 0 {
		return nil
	}

	schema, err := w.schemaFor(ctx, catalog, namespace, table)
	if err != nil {
		return fmt.Errorf("schema for %s.%s.%s: %w", catalog, namespace, table, err)
	}

	body := appendBatchBody{
		Spec: tableSpec{
			Catalog:            catalog,
			Namespace:          namespace,
			Table:              table,
			PartitionTransform: defaultPartitionTransform,
			SortOrder:          defaultSortOrder,
			Schema:             schema,
		},
		Rows: rows,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("encode append body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.BaseURL+appendPath, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if w.AuthHeader != "" {
		req.Header.Set("Authorization", w.AuthHeader)
	}
	if w.ProjectRID != "" {
		req.Header.Set("x-of-project-rid", w.ProjectRID)
	}
	resp, err := w.client().Do(req)
	if err != nil {
		return fmt.Errorf("post %s: %w", appendPath, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rbody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
		return fmt.Errorf("catalog returned %d: %s", resp.StatusCode, strings.TrimSpace(string(rbody)))
	}
	// mode is currently advisory — catalog's CommitTable is
	// versioned by design. Reserved for future passthrough so the
	// catalog can honour `replace` vs `append` semantics.
	_ = mode
	return nil
}

func (w *IcebergHTTPWriter) client() *http.Client {
	if w.HTTP != nil {
		return w.HTTP
	}
	return http.DefaultClient
}

func (w *IcebergHTTPWriter) schemaFor(ctx context.Context, catalog, namespace, table string) ([]FieldSpec, error) {
	key := catalog + "\x00" + namespace + "\x00" + table
	w.cacheMu.RLock()
	cached, ok := w.cache[key]
	w.cacheMu.RUnlock()
	if ok {
		return cached, nil
	}
	provider := w.SchemaProvider
	if provider == nil {
		provider = &catalogSchemaProvider{writer: w}
	}
	schema, err := provider.Schema(ctx, catalog, namespace, table)
	if err != nil {
		return nil, err
	}
	w.cacheMu.Lock()
	w.cache[key] = schema
	w.cacheMu.Unlock()
	return schema, nil
}

// ── Wire types — package-local so consumers of the writer don't need
// to import services/iceberg-catalog-service.

type tableSpec struct {
	Catalog            string      `json:"catalog"`
	Namespace          string      `json:"namespace"`
	Table              string      `json:"table"`
	PartitionTransform string      `json:"partition_transform"`
	SortOrder          string      `json:"sort_order"`
	Schema             []FieldSpec `json:"schema"`
}

type appendBatchBody struct {
	Spec tableSpec `json:"spec"`
	Rows []Row     `json:"rows"`
}

// catalogSchemaProvider hits the catalog's table-load endpoint and
// projects the Iceberg metadata schema into the compact FieldSpec
// shape the AppendBatch handler validates against.
type catalogSchemaProvider struct {
	writer *IcebergHTTPWriter
}

// icebergTableLoadResponse mirrors the Apache Iceberg REST Catalog
// `LoadTableResult`. Only the fields the writer actually needs are
// declared; unknown fields are ignored by the decoder.
type icebergTableLoadResponse struct {
	Metadata struct {
		CurrentSchemaID int                 `json:"current-schema-id"`
		Schemas         []icebergRestSchema `json:"schemas"`
	} `json:"metadata"`
}

type icebergRestSchema struct {
	SchemaID int                `json:"schema-id"`
	Fields   []icebergRestField `json:"fields"`
}

type icebergRestField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Required bool   `json:"required"`
	Type     any    `json:"type"` // string (primitive) or struct (complex)
}

func (p *catalogSchemaProvider) Schema(ctx context.Context, _ /*catalog*/, namespace, table string) ([]FieldSpec, error) {
	url := fmt.Sprintf("%s/iceberg/v1/namespaces/%s/tables/%s",
		p.writer.BaseURL,
		strings.ReplaceAll(namespace, ".", "%1F"), // Iceberg path encoding
		table,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if p.writer.AuthHeader != "" {
		req.Header.Set("Authorization", p.writer.AuthHeader)
	}
	if p.writer.ProjectRID != "" {
		req.Header.Set("x-of-project-rid", p.writer.ProjectRID)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := p.writer.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rbody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
		return nil, fmt.Errorf("table load %s HTTP %d: %s", url, resp.StatusCode, strings.TrimSpace(string(rbody)))
	}
	var decoded icebergTableLoadResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode table load: %w", err)
	}
	var schema *icebergRestSchema
	for i := range decoded.Metadata.Schemas {
		if decoded.Metadata.Schemas[i].SchemaID == decoded.Metadata.CurrentSchemaID {
			schema = &decoded.Metadata.Schemas[i]
			break
		}
	}
	if schema == nil && len(decoded.Metadata.Schemas) > 0 {
		schema = &decoded.Metadata.Schemas[0]
	}
	if schema == nil {
		return nil, fmt.Errorf("table %s.%s has no schema", namespace, table)
	}
	out := make([]FieldSpec, 0, len(schema.Fields))
	for _, f := range schema.Fields {
		typeStr, ok := f.Type.(string)
		if !ok {
			// Complex types (struct, list, map) are not currently
			// supported by the AppendBatch validator — fall back to a
			// passthrough "json" tag so the row's value is accepted as
			// arbitrary JSON.
			typeStr = "json"
		}
		out = append(out, FieldSpec{ID: f.ID, Name: f.Name, Type: typeStr, Required: f.Required})
	}
	// Stable order for deterministic test fixtures.
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Compile-time check that the writer satisfies the [Writer]
// interface — guards against signature drift between the runtime and
// the HTTP impl.
var _ Writer = (*IcebergHTTPWriter)(nil)
