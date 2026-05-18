package workspace

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repo wraps the SQL surface for favorites + recents.
type Repo struct{ Pool *pgxpool.Pool }

// ─── Favorites ──────────────────────────────────────────────────────

// CreateFavorite is idempotent — re-favoriting the same resource
// returns the existing row (mirrors Rust ON CONFLICT … DO UPDATE).
func (r *Repo) CreateFavorite(ctx context.Context, userID uuid.UUID, kind ResourceKind, resourceID uuid.UUID, groupID *uuid.UUID, displayOrder *int) (*UserFavorite, error) {
	if err := r.ensureFavoriteGroupBelongsToUser(ctx, userID, groupID); err != nil {
		return nil, err
	}
	order := 0
	if displayOrder != nil {
		order = *displayOrder
	} else {
		next, err := r.nextFavoriteDisplayOrder(ctx, userID, groupID)
		if err != nil {
			return nil, err
		}
		order = next
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO user_favorites (user_id, resource_kind, resource_id, group_id, display_order, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (user_id, resource_kind, resource_id) DO UPDATE
		     SET group_id = EXCLUDED.group_id,
		         display_order = EXCLUDED.display_order,
		         updated_at = NOW()
		 RETURNING user_id, resource_kind, resource_id, COALESCE(group_id::text, ''),
		           display_order, created_at, updated_at`,
		userID, string(kind), resourceID, groupIDParam(groupID), order)
	f := &UserFavorite{}
	var k string
	var groupText string
	if err := row.Scan(&f.UserID, &k, &f.ResourceID, &groupText, &f.DisplayOrder, &f.CreatedAt, &f.UpdatedAt); err != nil {
		return nil, err
	}
	f.ResourceKind = ResourceKind(k)
	f.GroupID = parseOptionalUUID(groupText)
	return f, nil
}

// ListFavoritesByUser optionally filters on a single resource_kind.
func (r *Repo) ListFavoritesByUser(ctx context.Context, userID uuid.UUID, kind ResourceKind, limit int) ([]UserFavorite, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 1000 {
		limit = 1000
	}
	var (
		rows pgxRowsLike
		err  error
	)
	if kind == "" {
		rows, err = r.Pool.Query(ctx,
			`SELECT f.user_id, f.resource_kind, f.resource_id, COALESCE(f.group_id::text, ''),
			        f.display_order, f.created_at, f.updated_at
			   FROM user_favorites f
			   LEFT JOIN user_favorite_groups g
			     ON g.id = f.group_id AND g.user_id = f.user_id
			  WHERE f.user_id = $1
			  ORDER BY CASE WHEN f.group_id IS NULL THEN 0 ELSE 1 END,
			           COALESCE(g.display_order, 2147483647),
			           f.display_order,
			           f.created_at DESC
			  LIMIT $2`, userID, limit)
	} else {
		rows, err = r.Pool.Query(ctx,
			`SELECT f.user_id, f.resource_kind, f.resource_id, COALESCE(f.group_id::text, ''),
			        f.display_order, f.created_at, f.updated_at
			   FROM user_favorites f
			   LEFT JOIN user_favorite_groups g
			     ON g.id = f.group_id AND g.user_id = f.user_id
			  WHERE f.user_id = $1 AND f.resource_kind = $2
			  ORDER BY CASE WHEN f.group_id IS NULL THEN 0 ELSE 1 END,
			           COALESCE(g.display_order, 2147483647),
			           f.display_order,
			           f.created_at DESC
			  LIMIT $3`, userID, string(kind), limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]UserFavorite, 0)
	for rows.Next() {
		var f UserFavorite
		var k string
		var groupText string
		if err := rows.Scan(&f.UserID, &k, &f.ResourceID, &groupText, &f.DisplayOrder, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		f.ResourceKind = ResourceKind(k)
		f.GroupID = parseOptionalUUID(groupText)
		out = append(out, f)
	}
	return out, rows.Err()
}

// CreateFavoriteGroup creates or reuses a named group in the caller's profile.
func (r *Repo) CreateFavoriteGroup(ctx context.Context, userID uuid.UUID, name string, displayOrder *int) (*FavoriteGroup, error) {
	name = strings.TrimSpace(name)
	order := 0
	if displayOrder != nil {
		order = *displayOrder
	} else {
		next, err := r.nextFavoriteGroupDisplayOrder(ctx, userID)
		if err != nil {
			return nil, err
		}
		order = next
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO user_favorite_groups (user_id, name, display_order, updated_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (user_id, name) DO UPDATE
		     SET updated_at = NOW()
		 RETURNING id, user_id, name, display_order, created_at, updated_at`,
		userID, name, order)
	var g FavoriteGroup
	if err := row.Scan(&g.ID, &g.UserID, &g.Name, &g.DisplayOrder, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return nil, err
	}
	return &g, nil
}

// ListFavoriteGroupsByUser returns groups in display order.
func (r *Repo) ListFavoriteGroupsByUser(ctx context.Context, userID uuid.UUID) ([]FavoriteGroup, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, user_id, name, display_order, created_at, updated_at
		   FROM user_favorite_groups
		  WHERE user_id = $1
		  ORDER BY display_order, name, created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FavoriteGroup, 0)
	for rows.Next() {
		var g FavoriteGroup
		if err := rows.Scan(&g.ID, &g.UserID, &g.Name, &g.DisplayOrder, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// UpdateFavoriteOrder moves favorites between groups and persists their
// user-visible ordering.
func (r *Repo) UpdateFavoriteOrder(ctx context.Context, userID uuid.UUID, items []FavoriteOrderItem) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	for _, item := range items {
		if err := r.ensureFavoriteGroupBelongsToUser(ctx, userID, item.GroupID); err != nil {
			return err
		}
		kind, err := ParseResourceKind(item.ResourceKind)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx,
			`UPDATE user_favorites
			    SET group_id = $4,
			        display_order = $5,
			        updated_at = NOW()
			  WHERE user_id = $1 AND resource_kind = $2 AND resource_id = $3`,
			userID, string(kind), item.ResourceID, groupIDParam(item.GroupID), item.DisplayOrder)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// UpdateFavoriteGroupsOrder persists the order of the caller's groups.
func (r *Repo) UpdateFavoriteGroupsOrder(ctx context.Context, userID uuid.UUID, groups []FavoriteGroupOrderItem) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	for _, group := range groups {
		_, err = tx.Exec(ctx,
			`UPDATE user_favorite_groups
			    SET display_order = $3,
			        updated_at = NOW()
			  WHERE user_id = $1 AND id = $2`,
			userID, group.ID, group.DisplayOrder)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// DeleteFavorite returns false when no row was affected (404 mapping).
func (r *Repo) DeleteFavorite(ctx context.Context, userID uuid.UUID, kind ResourceKind, resourceID uuid.UUID) (bool, error) {
	cmd, err := r.Pool.Exec(ctx,
		`DELETE FROM user_favorites
		 WHERE user_id = $1 AND resource_kind = $2 AND resource_id = $3`,
		userID, string(kind), resourceID)
	if err != nil {
		return false, err
	}
	return cmd.RowsAffected() > 0, nil
}

func (r *Repo) ensureFavoriteGroupBelongsToUser(ctx context.Context, userID uuid.UUID, groupID *uuid.UUID) error {
	if groupID == nil {
		return nil
	}
	var ok bool
	err := r.Pool.QueryRow(ctx,
		`SELECT EXISTS (
		    SELECT 1 FROM user_favorite_groups WHERE user_id = $1 AND id = $2
		)`, userID, *groupID).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return ErrFavoriteGroupNotFound
	}
	return nil
}

func (r *Repo) nextFavoriteDisplayOrder(ctx context.Context, userID uuid.UUID, groupID *uuid.UUID) (int, error) {
	var next int
	err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(display_order), 0) + 1000
		   FROM user_favorites
		  WHERE user_id = $1
		    AND group_id IS NOT DISTINCT FROM $2::uuid`,
		userID, groupIDParam(groupID)).Scan(&next)
	return next, err
}

func (r *Repo) nextFavoriteGroupDisplayOrder(ctx context.Context, userID uuid.UUID) (int, error) {
	var next int
	err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(display_order), 0) + 1000
		   FROM user_favorite_groups
		  WHERE user_id = $1`, userID).Scan(&next)
	return next, err
}

func groupIDParam(groupID *uuid.UUID) any {
	if groupID == nil {
		return nil
	}
	return *groupID
}

func parseOptionalUUID(raw string) *uuid.UUID {
	if raw == "" {
		return nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return &id
}

// ─── Recents ────────────────────────────────────────────────────────

// RecordAccess inserts a new resource_access_log row. Best-effort —
// callers should not fail their request if this errors.
func (r *Repo) RecordAccess(ctx context.Context, userID uuid.UUID, kind ResourceKind, resourceID uuid.UUID) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO resource_access_log (user_id, resource_kind, resource_id, accessed_at)
		 VALUES ($1, $2, $3, $4)`,
		userID, string(kind), resourceID, time.Now().UTC())
	return err
}

// ListRecentsByUser returns the most recent unique (kind, id) rows for
// `userID`, optionally filtered to a single kind. Results are filtered
// to resources still visible in the caller's accessible projects so
// permission revocations disappear from the personalized recents list.
func (r *Repo) ListRecentsByUser(ctx context.Context, userID uuid.UUID, kind ResourceKind, limit int, accessibleProjectIDs []uuid.UUID) ([]RecentEntry, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 500 {
		limit = 500
	}
	if len(accessibleProjectIDs) == 0 {
		return []RecentEntry{}, nil
	}
	var (
		rows pgxRowsLike
		err  error
	)
	if kind == "" {
		rows, err = r.Pool.Query(ctx,
			listRecentsSQL("", 2, 3),
			userID, accessibleProjectIDs, limit)
	} else {
		rows, err = r.Pool.Query(ctx,
			listRecentsSQL("AND resource_kind = $2", 3, 4),
			userID, string(kind), accessibleProjectIDs, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]RecentEntry, 0)
	for rows.Next() {
		var e RecentEntry
		var k string
		if err := rows.Scan(&k, &e.ResourceID, &e.LastAccessedAt); err != nil {
			return nil, err
		}
		e.ResourceKind = ResourceKind(k)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func listRecentsSQL(kindPredicate string, projectsParam int, limitParam int) string {
	return `
WITH latest AS (
	SELECT DISTINCT ON (resource_kind, resource_id)
	       resource_kind, resource_id, accessed_at AS last_accessed_at
	  FROM resource_access_log
	 WHERE user_id = $1 ` + kindPredicate + `
	 ORDER BY resource_kind, resource_id, accessed_at DESC
)
SELECT resource_kind, resource_id, last_accessed_at
  FROM latest l
 WHERE ` + recentVisiblePredicate(projectsParam) + `
 ORDER BY last_accessed_at DESC, resource_kind ASC, resource_id ASC
 LIMIT $` + strconv.Itoa(limitParam)
}

func recentVisiblePredicate(projectsParam int) string {
	projectIDs := "$" + strconv.Itoa(projectsParam) + "::uuid[]"
	return `
	(
		l.resource_kind = 'ontology_project'
		AND EXISTS (
			SELECT 1
			  FROM ontology_projects p
			 WHERE p.id = l.resource_id
			   AND p.id = ANY(` + projectIDs + `)
			   AND p.is_deleted = FALSE
		)
	)
	OR (
		l.resource_kind = 'ontology_folder'
		AND EXISTS (
			SELECT 1
			  FROM ontology_project_folders f
			 WHERE f.id = l.resource_id
			   AND f.project_id = ANY(` + projectIDs + `)
			   AND f.is_deleted = FALSE
		)
	)
	OR (
		l.resource_kind = 'ontology_resource_binding'
		AND EXISTS (
			SELECT 1
			  FROM ontology_project_resources r
			 WHERE r.resource_id = l.resource_id
			   AND r.project_id = ANY(` + projectIDs + `)
			   AND r.is_deleted = FALSE
		)
	)
	OR (
		l.resource_kind NOT IN ('ontology_project', 'ontology_folder', 'ontology_resource_binding')
		AND EXISTS (
			SELECT 1
			  FROM ontology_project_resources r
			 WHERE r.resource_kind = l.resource_kind
			   AND r.resource_id = l.resource_id
			   AND r.project_id = ANY(` + projectIDs + `)
			   AND r.is_deleted = FALSE
		)
	)
	OR (
		l.resource_kind NOT IN ('ontology_project', 'ontology_folder', 'ontology_resource_binding')
		AND EXISTS (
			SELECT 1
			  FROM compass_resource_search_index idx
			 WHERE idx.resource_rid = CASE l.resource_kind
				WHEN 'dataset' THEN 'ri.foundry.main.dataset.' || l.resource_id::text
				WHEN 'pipeline' THEN 'ri.foundry.main.pipeline.' || l.resource_id::text
				WHEN 'query' THEN 'ri.foundry.main.query.' || l.resource_id::text
				WHEN 'notebook' THEN 'ri.foundry.main.notebook.' || l.resource_id::text
				WHEN 'app' THEN 'ri.foundry.main.app.' || l.resource_id::text
				WHEN 'dashboard' THEN 'ri.foundry.main.dashboard.' || l.resource_id::text
				WHEN 'report' THEN 'ri.foundry.main.report.' || l.resource_id::text
				WHEN 'model' THEN 'ri.foundry.main.model.' || l.resource_id::text
				WHEN 'workflow' THEN 'ri.foundry.main.workflow.' || l.resource_id::text
				ELSE 'ri.openfoundry.main.resource.' || l.resource_id::text
			END
			   AND idx.owning_project_id = ANY(` + projectIDs + `)
			   AND idx.is_deleted = FALSE
		)
	)`
}

// ─── Saved searches ────────────────────────────────────────────────

func (r *Repo) CreateSavedSearch(
	ctx context.Context,
	userID uuid.UUID,
	name string,
	query string,
	tab string,
	resourceType *string,
	projectID *uuid.UUID,
	projectRID *string,
	ownerID *uuid.UUID,
	markingRIDs []string,
	modifiedBucket *string,
	displayOrder *int,
) (*SavedSearch, error) {
	order := 0
	if displayOrder != nil {
		order = *displayOrder
	} else if err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(display_order) + 10, 0)
		   FROM compass_saved_searches
		  WHERE user_id = $1`,
		userID,
	).Scan(&order); err != nil {
		return nil, err
	}
	markingJSON, err := json.Marshal(normalizeStringSlice(markingRIDs))
	if err != nil {
		return nil, err
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO compass_saved_searches (
		     user_id, name, query, tab, resource_type, project_id, project_rid,
		     owner_id, marking_rids, modified_bucket, display_order, updated_at
		 )
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, NOW())
		 RETURNING id, user_id, name, query, tab, resource_type, project_id,
		           project_rid, owner_id, marking_rids, modified_bucket,
		           display_order, created_at, updated_at`,
		userID, name, query, tab, resourceType, projectID, projectRID,
		ownerID, string(markingJSON), modifiedBucket, order,
	)
	return scanSavedSearch(row)
}

func (r *Repo) ListSavedSearchesByUser(ctx context.Context, userID uuid.UUID, limit int) ([]SavedSearch, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, user_id, name, query, tab, resource_type, project_id,
		        project_rid, owner_id, marking_rids, modified_bucket,
		        display_order, created_at, updated_at
		   FROM compass_saved_searches
		  WHERE user_id = $1
		  ORDER BY display_order ASC, updated_at DESC, name ASC
		  LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SavedSearch, 0)
	for rows.Next() {
		search, err := scanSavedSearch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *search)
	}
	return out, rows.Err()
}

func (r *Repo) DeleteSavedSearch(ctx context.Context, userID uuid.UUID, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx,
		`DELETE FROM compass_saved_searches
		  WHERE user_id = $1 AND id = $2`,
		userID, id,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func scanSavedSearch(row resourceSearchScannable) (*SavedSearch, error) {
	var (
		search     SavedSearch
		markingRaw []byte
	)
	if err := row.Scan(
		&search.ID, &search.UserID, &search.Name, &search.Query, &search.Tab,
		&search.ResourceType, &search.ProjectID, &search.ProjectRID,
		&search.OwnerID, &markingRaw, &search.ModifiedBucket,
		&search.DisplayOrder, &search.CreatedAt, &search.UpdatedAt,
	); err != nil {
		return nil, err
	}
	search.MarkingRIDs = decodeStringArrayJSON(markingRaw)
	return &search, nil
}

// ─── Project follows + recommendations ─────────────────────────────

func (r *Repo) FollowProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) (*ProjectFollow, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO compass_project_follows (user_id, project_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, project_id) DO UPDATE
		     SET created_at = compass_project_follows.created_at
		 RETURNING user_id, project_id,
		           (SELECT COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text)
		              FROM ontology_projects p
		             WHERE p.id = compass_project_follows.project_id) AS project_rid,
		           created_at`,
		userID, projectID,
	)
	return scanProjectFollow(row)
}

