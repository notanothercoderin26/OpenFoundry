-- SG.19 restricted-view operation catalog.
--
-- Adds the granular operations used by the identity-federation
-- restricted-view CRUD surface. Existing read/edit/manage permissions
-- remain valid broad aliases.

INSERT INTO permissions (id, resource, action, description) VALUES
    ('0196c3f1-7000-7000-8000-000000000024', 'restricted_view', 'create', 'Create a restricted view resource'),
    ('0196c3f1-7000-7000-8000-000000000025', 'restricted_view', 'create_resource', 'Create restricted view resource metadata'),
    ('0196c3f1-7000-7000-8000-000000000026', 'dataset', 'create_restricted_view', 'Create a restricted view backed by a dataset'),
    ('0196c3f1-7000-7000-8000-000000000027', 'restricted_view_policy', 'read', 'Read restricted view policy'),
    ('0196c3f1-7000-7000-8000-000000000028', 'restricted_view_policy', 'edit', 'Edit restricted view policy'),
    ('0196c3f1-7000-7000-8000-000000000029', 'restricted_view_transaction', 'view', 'View restricted view transactions'),
    ('0196c3f1-7000-7000-8000-00000000002a', 'restricted_view', 'build', 'Build or rebuild restricted view outputs')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    -- restricted_view_viewer
    ('0196c3f1-7100-7000-8000-000000000022', '0196c3f1-7000-7000-8000-000000000027'),
    ('0196c3f1-7100-7000-8000-000000000022', '0196c3f1-7000-7000-8000-000000000029'),
    -- restricted_view_editor
    ('0196c3f1-7100-7000-8000-000000000023', '0196c3f1-7000-7000-8000-000000000027'),
    ('0196c3f1-7100-7000-8000-000000000023', '0196c3f1-7000-7000-8000-000000000028'),
    ('0196c3f1-7100-7000-8000-000000000023', '0196c3f1-7000-7000-8000-000000000029'),
    ('0196c3f1-7100-7000-8000-000000000023', '0196c3f1-7000-7000-8000-00000000002a'),
    -- restricted_view_owner
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000024'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000025'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000026'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000027'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000028'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-000000000029'),
    ('0196c3f1-7100-7000-8000-000000000024', '0196c3f1-7000-7000-8000-00000000002a')
ON CONFLICT (role_id, permission_id) DO NOTHING;
