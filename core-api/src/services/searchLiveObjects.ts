import { StringKeyMap } from '../types'
import {
    CoreDB,
    logger,
    camelizeKeys,
    formatAsLatestLiveObject,
} from '../../../shared'
import config from '../config'
import { paramsToTsvector } from '../utils/formatters'
import { regExSplitOnUppercase } from '../utils/regEx'

async function searchLiveObjects(uid: string, query: string, filters: StringKeyMap, offset: number = 0, limit: number = config.LIVE_OBJECT_SEARCH_DEFAULT_BATCH_SIZE): Promise<StringKeyMap> {
    let results
    let [tsvectorQuery, tsvectorChainFilter, tsvectorQueryAndChainFilter] = await paramsToTsvector(query, filters)

    // Query database.
    try {
        results = await CoreDB.query(
            `SELECT
                live_object_uid,
                live_object_name, 
                live_object_display_name, 
                live_object_desc, 
                live_object_has_icon, 
                version_nsp,
                version_name, 
                version_version,
                version_properties,
                version_example,
                version_config,
                version_created_at,
                version_updated_at,
                namespace_name, 
                namespace_code_url, 
                namespace_has_icon, 
                namespace_created_at,
                namespace_name NOT LIKE '%.%' AS is_custom
            FROM searchable_live_object_view
            WHERE
            CASE
                WHEN $1::text IS NOT NULL THEN
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('version_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_display_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_desc', true)}, '')) ||
                    to_tsvector('simple', coalesce(${regExSplitOnUppercase('namespace_name', true)}, '')) ||
                    json_to_tsvector('english', version_config::json, '["all"]') 
                    @@ to_tsquery('english', $1::text)
                WHEN $2::text IS NOT NULL THEN 
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('version_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_display_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_desc', true)}, '')) ||
                    to_tsvector('simple', coalesce(${regExSplitOnUppercase('namespace_name', true)}, ''))
                    @@ to_tsquery('english', $2::text)
                WHEN $3::text IS NOT NULL THEN
                    json_to_tsvector('english', version_config::json, '["all"]') @@ to_tsquery($3::text)
                ELSE TRUE
            END
            AND ($4::text IS NULL OR live_object_uid = $4)
            AND ($5::text is null or version_nsp = $5::text or version_nsp ilike CONCAT('%.', $5, '.%'))
            AND namespace_name not ilike '%.test.%'
            AND namespace_name != 'test'
            ORDER BY is_custom DESC, version_created_at DESC
            OFFSET $6 LIMIT $7;`, [tsvectorQueryAndChainFilter, tsvectorQuery, tsvectorChainFilter, uid, filters.namespace, offset, limit]
        )
    } catch (err) {
        logger.error(`Error searching live objects: ${err}`)
        return { error: err?.message || err }
    }

    // Camelize result keys.
    results = camelizeKeys(results)

    // Return formatted results.
    return {
        data: results.map(formatAsLatestLiveObject),
    }
}

export default searchLiveObjects