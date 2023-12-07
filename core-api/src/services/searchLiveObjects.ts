import { StringKeyMap } from '../types'
import {
    CoreDB,
    logger,
    camelizeKeys,
    getCachedRecordCounts,
    stripTrailingSlash,
    isContractNamespace,
    buildIconUrl,
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
                version_uid,
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
                namespace_blurhash, 
                namespace_verified, 
                namespace_created_at,
                namespace_name NOT LIKE '%.%' AS is_custom,
                namespace_searchable,
                group_name
            FROM searchable_live_object_view
            WHERE
            CASE
                WHEN $1::text IS NOT NULL THEN
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('version_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_display_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_desc', true)}, '')) ||
                    to_tsvector('simple', coalesce(${regExSplitOnUppercase('namespace_name', true)}, '')) ||
                    to_tsvector('simple', coalesce(group_name, '')) ||
                    json_to_tsvector('english', version_config::json, '["all"]') 
                    @@ to_tsquery('english', $1::text)
                WHEN $2::text IS NOT NULL THEN 
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('version_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_display_name', false)}, '')) ||
                    to_tsvector('english', coalesce(${regExSplitOnUppercase('live_object_desc', true)}, '')) ||
                    to_tsvector('simple', coalesce(${regExSplitOnUppercase('namespace_name', true)}, '')) ||
                    to_tsvector('simple', coalesce(group_name, ''))
                    @@ to_tsquery('english', $2::text)
                WHEN $3::text IS NOT NULL THEN
                    json_to_tsvector('english', version_config::json, '["all"]') @@ to_tsquery($3::text)
                ELSE TRUE
            END
            AND namespace_searchable is true
            AND ($4::text IS NULL OR version_uid = $4)
            AND ($5::text is null or version_nsp = $5::text or version_nsp ilike CONCAT($5, '.%'))
            ORDER BY is_custom DESC, version_created_at DESC
            OFFSET $6 LIMIT $7;`, [tsvectorQueryAndChainFilter, tsvectorQuery, tsvectorChainFilter, uid, filters.namespace, offset, limit]
        )
    } catch (err) {
        logger.error(`Error searching live objects: ${err}`)
        return { error: err?.message || err }
    }

    // Camelize keys and for *custom* LOVs, only take the most recent version.
    results = camelizeKeys(results)
    const distinctResults = []
    const seenLovNames = new Set()
    for (const result of results) {
        if (result.isCustom) {
            const fullName = [result.versionNsp, result.versionName].join('.')
            if (seenLovNames.has(fullName)) continue
            seenLovNames.add(fullName)
        }
        distinctResults.push(result)
    }

    const liveObjectTablePaths = distinctResults.map(r => r.versionConfig?.table).filter(v => !!v)
    const recordCountsData = liveObjectTablePaths.length ? await getCachedRecordCounts(liveObjectTablePaths) : []

    // Return formatted results.
    return {
        data: distinctResults.map(r => formatAsLatestLiveObject(r, recordCountsData)),
    }
}

function formatAsLatestLiveObject(result: StringKeyMap, recordCountsData: StringKeyMap) {
    const isContractEvent = isContractNamespace(result.namespaceName)
    const config = result.versionConfig
    const tablePath = config?.table || null
    const recordCountInfo = tablePath ? (recordCountsData[tablePath] || {}) : {}
    let numRecords = parseInt(recordCountInfo.count)
    numRecords = Number.isNaN(numRecords) ? 0 : numRecords

    let icon
    if (result.liveObjectHasIcon) {
        icon = buildIconUrl(result.liveObjectUid)
    } else if (result.namespaceHasIcon) {
        icon = buildIconUrl(result.namespaceName)
    } else if (isContractEvent) {
        icon = buildIconUrl(result.namespaceName.split('.')[0])
    } else {
        icon = '' // TODO: Need fallback
    }

    let codeUrl = null
    if (!isContractEvent && result.namespaceCodeUrl && !!config?.folder) {
        codeUrl = [stripTrailingSlash(result.namespaceCodeUrl), 'blob', 'main', config.folder, 'spec.ts'].join('/')
    }

    return {
        id: result.liveObjectUid,
        name: result.liveObjectName,
        displayName: result.liveObjectDisplayName,
        desc: result.liveObjectDesc,
        icon,
        codeUrl,
        blurhash: result.namespaceBlurhash,
        verified: result.namespaceVerified,
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
        records: numRecords,
        lastInteraction: recordCountInfo.updatedAt || null,
    }
}

export default searchLiveObjects