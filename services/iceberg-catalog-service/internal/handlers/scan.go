package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/repo"
)

// ScanBatch implements GET /openfoundry/iceberg/v1/scan and is the
// read-side mirror of AppendBatch. Returns rows of the requested
// (catalog, namespace, table) at the requested snapshot (default =
// current). Used by pipeline-runtime's IcebergHTTPReader to drive a
// transform's input stream.
func (h *Handlers) ScanBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	namespaceStr := strings.TrimSpace(q.Get("namespace"))
	table := strings.TrimSpace(q.Get("table"))
	if namespaceStr == "" || table == "" {
		writeJSONErr(w, http.StatusBadRequest, "namespace and table query params required")
		return
	}
	namespace := namespacePath(namespaceStr)
	tableRow, err := h.Repo.GetTable(r.Context(), projectRID(r), namespace, table)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tableRow == nil {
		writeJSONErr(w, http.StatusNotFound, "table not found")
		return
	}

	req := repo.ScanRowsRequest{TableID: tableRow.ID}
	if v := q.Get("snapshot_id"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "snapshot_id must be int64")
			return
		}
		req.SnapshotID = &parsed
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			writeJSONErr(w, http.StatusBadRequest, "limit must be non-negative integer")
			return
		}
		req.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			writeJSONErr(w, http.StatusBadRequest, "offset must be non-negative integer")
			return
		}
		req.Offset = n
	}
	rows, snapshotID, err := h.Repo.ScanRows(r.Context(), req)
	if errors.Is(err, repo.ErrRowsNoSnapshot) {
		// "no snapshot" is a valid state — return empty rows so the
		// pipeline-runtime can decide whether to error or proceed.
		writeJSON(w, http.StatusOK, models.ScanBatchResponse{
			Namespace: namespaceStr, Table: table, Rows: []map[string]any{},
		})
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ScanBatchResponse{
		Namespace: namespaceStr, Table: table, SnapshotID: snapshotID, Rows: rows,
	})
}
