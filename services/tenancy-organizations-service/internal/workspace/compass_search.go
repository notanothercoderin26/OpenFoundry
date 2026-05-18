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
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/core-models/rid"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/domain"
)

const (
	defaultCompassSearchLimit = 50
	maxCompassSearchLimit     = 200

	compassModifiedBucket24h   = "24h"
	compassModifiedBucket7d    = "7d"
	compassModifiedBucket30d   = "30d"
	compassModifiedBucketOlder = "older"
)

// CompassSearchResult is one permission-filtered catalog hit returned by
// GET /api/v1/compass/search. Score is present when q is non-empty; clients
// should still treat the cursor as opaque.
type CompassSearchResult struct {
	ResourceSearchEntry
	Score   float64 `json:"score,omitempty"`
	Snippet string  `json:"snippet,omitempty"`
}

// CompassSearchResponse pins the cursor-paginated Compass search envelope.
type CompassSearchResponse struct {
	Data       []CompassSearchResult `json:"data"`
	NextCursor *string               `json:"next_cursor,omitempty"`
	Limit      int                   `json:"limit"`
	Facets     CompassSearchFacets   `json:"facets"`
}

type CompassSearchFacetValue struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type CompassSearchFacets struct {
	Types    []CompassSearchFacetValue `json:"types"`
	Projects []CompassSearchFacetValue `json:"projects"`
	Owners   []CompassSearchFacetValue `json:"owners"`
	Markings []CompassSearchFacetValue `json:"markings"`
	Modified []CompassSearchFacetValue `json:"modified"`
}

