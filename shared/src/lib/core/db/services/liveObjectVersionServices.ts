import { LiveObjectVersion, LiveObjectVersionStatus } from '../entities/LiveObjectVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { fromNamespacedVersion } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { In } from 'typeorm'

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

    try {
        const results = await liveObjectVersions().find({
            where: queryParams,
            order: { createdAt: 'DESC' },
            take: 1,
        })
        return results[0]
    } catch (err) {
        logger.error(`Error finding LOV by ${queryParams}: ${err}`)
        return null
    }
}
