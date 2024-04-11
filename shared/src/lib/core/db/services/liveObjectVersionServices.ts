import { LiveObjectVersion, LiveObjectVersionStatus } from '../entities/LiveObjectVersion'
import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { formatLiveObjectVersionForPage, fromNamespacedVersion } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { In } from 'typeorm'
import { camelizeKeys } from 'humps'
import { getCachedRecordCounts } from '../../redis'

const liveObjectVersions = () => CoreDB.getRepository(LiveObjectVersion)
const eventVersionsRepo = () => CoreDB.getRepository(EventVersion)

export async function createLiveObjectVersion(
    nsp: string,
    liveObjectId: number,
    name: string,
    version: string
): Promise<LiveObjectVersion> {
    const liveObjectVersion = new LiveObjectVersion()
    liveObjectVersion.uid = uuid4()
    liveObjectVersion.nsp = nsp
    liveObjectVersion.name = name
    liveObjectVersion.version = version
    liveObjectVersion.liveObjectId = liveObjectId

    try {
        await liveObjectVersions().save(liveObjectVersion)
    } catch (err) {
        logger.error(
            `Error creating LiveObjectVersion(nsp=${nsp}, name=${name}, version=${version}): ${err}`
        )
        throw err
    }

    return liveObjectVersion
}

export async function getLiveObjectVersion(uid: string): Promise<LiveObjectVersion | null> {
    try {
        return await liveObjectVersions().findOneBy({ uid })
    } catch (err) {
        logger.error(`Error fetching LiveObjectVersion(uid=${uid}): ${err}`)
        return null
    }
}

export async function getLiveObjectVersionsByNamespacedVersions(
    namespacedVersions: string[]
): Promise<LiveObjectVersion[]> {
    const validNamespacedVersions = namespacedVersions
        .map(fromNamespacedVersion)
        .filter((obj) => !!obj.nsp && !!obj.name && !!obj.version)
    if (!validNamespacedVersions.length) return []

    let lovs = []
    try {
        lovs = await liveObjectVersions().find({ where: validNamespacedVersions })
    } catch (err) {
        logger.error(
            `Error fetching LiveObjectVersions for namespacedVersions: ${validNamespacedVersions.join(
                ', '
            )}`
        )
        return []
    }
    return lovs
}

export async function updateLiveObjectVersionProperties(id: number, properties: StringKeyMap[]) {
    try {
        await liveObjectVersions()
            .createQueryBuilder()
            .update({ properties })
            .where({ id })
            .execute()
    } catch (err) {
        logger.error(
            `Error setting LiveObjectVersion(id=${id}) properties to ${properties}: ${err}`
        )
        return false
    }
    return true
}

export async function updateLiveObjectVersionUrl(id: number, url: string) {
    try {
        await liveObjectVersions().createQueryBuilder().update({ url }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting LiveObjectVersion(id=${id}) url to ${url}: ${err}`)
        return false
    }
    return true
}

export async function updateLiveObjectVersionExample(id: number, example: StringKeyMap) {
    try {
        await liveObjectVersions().createQueryBuilder().update({ example }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting LiveObjectVersion(id=${id}) example to ${example}: ${err}`)
        return false
    }
    return true
}