type compassSearchParams struct {
	Query          string
	Type           *string
	ProjectID      *uuid.UUID
	OwnerID        *uuid.UUID
	MarkingRIDs    []string
	ModifiedBucket *string
	Limit          int
	Cursor         *compassSearchCursor
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
	facets, err := h.Repo.SearchCompassFacets(r.Context(), params, projectIDs)
	if err != nil {
		slog.Error("compass search facets", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to search resources")
		return
	}
	writeJSON(w, http.StatusOK, CompassSearchResponse{
		Data:       results,
		NextCursor: nextCursor,
		Limit:      params.Limit,
		Facets:     facets,
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

	args, conditions, scoreExpr, err := buildCompassSearchConditions(params, accessibleProjectIDs)
	if err != nil {
		return nil, nil, err
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
		            last_modified_at, owner_id, tags, summary, long_text,
		            long_text_sources, open_url, is_deleted,
		            %s AS score
		       FROM compass_resource_search_index
		      WHERE %s
		 )
		 SELECT resource_rid, resource_type, display_name, owning_project_id,
		        owning_project_rid, organization_rids, marking_rids,
		        last_modified_at, owner_id, tags, summary, long_text,
		        long_text_sources, open_url, is_deleted, score
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
	finalizeCompassSearchResults(results, params.Query)
	return results, nextCursor, nil
}

func (r *Repo) SearchCompassFacets(
	ctx context.Context,
	params compassSearchParams,
	accessibleProjectIDs []uuid.UUID,
) (CompassSearchFacets, error) {
	if len(accessibleProjectIDs) == 0 {
		return CompassSearchFacets{}, nil
	}
	args, conditions, _, err := buildCompassSearchConditions(params, accessibleProjectIDs)
	if err != nil {
		return CompassSearchFacets{}, err
	}
	sql := fmt.Sprintf(
		`WITH filtered AS (
		     SELECT resource_rid, resource_type, owning_project_id, owning_project_rid,
		            owner_id, marking_rids, last_modified_at
		       FROM compass_resource_search_index
		      WHERE %s
		 ),
		 buckets AS (
		     SELECT %s AS modified_bucket
		       FROM filtered
		 )
		 SELECT 'type' AS facet, resource_type AS key, resource_type AS label, COUNT(*) AS count
		   FROM filtered
		  GROUP BY resource_type
		 UNION ALL
		 SELECT 'project' AS facet,
		        COALESCE(f.owning_project_rid, f.owning_project_id::text) AS key,
		        COALESCE(p.display_name, f.owning_project_rid, f.owning_project_id::text) AS label,
		        COUNT(*) AS count
		   FROM filtered f
		   LEFT JOIN ontology_projects p ON p.id = f.owning_project_id
		  WHERE f.owning_project_id IS NOT NULL
		  GROUP BY COALESCE(f.owning_project_rid, f.owning_project_id::text),
		           COALESCE(p.display_name, f.owning_project_rid, f.owning_project_id::text)
		 UNION ALL
		 SELECT 'owner' AS facet, owner_id::text AS key, owner_id::text AS label, COUNT(*) AS count
		   FROM filtered
		  WHERE owner_id IS NOT NULL
		  GROUP BY owner_id
		 UNION ALL
		 SELECT 'marking' AS facet, m.marking_rid AS key, m.marking_rid AS label, COUNT(*) AS count
		   FROM filtered f
		   CROSS JOIN LATERAL jsonb_array_elements_text(f.marking_rids) AS m(marking_rid)
		  GROUP BY m.marking_rid
		 UNION ALL
		 SELECT 'modified' AS facet, modified_bucket AS key, modified_bucket AS label, COUNT(*) AS count
		   FROM buckets
		  GROUP BY modified_bucket
		  ORDER BY facet ASC, count DESC, label ASC`,
		strings.Join(conditions, " AND "),
		compassModifiedBucketSQL(),
	)
	rows, err := r.Pool.Query(ctx, sql, args...)
	if err != nil {
		return CompassSearchFacets{}, err
	}
	defer rows.Close()
	facets := CompassSearchFacets{}
	for rows.Next() {
		var facet, key, label string
		var count int64
		if err := rows.Scan(&facet, &key, &label, &count); err != nil {
			return CompassSearchFacets{}, err
		}
		value := CompassSearchFacetValue{
			Key:   key,
			Label: compassFacetLabel(facet, key, label),
			Count: int(count),
		}
		switch facet {
		case "type":
			facets.Types = append(facets.Types, value)
		case "project":
			facets.Projects = append(facets.Projects, value)
		case "owner":
			facets.Owners = append(facets.Owners, value)
		case "marking":
			facets.Markings = append(facets.Markings, value)
		case "modified":
			facets.Modified = append(facets.Modified, value)
		}
	}
	return facets, rows.Err()
}

func buildCompassSearchConditions(params compassSearchParams, accessibleProjectIDs []uuid.UUID) ([]any, []string, string, error) {
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
			  OR long_text ILIKE $%d
			  OR resource_rid ILIKE $%d)`,
			qIdx, likeIdx, likeIdx, likeIdx, likeIdx,
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
			return nil, nil, "", fmt.Errorf("encode marking filters: %w", err)
		}
		idx := appendCompassSearchArg(&args, string(raw))
		conditions = append(conditions, fmt.Sprintf("marking_rids @> $%d::jsonb", idx))
	}
	if params.ModifiedBucket != nil {
		idx := appendCompassSearchArg(&args, *params.ModifiedBucket)
		conditions = append(conditions, fmt.Sprintf("%s = $%d", compassModifiedBucketSQL(), idx))
	}
	return args, conditions, scoreExpr, nil
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
	if rawModified := strings.TrimSpace(values.Get("modified")); rawModified != "" {
		modified, err := normalizeCompassModifiedBucket(rawModified)
		if err != nil {
			return params, http.StatusBadRequest, err.Error()
		}
		params.ModifiedBucket = &modified
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

func normalizeCompassModifiedBucket(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case compassModifiedBucket24h, "day", "1d":
		return compassModifiedBucket24h, nil
	case compassModifiedBucket7d, "week":
		return compassModifiedBucket7d, nil
	case compassModifiedBucket30d, "month":
		return compassModifiedBucket30d, nil
	case compassModifiedBucketOlder, "older_than_30d":
		return compassModifiedBucketOlder, nil
	default:
		return "", errors.New("modified must be one of 24h, 7d, 30d, or older")
	}
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
		result      CompassSearchResult
		orgJSON     []byte
		markJSON    []byte
		tagsJSON    []byte
		sourcesJSON []byte
	)
	if err := row.Scan(
		&result.ResourceRID, &result.ResourceType, &result.DisplayName,
		&result.OwningProjectID, &result.OwningProjectRID, &orgJSON,
		&markJSON, &result.LastModifiedAt, &result.OwnerID, &tagsJSON,
		&result.Summary, &result.LongText, &sourcesJSON, &result.OpenURL,
		&result.IsDeleted, &result.Score,
	); err != nil {
		return nil, err
	}
	result.OrganizationRIDs = decodeStringArrayJSON(orgJSON)
	result.MarkingRIDs = decodeStringArrayJSON(markJSON)
	result.Tags = decodeStringArrayJSON(tagsJSON)
	result.LongTextSources = decodeSearchTextSourcesJSON(sourcesJSON)
	result.Normalize()
	return &result, nil
}

func appendCompassSearchArg(args *[]any, value any) int {
	*args = append(*args, value)
	return len(*args)
}

func compassModifiedBucketSQL() string {
	return `(CASE
		WHEN last_modified_at >= NOW() - INTERVAL '1 day' THEN '24h'
		WHEN last_modified_at >= NOW() - INTERVAL '7 days' THEN '7d'
		WHEN last_modified_at >= NOW() - INTERVAL '30 days' THEN '30d'
		ELSE 'older'
	END)`
}

func compassFacetLabel(facet string, key string, fallback string) string {
	if facet == "modified" {
		switch key {
		case compassModifiedBucket24h:
			return "Past 24 hours"
		case compassModifiedBucket7d:
			return "Past 7 days"
		case compassModifiedBucket30d:
			return "Past 30 days"
		case compassModifiedBucketOlder:
			return "Older than 30 days"
		}
	}
	if facet == "type" {
		if key == ResourceSearchTypeProject {
			return "Project"
		}
		if key == ResourceSearchTypeFolder {
			return "Folder"
		}
	}
	if strings.TrimSpace(fallback) != "" {
		return fallback
	}
	return key
}

func finalizeCompassSearchResults(results []CompassSearchResult, query string) {
	terms := compassSearchSnippetTerms(query)
	for i := range results {
		if len(terms) > 0 {
			text := strings.Join(nonEmptySearchSnippetParts(
				results[i].DisplayName,
				results[i].Summary,
				results[i].LongText,
				results[i].ResourceRID,
			), "\n")
			results[i].Snippet = buildCompassSearchSnippet(text, terms, 220)
		}
		results[i].LongText = ""
	}
}

func compassSearchSnippetTerms(query string) []string {
	seen := map[string]struct{}{}
	terms := make([]string, 0, 4)
	for _, token := range strings.FieldsFunc(strings.ToLower(query), func(ch rune) bool {
		return !(unicode.IsLetter(ch) || unicode.IsDigit(ch) || ch == '_' || ch == '-')
	}) {
		token = strings.TrimSpace(token)
		if len([]rune(token)) < 2 {
			continue
		}
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		terms = append(terms, token)
		if len(terms) >= 8 {
			break
		}
	}
	return terms
}

func nonEmptySearchSnippetParts(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func buildCompassSearchSnippet(text string, terms []string, maxRunes int) string {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" || maxRunes <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}

	lower := strings.ToLower(text)
	matchByte := -1
	for _, term := range terms {
		if idx := strings.Index(lower, term); idx >= 0 && (matchByte == -1 || idx < matchByte) {
			matchByte = idx
		}
	}
	if matchByte == -1 {
		snippet := strings.TrimSpace(string(runes[:maxRunes]))
		if maxRunes > 3 {
			return strings.TrimSpace(string(runes[:maxRunes-3])) + "..."
		}
		return snippet
	}

	matchRune := utf8.RuneCountInString(lower[:matchByte])
	start := matchRune - maxRunes/3
	if start < 0 {
		start = 0
	}
	end := start + maxRunes
	if end > len(runes) {
		end = len(runes)
		start = end - maxRunes
		if start < 0 {
			start = 0
		}
	}
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(runes) {
		snippet += "..."
	}
	return snippet
}
