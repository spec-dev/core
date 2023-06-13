import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { fromNamespacedVersion, toNamespacedVersion, unique } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { isContractNamespace } from '../../../utils/chainIds'

const eventVersionsRepo = () => CoreDB.getRepository(EventVersion)

export async function createEventVersion(
    eventId: number,
    nsp: string,
    name: string,
    version: string
): Promise<EventVersion> {
    const eventVersion = new EventVersion()
    eventVersion.uid = uuid4()
    eventVersion.nsp = nsp
    eventVersion.name = name
    eventVersion.version = version
    eventVersion.eventId = eventId

    try {
        await eventVersionsRepo().save(eventVersion)
    } catch (err) {
        logger.error(
            `Error creating EventVersion(nsp=${nsp}, name=${name}, version=${version}): ${err}`
        )
        throw err
    }

    return eventVersion
}

export async function getEventVersion(
    nsp: string,
    name: string,
    version: string
): Promise<EventVersion | null> {
    try {
        return await eventVersionsRepo().findOneBy({ nsp, name, version })
    } catch (err) {
        logger.error(`Error getting EventVersion ${nsp}.${name}@${version}: ${err}`)
        return null
    }
}

export async function getEventVersionsByNamespacedVersions(
    namespacedVersions: string[]
): Promise<EventVersion[]> {
    const validNamespacedVersions = namespacedVersions
        .map(fromNamespacedVersion)
        .filter((obj) => !!obj.nsp && !!obj.name && !!obj.version)
    if (!validNamespacedVersions.length) return []

    let eventVersions = []
    try {
        eventVersions = await eventVersionsRepo().find({ where: validNamespacedVersions })
    } catch (err) {
        logger.error(
            `Error fetching EventVersions for namespacedVersions: ${validNamespacedVersions.join(
                ', '
            )}: ${err}`
        )
        return []
    }
    return eventVersions
}

export async function upsertEventVersionsWithTx(data: StringKeyMap[], tx: any) {
    const entries = data.map((d) => ({ ...d, uid: uuid4() }))
    return (
        await tx
            .createQueryBuilder()
            .insert()
            .into(EventVersion)
            .values(entries)
            .orIgnore()
            .returning('*')
            .execute()
    ).generatedMaps
}

export async function resolveEventVersionNames(inputs: string[]): Promise<StringKeyMap> {
    const uniqueInputs = unique(inputs).filter((v) => !!v)
    const fakeVersion = 'fake'
    const uniqueNspNamesSet = new Set<string>()
    const inputComps = []

    for (const input of uniqueInputs) {
        const { nsp, name, version } = fromNamespacedVersion(
            input.includes('@') ? input : `${input}@${fakeVersion}`
        )
        if (!nsp || !name || !version || !isContractNamespace(nsp)) continue
        inputComps.push({
            nsp,
            name,
            version: version === fakeVersion ? '' : version,
        })
        uniqueNspNamesSet.add([nsp, name].join(':'))
    }

    const uniqueNspNames = Array.from(uniqueNspNamesSet).map((v) => {
        const [nsp, name] = v.split(':')
        return { nsp, name }
    })
    if (!uniqueNspNames.length) return { data: {} }

    let eventVersions = []
    try {
        eventVersions = await eventVersionsRepo().find({ where: uniqueNspNames })
    } catch (err) {
        logger.error(`Error fetching EventVersions for: ${JSON.stringify(uniqueNspNames)}: ${err}`)
        return { error: 'Error looking up event versions.' }
    }
    if (!eventVersions.length) return { data: {} }

    const existingVersionsByNspName = {}
    for (const eventVersion of eventVersions) {
        const { nsp, name, version } = eventVersion
        const key = [nsp, name].join('.')
        existingVersionsByNspName[key] = existingVersionsByNspName[key] || []
        existingVersionsByNspName[key].push(version)
    }

    const resolvedNamesMap = {}
    for (const { nsp, name, version } of inputComps) {
        const key = [nsp, name].join('.')
        const existingVersions = existingVersionsByNspName[key] || []
        const numExistingVersions = existingVersions.length

        // No registered event versions were found for this nsp+name.
        if (!numExistingVersions) continue

        // Multiple versions exist but no exact version was specified.
        if (numExistingVersions > 1 && !version) {
            return {
                data: {
                    error:
                        `Ambigious event reference "${key}"\n` +
                        `Multiple versions exist...Choose from one of the following:\n` +
                        `${existingVersions
                            .map((v) => `- ${toNamespacedVersion(nsp, name, v)}`)
                            .join('\n')}`,
                },
            }
        }

        // Version was specified but not registered.
        if (version && !existingVersions.includes(version)) continue

        const actualVersion = version || existingVersions[0]
        const givenInput = version ? toNamespacedVersion(nsp, name, version) : key
        resolvedNamesMap[givenInput] = toNamespacedVersion(nsp, name, actualVersion)
    }

    return { data: resolvedNamesMap }
}
