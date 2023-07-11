import { StringKeyMap } from '../types'
import {
    buildIconUrl,
    CoreDB,
    logger,
    isContractNamespace,
    camelizeKeys,
} from '../../../shared'
import path from 'path'
import config from '../config'
import { paramsToTsvector } from '../utils/formatters'

async function searchLiveObjects(query: string, filters: StringKeyMap, offset: number = 0, limit: number = config.LIVE_OBJECT_SEARCH_DEFAULT_BATCH_SIZE): Promise<StringKeyMap> {
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
                namespace_name, 
                namespace_code_url, 
                namespace_has_icon, 
                namespace_created_at,
                CASE WHEN $1::text IS NOT NULL THEN
                    to_tsvector('english', coalesce(version_name, '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(live_object_name, '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('english', coalesce(REPLACE(live_object_display_name, '.', ' '), '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(live_object_desc, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('simple', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(namespace_name, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), ''))
                END,
                CASE WHEN $2::text IS NOT NULL THEN
                    json_to_tsvector('english', version_config::json, '["all"]')
                END
            FROM live_object_version_namespace_view
            WHERE
            CASE
                WHEN $3::text IS NOT NULL THEN
                    to_tsvector('english', coalesce(version_name, '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(live_object_name, '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('english', coalesce(REPLACE(live_object_display_name, '.', ' '), '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(live_object_desc, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('simple', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(namespace_name, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    json_to_tsvector('english', version_config::json, '["all"]') @@ to_tsquery($3::text)
                WHEN $1::text IS NOT NULL THEN 
                    to_tsvector('english', coalesce(version_name, '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(live_object_name, '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('english', coalesce(REPLACE(live_object_display_name, '.', ' '), '')) ||
                    to_tsvector('english', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(live_object_desc, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), '')) ||
                    to_tsvector('simple', coalesce(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(namespace_name, '.', ' '), '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g'), ''))
                    @@ to_tsquery($1::text)
                WHEN $2::text IS NOT NULL THEN
                    json_to_tsvector('english', version_config::json, '["all"]') @@ to_tsquery($2::text)
                ELSE TRUE
            END
            ORDER BY version_created_at DESC OFFSET $4 LIMIT $5;`, [tsvectorQuery, tsvectorChainFilter, tsvectorQueryAndChainFilter, offset, limit]
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

function formatAsLatestLiveObject(result) {
    // Format results.
    const config = result.versionConfig
    const isContractEvent = isContractNamespace(result.namespaceName)

    let icon
    if (result.liveObjectHasIcon) {
        icon = buildIconUrl(result.liveObjectUid)
    } else if (result.namespaceHasIcon) {
        icon = buildIconUrl(result.namespaceName)
    } else if (isContractEvent) {
        icon = buildIconUrl(result.namespaceName.split('.')[2])
    } else {
        icon = '' // TODO: Need fallback
    }

    // TODO: Clean this up.
    let codeUrl = null
    if (!isContractEvent && result.namespaceCodeUrl && !!config?.folder) {
        codeUrl = path.join(result.namespaceCodeUrl, 'blob', 'master', config.folder, 'spec.ts')
    }

    return {
        id: result.liveObjectUid,
        name: result.liveObjectName,
        displayName: result.liveObjectDisplayName,
        desc: result.liveObjectDesc,
        icon,
        codeUrl,
        isContractEvent,
        latestVersion: {
            nsp: result.versionNsp,
            name: result.versionName,
            version: result.versionVersion,
            properties: result.versionProperties,
            example: result.versionExample,
            config: config,
            createdAt: result.versionCreatedAt.toISOString(),
        },
    }
}

export default searchLiveObjects