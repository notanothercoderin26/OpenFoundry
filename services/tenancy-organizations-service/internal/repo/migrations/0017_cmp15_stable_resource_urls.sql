-- 0017: CMP.15 — stable RID-based Compass open URLs.
--
-- URLs must identify resources by RID rather than mutable path/name/slug. The
-- web router keeps legacy UUID paths working, but indexed open_url values are
-- rewritten to canonical RID routes so rename/move operations do not break
-- search results or cross-app launchers.

UPDATE compass_resource_search_index
   SET open_url = '/projects/' || resource_rid,
       indexed_at = NOW()
 WHERE resource_type = 'project'
   AND resource_rid LIKE 'ri.%'
   AND open_url IS DISTINCT FROM '/projects/' || resource_rid;

UPDATE compass_resource_search_index idx
   SET open_url = '/projects/' || COALESCE(idx.owning_project_rid, 'ri.compass.main.project.' || idx.owning_project_id::text)
                  || '/folders/' || idx.resource_rid,
       indexed_at = NOW()
 WHERE idx.resource_type = 'folder'
   AND idx.resource_rid LIKE 'ri.%'
   AND idx.owning_project_id IS NOT NULL
   AND idx.open_url IS DISTINCT FROM
       '/projects/' || COALESCE(idx.owning_project_rid, 'ri.compass.main.project.' || idx.owning_project_id::text)
       || '/folders/' || idx.resource_rid;
