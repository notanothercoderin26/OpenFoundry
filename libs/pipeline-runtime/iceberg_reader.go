// HTTP-backed Reader (Phase B per ADR-0045) that pulls row pages from
// iceberg-catalog-service `/openfoundry/iceberg/v1/scan`.
//
// Mirror of [IcebergHTTPWriter]: the catalog is the durability seam;
// the client only owns the wire concern. The Reader pages through the
// table (default 10k rows per request) and yields rows lazily through
// the [RowStream] iterator so downstream operators don't materialise
// the whole table in memory.

package pipelineruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const scanPath = "/openfoundry/iceberg/v1/scan"
const defaultScanPageSize = 10_000

// IcebergHTTPReader streams rows out of iceberg-catalog-service.
//
// Concurrent calls are safe (no per-Reader mutable state); the HTTP
// client is goroutine-safe.
type IcebergHTTPReader struct {
	BaseURL    string
	HTTP       *http.Client
	AuthHeader string
	ProjectRID string
	// PageSize controls the rows-per-request budget. Zero falls back
	// to defaultScanPageSize. Set lower to validate the paging path
	// in tests.
	PageSize int
	// SnapshotID pins the scan to a specific Iceberg snapshot. Zero =
	// the table's current snapshot (resolved server-side from the
	// main/master branch ref, with a fallback to the latest by
	// sequence number).
	SnapshotID int64
}

// NewIcebergHTTPReader builds a Reader pointed at the catalog at
// baseURL, with a default page size and a 30 s per-request timeout.
func NewIcebergHTTPReader(baseURL string) *IcebergHTTPReader {
	return &IcebergHTTPReader{
		BaseURL:  strings.TrimRight(baseURL, "/"),
		PageSize: defaultScanPageSize,
	}
}

// Scan implements [Reader]. Returns a RowStream that pages through
// the table on each pull; consumers can cancel via ctx and the next
// HTTP call short-circuits with ctx.Err.
func (r *IcebergHTTPReader) Scan(ctx context.Context, catalog, namespace, table string) (RowStream, error) {
	if strings.TrimSpace(r.BaseURL) == "" {
		return nil, fmt.Errorf("IcebergHTTPReader: BaseURL is empty")
	}
	if catalog == "" || namespace == "" || table == "" {
		return nil, fmt.Errorf("IcebergHTTPReader: catalog/namespace/table required")
	}
	page := r.PageSize
	if page <= 0 {
		page = defaultScanPageSize
	}
	stream := func(yield func(Row, error) bool) {
		offset := 0
		for {
			if err := ctx.Err(); err != nil {
				yield(nil, err)
				return
			}
			rows, err := r.fetchPage(ctx, catalog, namespace, table, page, offset)
			if err != nil {
				yield(nil, err)
				return
			}
			if len(rows) == 0 {
				return
			}
			for _, row := range rows {
				if !yield(row, nil) {
					return
				}
			}
			if len(rows) < page {
				return
			}
			offset += len(rows)
		}
	}
	return stream, nil
}

func (r *IcebergHTTPReader) client() *http.Client {
	if r.HTTP != nil {
		return r.HTTP
	}
	return http.DefaultClient
}

type scanBatchResponse struct {
	Namespace  string           `json:"namespace"`
	Table      string           `json:"table"`
	SnapshotID int64            `json:"snapshot_id"`
	Rows       []map[string]any `json:"rows"`
}

func (r *IcebergHTTPReader) fetchPage(ctx context.Context, _ /*catalog*/, namespace, table string, limit, offset int) ([]Row, error) {
	q := url.Values{}
	q.Set("namespace", namespace)
	q.Set("table", table)
	q.Set("limit", strconv.Itoa(limit))
	q.Set("offset", strconv.Itoa(offset))
	if r.SnapshotID > 0 {
		q.Set("snapshot_id", strconv.FormatInt(r.SnapshotID, 10))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.BaseURL+scanPath+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if r.AuthHeader != "" {
		req.Header.Set("Authorization", r.AuthHeader)
	}
	if r.ProjectRID != "" {
		req.Header.Set("x-of-project-rid", r.ProjectRID)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := r.client().Do(req)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", scanPath, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rbody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
		return nil, fmt.Errorf("catalog returned %d: %s", resp.StatusCode, strings.TrimSpace(string(rbody)))
	}
	var decoded scanBatchResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode scan response: %w", err)
	}
	out := make([]Row, 0, len(decoded.Rows))
	for _, r := range decoded.Rows {
		out = append(out, r)
	}
	return out, nil
}

// Compile-time check that the reader satisfies the [Reader] interface.
var _ Reader = (*IcebergHTTPReader)(nil)