func (r *Repo) ListProjectFollowsByUser(ctx context.Context, userID uuid.UUID, accessibleProjectIDs []uuid.UUID, limit int) ([]ProjectFollow, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	if len(accessibleProjectIDs) == 0 {
		return []ProjectFollow{}, nil
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT f.user_id, f.project_id,
		        COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text) AS project_rid,
		        f.created_at
		   FROM compass_project_follows f
		   JOIN ontology_projects p ON p.id = f.project_id
		  WHERE f.user_id = $1
		    AND f.project_id = ANY($2::uuid[])
		    AND COALESCE(p.is_deleted, FALSE) = FALSE
		  ORDER BY f.created_at DESC
		  LIMIT $3`,
		userID, accessibleProjectIDs, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ProjectFollow, 0)
	for rows.Next() {
		follow, err := scanProjectFollow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *follow)
	}
	return out, rows.Err()
}

func (r *Repo) UnfollowProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx,
		`DELETE FROM compass_project_follows
		  WHERE user_id = $1 AND project_id = $2`,
		userID, projectID,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repo) ListResourceRecommendations(ctx context.Context, userID uuid.UUID, accessibleProjectIDs []uuid.UUID, limit int) ([]ResourceRecommendation, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	if len(accessibleProjectIDs) == 0 {
		return []ResourceRecommendation{}, nil
	}
	rows, err := r.Pool.Query(ctx, resourceRecommendationsSQL(), userID, accessibleProjectIDs, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ResourceRecommendation, 0)
	for rows.Next() {
		rec, err := scanResourceRecommendation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, rows.Err()
}

func resourceRecommendationsSQL() string {
	ridExpr := accessLogResourceRIDSQL("l")
	return `
WITH visible AS (
	SELECT resource_rid, resource_type, display_name, owning_project_id,
	       owning_project_rid, organization_rids, marking_rids, last_modified_at,
	       owner_id, tags, summary, long_text, long_text_sources, open_url, is_deleted
	  FROM compass_resource_search_index
	 WHERE is_deleted = FALSE
	   AND owning_project_id = ANY($2::uuid[])
),
self_recent AS (
	SELECT idx.resource_rid,
	       COUNT(*) AS self_open_count,
	       MAX(l.accessed_at) AS self_last
	  FROM resource_access_log l
	  JOIN visible idx ON idx.resource_rid = ` + ridExpr + `
	 WHERE l.user_id = $1
	   AND l.accessed_at >= NOW() - INTERVAL '30 days'
	 GROUP BY idx.resource_rid
),
collaborator_recent AS (
	SELECT idx.resource_rid,
	       COUNT(*) AS collaborator_open_count,
	       COUNT(DISTINCT l.user_id) AS collaborator_count,
	       MAX(l.accessed_at) AS collaborator_last
	  FROM resource_access_log l
	  JOIN visible idx ON idx.resource_rid = ` + ridExpr + `
	 WHERE l.user_id <> $1
	   AND l.accessed_at >= NOW() - INTERVAL '14 days'
	 GROUP BY idx.resource_rid
),
followed AS (
	SELECT idx.resource_rid, MAX(f.created_at) AS followed_at
	  FROM compass_project_follows f
	  JOIN visible idx ON idx.owning_project_id = f.project_id
	 WHERE f.user_id = $1
	 GROUP BY idx.resource_rid
),
scored AS (
	SELECT idx.*,
	       COALESCE(sr.self_open_count, 0) AS self_open_count,
	       COALESCE(cr.collaborator_open_count, 0) AS collaborator_open_count,
	       COALESCE(cr.collaborator_count, 0) AS collaborator_count,
	       sr.self_last,
	       cr.collaborator_last,
	       followed.followed_at,
	       (
	           COALESCE(cr.collaborator_open_count, 0)::double precision * 6
	           + COALESCE(cr.collaborator_count, 0)::double precision * 10
	           + COALESCE(sr.self_open_count, 0)::double precision * 3
	           + CASE WHEN followed.followed_at IS NOT NULL THEN 12 ELSE 0 END
	           + GREATEST(0, 14 - EXTRACT(EPOCH FROM (NOW() - idx.last_modified_at)) / 86400.0)
	       ) AS score,
	       GREATEST(
	           COALESCE(sr.self_last, 'epoch'::timestamptz),
	           COALESCE(cr.collaborator_last, 'epoch'::timestamptz),
	           COALESCE(followed.followed_at, 'epoch'::timestamptz),
	           idx.last_modified_at
	       ) AS last_activity_at
	  FROM visible idx
	  LEFT JOIN self_recent sr ON sr.resource_rid = idx.resource_rid
	  LEFT JOIN collaborator_recent cr ON cr.resource_rid = idx.resource_rid
	  LEFT JOIN followed ON followed.resource_rid = idx.resource_rid
	 WHERE sr.resource_rid IS NOT NULL
	    OR cr.resource_rid IS NOT NULL
	    OR followed.resource_rid IS NOT NULL
)
SELECT resource_rid, resource_type, display_name, owning_project_id,
       owning_project_rid, organization_rids, marking_rids, last_modified_at,
       owner_id, tags, summary, long_text, long_text_sources, open_url, is_deleted,
       score,
       CASE
           WHEN collaborator_count > 0 THEN 'Collaborators are opening this'
           WHEN followed_at IS NOT NULL THEN 'From a project you follow'
           ELSE 'Recently opened by you'
       END AS reason,
       ARRAY_REMOVE(ARRAY[
           CASE WHEN collaborator_count > 0 THEN 'collaborator_activity' END,
           CASE WHEN self_open_count > 0 THEN 'recent_open' END,
           CASE WHEN followed_at IS NOT NULL THEN 'project_follow' END
       ], NULL)::text[] AS signals,
       collaborator_count,
       last_activity_at
  FROM scored
 ORDER BY score DESC, last_activity_at DESC, resource_rid ASC
 LIMIT $3`
}

func accessLogResourceRIDSQL(alias string) string {
	return `CASE ` + alias + `.resource_kind
		WHEN 'ontology_project' THEN 'ri.compass.main.project.' || ` + alias + `.resource_id::text
		WHEN 'ontology_folder' THEN 'ri.compass.main.folder.' || ` + alias + `.resource_id::text
		WHEN 'dataset' THEN 'ri.foundry.main.dataset.' || ` + alias + `.resource_id::text
		WHEN 'pipeline' THEN 'ri.foundry.main.pipeline.' || ` + alias + `.resource_id::text
		WHEN 'query' THEN 'ri.foundry.main.query.' || ` + alias + `.resource_id::text
		WHEN 'notebook' THEN 'ri.foundry.main.notebook.' || ` + alias + `.resource_id::text
		WHEN 'app' THEN 'ri.foundry.main.app.' || ` + alias + `.resource_id::text
		WHEN 'dashboard' THEN 'ri.foundry.main.dashboard.' || ` + alias + `.resource_id::text
		WHEN 'report' THEN 'ri.foundry.main.report.' || ` + alias + `.resource_id::text
		WHEN 'model' THEN 'ri.foundry.main.model.' || ` + alias + `.resource_id::text
		WHEN 'workflow' THEN 'ri.foundry.main.workflow.' || ` + alias + `.resource_id::text
		ELSE 'ri.openfoundry.main.resource.' || ` + alias + `.resource_id::text
	END`
}

func scanProjectFollow(row resourceSearchScannable) (*ProjectFollow, error) {
	var follow ProjectFollow
	if err := row.Scan(&follow.UserID, &follow.ProjectID, &follow.ProjectRID, &follow.CreatedAt); err != nil {
		return nil, err
	}
	return &follow, nil
}

func scanResourceRecommendation(row resourceSearchScannable) (*ResourceRecommendation, error) {
	var (
		rec         ResourceRecommendation
		orgJSON     []byte
		markJSON    []byte
		tagsJSON    []byte
		sourcesJSON []byte
		signals     []string
	)
	if err := row.Scan(
		&rec.ResourceRID, &rec.ResourceType, &rec.DisplayName,
		&rec.OwningProjectID, &rec.OwningProjectRID, &orgJSON,
		&markJSON, &rec.LastModifiedAt, &rec.OwnerID, &tagsJSON,
		&rec.Summary, &rec.LongText, &sourcesJSON, &rec.OpenURL, &rec.IsDeleted,
		&rec.Score, &rec.Reason, &signals, &rec.CollaboratorCount, &rec.LastActivityAt,
	); err != nil {
		return nil, err
	}
	rec.OrganizationRIDs = decodeStringArrayJSON(orgJSON)
	rec.MarkingRIDs = decodeStringArrayJSON(markJSON)
	rec.Tags = decodeStringArrayJSON(tagsJSON)
	rec.LongTextSources = decodeSearchTextSourcesJSON(sourcesJSON)
	rec.Signals = normalizeStringSlice(signals)
	rec.Normalize()
	rec.LongText = ""
	return &rec, nil
}

// pgxRowsLike narrows the pgx.Rows surface used in this package so
// tests can stub it without pulling in pgxpool.
type pgxRowsLike interface {
	Next() bool
	Scan(...any) error
	Close()
	Err() error
}
