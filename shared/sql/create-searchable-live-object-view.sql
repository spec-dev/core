CREATE OR REPLACE VIEW live_object_version_namespace_view AS
SELECT DISTINCT ON (lv.live_object_id)
    l.id AS live_object_id, 
    l.uid AS live_object_uid, 
    l.name AS live_object_name,
    l.display_name AS live_object_display_name,
    l.desc AS live_object_desc,
    l.has_icon AS live_object_has_icon, 
    l.namespace_id AS live_object_namespace_id, 
    lv.id AS version_id,
    lv.uid AS version_uid, 
    lv.nsp AS version_nsp, 
    lv.name AS version_name,
    lv.version AS version_version, 
    lv.url AS version_url, 
    lv.status AS version_status, 
    lv.properties AS version_properties, 
    lv.example AS version_example, 
    lv.config AS version_config, 
    lv.created_at AS version_created_at,
    lv.live_object_id AS version_live_object_id,
    n.id AS namespace_id, 
    n.name AS namespace_name, 
    n.slug AS namespace_slug, 
    n.code_url AS namespace_code_url, 
    n.has_icon AS namespace_has_icon, 
    n.created_at AS namespace_created_at 
FROM live_object_versions lv
LEFT JOIN live_objects l ON l.id = lv.live_object_id
LEFT JOIN namespaces n ON n.id = l.namespace_id
ORDER BY lv.live_object_id ASC, lv.created_at DESC;