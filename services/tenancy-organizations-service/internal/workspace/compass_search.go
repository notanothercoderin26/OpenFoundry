package workspace

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/core-models/rid"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/domain"
)

const (
	defaultCompassSearchLimit = 50
	maxCompassSearchLimit     = 200
)

// CompassSearchResult is one permission-filtered catalog hit returned by
// GET /api/v1/compass/search. Score is present when q is non-empty; clients
// should still treat the cursor as opaque.
type CompassSearchResult struct {
	ResourceSearchEntry
	Score float64 `json:"score,omitempty"`
}

// CompassSearchResponse pins the cursor-paginated Compass search envelope.
type CompassSearchResponse struct {
	Data       []CompassSearchResult `json:"data"`
	NextCursor *string               `json:"next_cursor,omitempty"`
	Limit      int                   `json:"limit"`
}

type compassSearchParams struct {
	Query       string
	Type        *string
	ProjectID   *uuid.UUID
	OwnerID     *uuid.UUID
	MarkingRIDs []string
	Limit       int
	Cursor      *compassSearchCursor
}

type compassSearchCursor struct {
	Score          float64   `json:"score,omitempty"`
	LastModifiedAt time.Time `json:"last_modified_at"`
	ResourceRID    string    `json:"rid"`
}

// SearchCompass handles GET /api/v1/compass/search.
func (h *Handlers) SearchCompass(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	params, status, msg := parseCompassSearchParams(r.URL.Query())
	if status != 0 {
		writeJSONErr(w, status, msg)
		return
	}

	accessible, err := domain.ListAccessibleProjects(r.Context(), h.Repo.Pool, claims)
	if err != nil {
		slog.Error("compass search access evaluation", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to evaluate search permissions")
		return
	}
	projectIDs := make([]uuid.UUID, 0, len(accessible))
	for projectID := range accessible {
		projectIDs = append(projectIDs, projectID)
	}
	if len(projectIDs) == 0 {
		writeJSON(w, http.StatusOK, CompassSearchResponse{
			Data:  []CompassSearchResult{},
			Limit: params.Limit,
		})
		return
	}

	results, nextCursor, err := h.Repo.SearchCompassResources(r.Context(), params, projectIDs)
	if err != nil {
		slog.Error("compass search", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to search resources")
		return
	}
	writeJSON(w, http.StatusOK, CompassSearchResponse{
		Data:       results,
		NextCursor: nextCursor,
		Limit:      params.Limit,
	})
}

func (r *Repo) SearchCompassResources(
	ctx context.Context,
	params compassSearchParams,
	accessibleProjectIDs []uuid.UUID,
) ([]CompassSearchResult, *string, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = defaultCompassSearchLimit
	}
	if limit > maxCompassSearchLimit {
		limit = maxCompassSearchLimit
	}

	args := []any{accessibleProjectIDs}
	conditions := []string{
		"is_deleted = FALSE",
		"owning_project_id = ANY($1::uuid[])",
	}
	scoreExpr := "0::double precision"

	if params.Query != "" {
		qIdx := appendCompassSearchArg(&args, params.Query)
		likeIdx := appendCompassSearchArg(&args, "%"+params.Query+"%")
		scoreExpr = fmt.Sprintf("ts_rank_cd(search_vector, plainto_tsquery('simple', $%d))::double precision", qIdx)
		conditions = append(conditions, fmt.Sprintf(
			`(search_vector @@ plainto_tsquery('simple', $%d)
			  OR display_name ILIKE $%d
			  OR summary ILIKE $%d
			  OR resource_rid ILIKE $%d)`,
			qIdx, likeIdx, likeIdx, likeIdx,
		))
	}
	if params.Type != nil {
		idx := appendCompassSearchArg(&args, *params.Type)
		conditions = append(conditions, fmt.Sprintf("resource_type = $%d", idx))
	}
	if params.ProjectID != nil {
		idx := appendCompassSearchArg(&args, *params.ProjectID)
		conditions = append(conditions, fmt.Sprintf("owning_project_id = $%d", idx))
	}
	if params.OwnerID != nil {
		idx := appendCompassSearchArg(&args, *params.OwnerID)
		conditions = append(conditions, fmt.Sprintf("owner_id = $%d", idx))
	}
	if len(params.MarkingRIDs) > 0 {
		raw, err := json.Marshal(params.MarkingRIDs)
		if err != nil {
			return nil, nil, fmt.Errorf("encode marking filters: %w", err)
		}
		idx := appendCompassSearchArg(&args, string(raw))
		conditions = append(conditions, fmt.Sprintf("marking_rids @> $%d::jsonb", idx))
	}

	cursorWhere := "TRUE"
	if params.Cursor != nil {
		scoreIdx := appendCompassSearchArg(&args, params.Cursor.Score)
		modifiedIdx := appendCompassSearchArg(&args, params.Cursor.LastModifiedAt)
		ridIdx := appendCompassSearchArg(&args, params.Cursor.ResourceRID)
		cursorWhere = fmt.Sprintf(
			`(score < $%d
			   OR (score = $%d AND last_modified_at < $%d)
			   OR (score = $%d AND last_modified_at = $%d AND resource_rid > $%d))`,
			scoreIdx, scoreIdx, modifiedIdx, scoreIdx, modifiedIdx, ridIdx,
		)
	}

	limitIdx := appendCompassSearchArg(&args, limit+1)
	sql := fmt.Sprintf(
		`WITH ranked AS (
		     SELECT resource_rid, resource_type, display_name, owning_project_id,
		            owning_project_rid, organization_rids, marking_rids,
		            last_modified_at, owner_id, tags, summary, open_url, is_deleted,
		            %s AS score
		       FROM compass_resource_search_index
		      WHERE %s
		 )
		 SELECT resource_rid, resource_type, display_name, owning_project_id,
		        owning_project_rid, organization_rids, marking_rids,
		        last_modified_at, owner_id, tags, summary, open_url, is_deleted, score
		   FROM ranked
		  WHERE %s
		  ORDER BY score DESC, last_modified_at DESC, resource_rid ASC
		  LIMIT $%d`,
		scoreExpr,
		strings.Join(conditions, " AND "),
		cursorWhere,
		limitIdx,
	)

	rows, err := r.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, nil, err
	}
	results, err := scanCompassSearchResults(rows)
	if err != nil {
		return nil, nil, err
	}

	var nextCursor *string
	if len(results) > limit {
		last := results[limit-1]
		token, err := encodeCompassSearchCursor(compassSearchCursor{
			Score:          last.Score,
			LastModifiedAt: last.LastModifiedAt,
			ResourceRID:    last.ResourceRID,
		})
		if err != nil {
			return nil, nil, err
		}
		nextCursor = &token
		results = results[:limit]
	}
	return results, nextCursor, nil
}

