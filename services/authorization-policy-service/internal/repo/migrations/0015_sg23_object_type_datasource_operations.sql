-- SG.23 object-type datasource operation catalog.
--
-- Restricted-view-backed object types require both ontology-level manager
-- authority and datasource-specific authority. Dataset and restricted-view
-- read grants remain explicit because backing data access is intentionally
-- separate from object type metadata access.

INSERT INTO permissions (id, resource, action, description) VALUES
    ('0196c3f1-7000-7000-8000-00000000002b', 'dataset', 'read', 'Read dataset rows used as an ontology object datasource'),
    ('0196c3f1-7000-7000-8000-00000000002c', 'object_type_datasource', 'read', 'Read object type datasource metadata and inherited restricted-view policy'),
    ('0196c3f1-7000-7000-8000-00000000002d', 'object_type_datasource', 'manage', 'Attach, replace, or remove object type backing datasources'),
    ('0196c3f1-7000-7000-8000-00000000002e', 'object_type_datasource', 'index', 'Register or re-index object type datasource policy changes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    -- ontology_viewer may inspect datasource metadata but still needs data-source grants.
    ('0196c3f1-7100-7000-8000-000000000012', '0196c3f1-7000-7000-8000-00000000002c'),
    -- ontology_editor can inspect datasource metadata for application work.
    ('0196c3f1-7100-7000-8000-000000000013', '0196c3f1-7000-7000-8000-00000000002c'),
    -- ontology_owner can manage datasource bindings and register/index changes.
    ('0196c3f1-7100-7000-8000-000000000014', '0196c3f1-7000-7000-8000-00000000002c'),
    ('0196c3f1-7100-7000-8000-000000000014', '0196c3f1-7000-7000-8000-00000000002d'),
    ('0196c3f1-7100-7000-8000-000000000014', '0196c3f1-7000-7000-8000-00000000002e')
ON CONFLICT (role_id, permission_id) DO NOTHING;
