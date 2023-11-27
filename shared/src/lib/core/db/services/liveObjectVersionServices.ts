import { LiveObjectVersion, LiveObjectVersionStatus } from '../entities/LiveObjectVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { fromNamespacedVersion } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { In } from 'typeorm'
import { camelizeKeys } from 'humps'

const liveObjectVersions = () => CoreDB.getRepository(LiveObjectVersion)

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
            select: {
                config: {
                    table: true,
                },
            },
            where: {
                uid: In(uids),
            },
        })
        return lovs.map((lov) => lov.config.table)
    } catch (err) {
        logger.error(`Error getting table paths for live object versions: ${err}`)
        return null
    }
}

export async function addChainSupportToLiveObjectVersions(
    namespacedVersions: string[],
    chainId: string
) {
    const lovs = await getLiveObjectVersionsByNamespacedVersions(namespacedVersions)
    try {
        await CoreDB.manager.transaction(async (tx) => {
            const updates = []
            for (const lov of lovs) {
                const config = { ...lov.config }
                config.chains = config.chains || {}
                config.chains[chainId] = {}
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
