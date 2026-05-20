package pipelineruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func drainRows(t *testing.T, s RowStream) []Row {
	t.Helper()
	var out []Row
	for row, err := range s {
		require.NoError(t, err)
		out = append(out, row)
	}
	return out
}

func TestIcebergHTTPReader_PagesThroughCatalogScan(t *testing.T) {
	t.Parallel()
	// Catalog returns 12 rows in 3 pages of 5/5/2.
	const total = 12
	var pageCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&pageCount, 1)
		q := r.URL.Query()
		offset, _ := strconv.Atoi(q.Get("offset"))
		limit, _ := strconv.Atoi(q.Get("limit"))
		end := offset + limit
		if end > total {
			end = total
		}
		rows := make([]map[string]any, 0, end-offset)
		for i := offset; i < end; i++ {
			rows = append(rows, map[string]any{"id": fmt.Sprintf("row-%d", i)})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"namespace":   q.Get("namespace"),
			"table":       q.Get("table"),
			"snapshot_id": 1234567890,
			"rows":        rows,
		})
	}))
	defer srv.Close()

	r := NewIcebergHTTPReader(srv.URL)
	r.PageSize = 5
	stream, err := r.Scan(context.Background(), "main", "events", "logins")
	require.NoError(t, err)
	rows := drainRows(t, stream)
	require.Len(t, rows, total)
	assert.Equal(t, "row-0", rows[0]["id"])
	assert.Equal(t, "row-11", rows[total-1]["id"])
	// 12 rows / 5 page-size = 3 pages (5 + 5 + 2). The Reader stops
	// once a short page comes back rather than issuing a 4th call.
	assert.Equal(t, int32(3), atomic.LoadInt32(&pageCount))
}

func TestIcebergHTTPReader_ForwardsSnapshotIDAndProjectHeader(t *testing.T) {
	t.Parallel()
	var seenSnapshot, seenProject string
	var seenURL *url.URL
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenURL = r.URL
		seenSnapshot = r.URL.Query().Get("snapshot_id")
		seenProject = r.Header.Get("x-of-project-rid")
		_ = json.NewEncoder(w).Encode(map[string]any{"rows": []map[string]any{}})
	}))
	defer srv.Close()
	r := NewIcebergHTTPReader(srv.URL)
	r.SnapshotID = 9999
	r.ProjectRID = "ri.compass.main.folder.demo"
	stream, err := r.Scan(context.Background(), "main", "events", "logins")
	require.NoError(t, err)
	_ = drainRows(t, stream)
	assert.Equal(t, "9999", seenSnapshot)
	assert.Equal(t, "ri.compass.main.folder.demo", seenProject)
	assert.Equal(t, scanPath, seenURL.Path)
}

func TestIcebergHTTPReader_SurfacesCatalogError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"table not found"}`))
	}))
	defer srv.Close()
	r := NewIcebergHTTPReader(srv.URL)
	stream, err := r.Scan(context.Background(), "main", "events", "logins")
	require.NoError(t, err)
	var lastErr error
	for _, err := range stream {
		if err != nil {
			lastErr = err
			break
		}
	}
	require.Error(t, lastErr)
	assert.Contains(t, lastErr.Error(), "404")
}

func TestIcebergHTTPReader_RejectsEmptyBaseURL(t *testing.T) {
	t.Parallel()
	r := &IcebergHTTPReader{}
	_, err := r.Scan(context.Background(), "main", "events", "logins")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "BaseURL")
}

func TestIcebergHTTPReader_RespectsCtxCancellationBetweenPages(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// Always return a full page so the Reader would loop forever
		// without cancellation.
		rows := []map[string]any{{"id": "x"}, {"id": "y"}}
		_ = json.NewEncoder(w).Encode(map[string]any{"rows": rows})
	}))
	defer srv.Close()
	r := NewIcebergHTTPReader(srv.URL)
	r.PageSize = 2
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := r.Scan(ctx, "main", "events", "logins")
	require.NoError(t, err)
	count := 0
	for _, err := range stream {
		count++
		if count == 3 {
			cancel()
		}
		if err != nil {
			break
		}
	}
	// We expect to bail out cleanly without hanging.
	assert.GreaterOrEqual(t, count, 3)
}