export async function updateLiveObjectVersionConfig(id: number, config: StringKeyMap) {
    try {
        await liveObjectVersions().createQueryBuilder().update({ config }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting LiveObjectVersion(id=${id}) config to ${config}: ${err}`)
        return false
    }
    return true
}

export async function getLatestLiveObjectVersion(
    liveObjectId: number
): Promise<LiveObjectVersion | null> {
    try {
        const latest = await liveObjectVersions().find({
            where: { liveObjectId },
            order: { createdAt: 'DESC' },
            take: 1,
        })
        return latest?.length ? latest[0] : null
    } catch (err) {
        logger.error(
            `Error finding latest LiveObjectVersion by liveObjectId: ${liveObjectId}: ${err}`
        )
        return null
    }
}

export async function createLiveObjectVersionWithTx(
    data: StringKeyMap,
    tx: any
): Promise<LiveObjectVersion | null> {
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(LiveObjectVersion)
                .values(data)
                .orUpdate(['config', 'properties'], ['nsp', 'name', 'version'])
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
}

export async function updateLiveObjectVersionStatus(
    ids: number | number[],
    status: LiveObjectVersionStatus
) {
    ids = Array.isArray(ids) ? ids : [ids]
    try {
        await liveObjectVersions()
            .createQueryBuilder()
            .update({ status })
            .where({ id: In(ids) })
            .execute()
    } catch (err) {
        logger.error(
            `Error setting LiveObjectVersion(id=${ids.join(',')}) status to ${status}: ${err}`
        )
        return false
    }
    return true
}

export async function getCustomLiveObjectVersionUrls(): Promise<LiveObjectVersion[] | null> {
    try {
        const results = await CoreDB.query(
            `select url from live_object_versions where nsp not ilike '%.%' and status = 1 and url is not null`
        )
        return results.map((r) => r.url)
    } catch (err) {
        logger.error(`Error getting urls for custom LOVs: ${err}`)
        return null
    }
}

export async function getCustomLiveObjectVersionsToSync(
    timeSynced: string = null
): Promise<LiveObjectVersion[]> {
    let liveObjectVersions
    try {
        liveObjectVersions = await CoreDB.query(
            `SELECT
                live_object_uid,
                live_object_name, 
                live_object_display_name, 
                live_object_desc, 
                live_object_has_icon, 
                version_nsp,
                version_name, 
                version_version,
                version_config,
                version_updated_at,
                namespace_name,
                namespace_has_icon, 
                namespace_blurhash
            FROM searchable_live_object_view
            WHERE $1::timestamptz IS NULL or version_updated_at >= $1::timestamptz
            AND version_nsp NOT LIKE CONCAT('%.%')`,
            [new Date(timeSynced)]
        )
        liveObjectVersions = camelizeKeys(liveObjectVersions)
        return liveObjectVersions
    } catch (err) {
        logger.error(
            `Error getting LiveObjectVersions updated since last sync at ${timeSynced}: ${err}`
        )
        return null
    }
}

export async function getEventLiveObjectVersionsToSync(
    timeSynced: string = null
): Promise<LiveObjectVersion[]> {
    let liveObjectVersions
    try {
        liveObjectVersions = await CoreDB.query(
            `SELECT
                live_object_uid,
                live_object_name, 
                live_object_display_name, 
                live_object_desc, 
                live_object_has_icon, 
                version_nsp,
                version_name, 
                version_version,
                version_config,
                version_updated_at,
                namespace_name,
                namespace_has_icon, 
                namespace_blurhash
            FROM searchable_live_object_view
            WHERE $1::timestamptz IS NULL or version_updated_at >= $1::timestamptz
            AND version_nsp LIKE CONCAT('%.%')`,
            [new Date(timeSynced)]
        )
        liveObjectVersions = camelizeKeys(liveObjectVersions)
        return liveObjectVersions
    } catch (err) {
        logger.error(
            `Error getting LiveObjectVersions updated since last sync at ${timeSynced}: ${err}`
        )
        return null
    }
}

// someId is either the uid of the LOV or a partial version of the namespaced-version.
export async function resolveLovWithPartialId(someId: string): Promise<StringKeyMap | null> {
    let id = someId

    // Get by uid if not a namespaced-version.
    if (!id.includes('.')) {
        return getLiveObjectVersion(id)
    }

    const fakeVersion = 'fake'
    let { nsp, name, version } = fromNamespacedVersion(
        id.includes('@') ? id : `${id}@${fakeVersion}`
    )
    if (!nsp || !name || !version) {
        return null
    }

    const queryParams: any = { nsp, name }
    if (version !== fakeVersion) {
        queryParams.version = version
    }

    const matches = [queryParams]
    try {
        const results = await liveObjectVersions().find({
            where: matches,
            order: { createdAt: 'DESC' },
            take: 1,
        })
        return results[0]
    } catch (err) {
        logger.error(`Error finding LOV by ${queryParams}: ${err}`)
        return null
    }
}

export async function getTablePathsForLiveObjectVersions(uids: string[]): Promise<string[] | null> {
    try {
        const lovs = await liveObjectVersions().find({
            relations: {
                liveObject: true,
            },
            select: {
                config: {
                    table: true,
                },
            },
            where: {
                liveObject: {
                    uid: In(uids),
                },
            },
        })
        return lovs.map((lov) => lov.config.table)
    } catch (err) {
        logger.error(`Error getting table paths for live object versions: ${err}`)
        return null
    }
}

export async function getLiveObjectPageData(uid: string): Promise<StringKeyMap | null> {
    let liveObjectVersion
    try {
        liveObjectVersion = await liveObjectVersions().findOne({
            relations: {
                liveObject: {
                    namespace: true,
                },
                liveEventVersions: true,
            },
            where: { uid },
        })
    } catch (err) {
        logger.error(`Error getting live object page data for uid=${uid}: ${err}`)
        return null
    }
    if (!liveObjectVersion) return null

    const { nsp, name } = liveObjectVersion
    let hasManyVersions = false
    try {
        hasManyVersions =
            (await liveObjectVersions().count({
                where: { nsp, name },
            })) > 1
    } catch (err) {
        logger.error(`Error getting live object page data for uid=${uid}: ${err}`)
        return null
    }

    const inputEventVersionIds = liveObjectVersion.liveEventVersions
        .filter((lev) => lev.isInput === true)
        .map((lev) => lev.eventVersionId)

    let inputEventVersions = []
    try {
        inputEventVersions = inputEventVersionIds.length
            ? await eventVersionsRepo().find({
                  where: { id: In(inputEventVersionIds) },
              })
            : []
    } catch (err) {
        logger.error(
            `Error getting input event versions (${inputEventVersionIds.join(', ')}): ${err}`
        )
        return null
    }
    const inputEventComps = inputEventVersions.map((ev) => ({
        nsp: ev.nsp,
        name: ev.name,
        version: ev.version,
    }))

    let inputEventLovs = []
    try {
        inputEventLovs = inputEventComps.length
            ? await liveObjectVersions().find({
                  relations: {
                      liveObject: {
                          namespace: true,
                      },
                  },
                  where: inputEventComps,
              })
            : []
    } catch (err) {
        logger.error(`Error getting input event LOVs (${inputEventComps.join(', ')}): ${err}`)
        return null
    }

    const liveObjectTablePaths = [
        liveObjectVersion.config.table,
        ...inputEventLovs.map((lov) => lov.config.table),
    ]
    const recordCountsData = liveObjectTablePaths.length
        ? await getCachedRecordCounts(liveObjectTablePaths)
        : []

    const formattedLov = formatLiveObjectVersionForPage(liveObjectVersion, recordCountsData)

    return {
        ...formattedLov,
        hasManyVersions,
        inputEvents: inputEventLovs.map((lov) =>
            formatLiveObjectVersionForPage(lov, recordCountsData)
        ),
    }
}

export async function addChainSupportToLovs(namespacedVersions: string[], newChainIds: string[]) {
    const lovs = await getLiveObjectVersionsByNamespacedVersions(namespacedVersions)
    try {
        await CoreDB.manager.transaction(async (tx) => {
            const updates = []
            for (const lov of lovs) {
                const config = { ...lov.config }
                config.chains = config.chains || {}
                newChainIds.forEach((chainId) => {
                    config.chains[chainId] = {}
                })
                updates.push(
                    tx
                        .createQueryBuilder()
                        .update(LiveObjectVersion)
                        .set({ config })
                        .where('id = :id', { id: lov.id })
                        .execute()
                )
            }
            await Promise.all(updates)
        })
    } catch (err) {
        logger.error(
            `Failed to add chain support to LOVs (${namespacedVersions.join(', ')}): ${err}`
        )
        return false
    }
    return true
}

export async function addChainSupportToLovsDependentOn(
    namespacedEventVersions: string[],
    newChainIds: string[]
) {
    let lovs = []
    try {
        const eventVersions = await eventVersionsRepo().find({
            relations: {
                liveEventVersions: {
                    liveObjectVersion: true,
                },
            },
            where: namespacedEventVersions.map(fromNamespacedVersion),
        })
        const lovsMap = {}
        for (const eventVersion of eventVersions) {
            for (const liveEventVersion of eventVersion.liveEventVersions || []) {
                const lov = liveEventVersion.liveObjectVersion
                if (!liveEventVersion.isInput || !lov) continue
                lovsMap[lov.id] = lov
            }
        }
        lovs = Object.values(lovsMap)
    } catch (err) {
        logger.error(
            `Failed to add find LOVs dependent on (${namespacedEventVersions.join(', ')}): ${err}`
        )
        return false
    }
    if (!lovs.length) return true

    try {
        await CoreDB.manager.transaction(async (tx) => {
            const updates = []
            for (const lov of lovs) {
                const config = { ...lov.config }
                config.chains = config.chains || {}
                newChainIds.forEach((chainId) => {
                    config.chains[chainId] = {}
                })
                updates.push(
                    tx
                        .createQueryBuilder()
                        .update(LiveObjectVersion)
                        .set({ config })
                        .where('id = :id', { id: lov.id })
                        .execute()
                )
            }
            await Promise.all(updates)
        })
    } catch (err) {
        logger.error(
            `Failed to add chain support to LOVs (${lovs.map((lov) => lov.id).join(', ')}): ${err}`
        )
        return false
    }
    return true
}
