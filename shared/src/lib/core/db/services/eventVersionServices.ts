import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { ILike, In, MoreThanOrEqual } from 'typeorm'
import {
    supportedChainIds,
    contractNamespaceForChainId,
    isContractNamespace,
    chainIdForContractNamespace,
} from '../../../utils/chainIds'
import {
    fromNamespacedVersion,
    toNamespacedVersion,
    unique,
    splitOnLastOccurance,
    camelizeKeys,
    formatLiveObjectPageData,
} from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { getLastEvent } from '../../../indexer/redis'
import { getCachedRecordCounts } from '../../redis'

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

export async function getEventVersions(
    filters: StringKeyMap,
    timeSynced: string = null
): Promise<EventVersion[] | null> {
    try {
        return await eventVersionsRepo().find({
            relations: { event: { namespace: true } },
            select: {
                uid: true,
                name: true,
                version: true,
                createdAt: true,
            },
            where: {
                event: {
                    namespace: {
                        slug: ILike(filters.namespace ? `%.contracts.${filters.namespace}.%` : '%'),
                    },
                },
                updatedAt: MoreThanOrEqual(new Date(timeSynced)),
            },
            order: { createdAt: 'DESC' },
        })
    } catch (err) {
        logger.error(`Error getting EventVersions: ${err}`)
        return null
    }
}

export async function getEventVersionsInNsp(nsp: string): Promise<EventVersion[] | null> {
    try {
        return await eventVersionsRepo().findBy({ nsp })
    } catch (err) {
        logger.error(`Error getting EventVersions (nsp=${nsp}): ${err}`)
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

export async function getContractEventsForGroup(group: string): Promise<StringKeyMap[] | null> {
    const events: StringKeyMap[] = []

    const fullNamespaceNames: string[] = []
    for (const supportedChainId of supportedChainIds) {
        const nspForChainId = contractNamespaceForChainId(supportedChainId)
        const fullPath = `${nspForChainId}.${group}`
        fullNamespaceNames.push(fullPath)
    }

    try {
        const eventVersions = await eventVersionsRepo().find({
            where: { nsp: In(fullNamespaceNames) },
            order: {
                name: 'ASC',
            },
            select: {
                name: true,
                version: true,
                nsp: true,
            },
        })

        const eventsMap: StringKeyMap = {}
        const splitValue = ' '

        // gather all chainIds for each unique [name, version] pair
        for (const { nsp, name, version } of eventVersions) {
            const chainId = chainIdForContractNamespace(nsp)
            const uniqueKey = `${name}${splitValue}${version}`
            eventsMap[uniqueKey] = eventsMap[uniqueKey]
                ? eventsMap[uniqueKey].concat([chainId]).sort((a, b) => {
                      return a - b
                  })
                : [chainId]
        }

        // convert unique [name, version] eventsMap to array of each unique event
        for (const [key, chainIds] of Object.entries(eventsMap)) {
            const [name, version] = key.split(splitValue)
            events.push({ name, version, chainIds })
        }
    } catch (err) {
        logger.error(`Error getting contract events for group=${group}: ${err}`)
        return null
    }

    return events
}

export async function resolveEventVersionCursors(givenName: string): Promise<StringKeyMap> {
    const [nspName, version] = givenName.split('@')
    const splitName = nspName.split('.')
    const numSections = splitName.length
    const isValid =
        numSections === 2 ||
        numSections === 3 ||
        (numSections === 5 && isContractNamespace(nspName))
    if (!isValid) throw `Invalid event "${givenName}"`

    // Event versions where query filter.
    const where = []

    // Live object event.
    const isLiveObjectEventVerison = splitName.length === 2
    if (isLiveObjectEventVerison) {
        const [nsp, name] = splitName
        const filters: StringKeyMap = { nsp, name }
        if (version) {
            filters.version = version
        }
        where.push(filters)
    }
    // Contract event.
    else {
        // Chain-specific namespace already given...
        if (numSections === 5) {
            const [nsp, name] = splitOnLastOccurance(nspName, '.')
            const filters: StringKeyMap = { nsp, name }
            if (version) {
                filters.version = version
            }
            where.push(filters)
        }

        // Add all supported chain specific namespaces.
        for (const supportedChainId of supportedChainIds) {
            const [nsp, name] = splitOnLastOccurance(nspName, '.')
            const fullNsp = `${contractNamespaceForChainId(supportedChainId)}.${nsp}`
            const filters: StringKeyMap = { nsp: fullNsp, name }
            if (version) {
                filters.version = version
            }
            where.push(filters)
        }
    }

    // Get any matching event versions (can be multiple for the given event name).
    let eventVersions = []
    try {
        eventVersions = await eventVersionsRepo().find({ where })
    } catch (err) {
        const error = `Error finding event versions: ${err}`
        logger.error(error)
        throw error
    }
    if (!eventVersions.length) throw `No event exists for "${givenName}"`

    // Format into full event names.
    const fullEventNames = eventVersions.map((ev) =>
        toNamespacedVersion(ev.nsp, ev.name, ev.version)
    )

    // Get the latest cursor for each event.
    const cursors = []
    const latestEvents = await Promise.all(fullEventNames.map(getLastEvent))
    let latestEvent = null
    for (let i = 0; i < fullEventNames.length; i++) {
        const event = latestEvents[i]
        if (
            event &&
            (!latestEvent ||
                new Date(event.origin.blockTimestamp) > new Date(latestEvent.origin.blockTimestamp))
        ) {
            latestEvent = event
        }
        cursors.push({
            name: fullEventNames[i],
            nonce: event?.origin?.nonce || `${Date.now()}-0`,
        })
    }

    return { cursors, latestEvent }
}

export async function getEventVersionsByLiveObject(uid: string): Promise<string[] | null> {
    let eventVersions
    try {
        eventVersions = await eventVersionsRepo().find({
            relations: {
                liveEventVersions: {
                    liveObjectVersion: {
                        liveObject: {
                            namespace: true,
                        },
                    },
                },
            },
            where: {
                liveEventVersions: {
                    liveObjectVersion: {
                        liveObject: { uid },
                    },
                    isInput: true,
                },
            },
        })
    } catch (err) {
        logger.error(`Error getting event versions by live object uid: ${err}`)
        return null
    }

    // Camelize result keys.
    eventVersions = camelizeKeys(eventVersions)

    const liveObjectTablePaths = eventVersions.map((e) => e.versionConfig?.table).filter((v) => !!v)
    const recordCountsData = liveObjectTablePaths.length
        ? await getCachedRecordCounts(liveObjectTablePaths)
        : []

    // Return formatted event versions.
    return eventVersions.map((r) => formatLiveObjectPageData(r, recordCountsData, true))
}