func parseCompassSearchParams(values url.Values) (compassSearchParams, int, string) {
	params := compassSearchParams{
		Query:       strings.TrimSpace(values.Get("q")),
		MarkingRIDs: normalizeStringSlice(values["marking"]),
		Limit:       defaultCompassSearchLimit,
	}
	if rawType := strings.TrimSpace(values.Get("type")); rawType != "" {
		normalized, err := normalizeCompassSearchType(rawType)
		if err != nil {
			return params, http.StatusBadRequest, err.Error()
		}
		params.Type = &normalized
	}
	if rawProject := strings.TrimSpace(values.Get("project")); rawProject != "" {
		projectID, err := parseCompassSearchProject(rawProject)
		if err != nil {
			return params, http.StatusBadRequest, err.Error()
		}
		params.ProjectID = &projectID
	}
	if rawOwner := strings.TrimSpace(values.Get("owner")); rawOwner != "" {
		ownerID, err := uuid.Parse(rawOwner)
		if err != nil {
			return params, http.StatusBadRequest, "owner must be a UUID"
		}
		params.OwnerID = &ownerID
	}
	if rawLimit := strings.TrimSpace(values.Get("limit")); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil || limit < 1 {
			return params, http.StatusBadRequest, "limit must be a positive integer"
		}
		if limit > maxCompassSearchLimit {
			limit = maxCompassSearchLimit
		}
		params.Limit = limit
	}
	if rawCursor := strings.TrimSpace(values.Get("cursor")); rawCursor != "" {
		cursor, err := decodeCompassSearchCursor(rawCursor)
		if err != nil {
			return params, http.StatusBadRequest, "cursor is invalid"
		}
		params.Cursor = cursor
	}
	return params, 0, ""
}

func normalizeCompassSearchType(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "ontology_project":
		return ResourceSearchTypeProject, nil
	case "ontology_folder":
		return ResourceSearchTypeFolder, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" || len(normalized) > 100 {
		return "", errors.New("type must be a non-empty resource type")
	}
	for _, ch := range normalized {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' {
			continue
		}
		return "", errors.New("type must contain only lowercase letters, digits, underscores, or hyphens")
	}
	return normalized, nil
}

func parseCompassSearchProject(value string) (uuid.UUID, error) {
	if id, err := uuid.Parse(value); err == nil {
		return id, nil
	}
	parsed, err := rid.ParseUUID(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("project must be a UUID or compass project RID")
	}
	if parsed.Service != "compass" || parsed.ResourceType != ResourceSearchTypeProject {
		return uuid.Nil, fmt.Errorf("project must be a compass project RID")
	}
	id, ok := parsed.UUID()
	if !ok {
		return uuid.Nil, fmt.Errorf("project RID must carry a UUID locator")
	}
	return id, nil
}

func encodeCompassSearchCursor(cursor compassSearchCursor) (string, error) {
	if strings.TrimSpace(cursor.ResourceRID) == "" || cursor.LastModifiedAt.IsZero() {
		return "", errors.New("cursor requires rid and last_modified_at")
	}
	raw, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func decodeCompassSearchCursor(token string) (*compassSearchCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	var cursor compassSearchCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	cursor.ResourceRID = strings.TrimSpace(cursor.ResourceRID)
	if cursor.ResourceRID == "" || cursor.LastModifiedAt.IsZero() {
		return nil, errors.New("cursor requires rid and last_modified_at")
	}
	return &cursor, nil
}

func scanCompassSearchResults(rows pgx.Rows) ([]CompassSearchResult, error) {
	defer rows.Close()
	results := make([]CompassSearchResult, 0)
	for rows.Next() {
		result, err := scanCompassSearchResult(rows)
		if err != nil {
			return nil, err
		}
		results = append(results, *result)
	}
	return results, rows.Err()
}

func scanCompassSearchResult(row resourceSearchScannable) (*CompassSearchResult, error) {
	var (
		result   CompassSearchResult
		orgJSON  []byte
		markJSON []byte
		tagsJSON []byte
	)
	if err := row.Scan(
		&result.ResourceRID, &result.ResourceType, &result.DisplayName,
		&result.OwningProjectID, &result.OwningProjectRID, &orgJSON,
		&markJSON, &result.LastModifiedAt, &result.OwnerID, &tagsJSON,
		&result.Summary, &result.OpenURL, &result.IsDeleted, &result.Score,
	); err != nil {
		return nil, err
	}
	result.OrganizationRIDs = decodeStringArrayJSON(orgJSON)
	result.MarkingRIDs = decodeStringArrayJSON(markJSON)
	result.Tags = decodeStringArrayJSON(tagsJSON)
	result.Normalize()
	return &result, nil
}

func appendCompassSearchArg(args *[]any, value any) int {
	*args = append(*args, value)
	return len(*args)
}
