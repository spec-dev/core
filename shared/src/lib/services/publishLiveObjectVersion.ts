import logger from '../logger'
import ChainTables from '../chain-tables/ChainTables'
import { StringKeyMap, PublishLiveObjectVersionPayload } from '../types'
import { getLatestLiveObjectVersion } from '../core/db/services/liveObjectVersionServices'
import { isVersionGt } from '../utils/validators'
import { upsertLiveObject } from '../core/db/services/liveObjectServices'
import { createLiveObjectVersionWithTx } from '../core/db/services/liveObjectVersionServices'
import { CoreDB } from '../core/db/dataSource'
import { createLiveEventVersionsWithTx } from '../core/db/services/liveEventVersionServices'
import { toNamespacedVersion, camelToSnake, unique } from '../utils/formatters'
import { getEventVersionsByNamespacedVersions } from '../core/db/services/eventVersionServices'
import { EventVersion } from '../core/db/entities/EventVersion'
import { LiveObjectVersionProperty } from '../core/db/entities/LiveObjectVersion'
import { INT8 } from '../utils/colTypes'
import { guessColTypeFromPropertyType } from '../utils/propertyTypes'
import { upsertEventsWithTx } from '../core/db/services/eventServices'
import { attemptToParseNumber } from '../utils/formatters'
import { upsertEventVersionsWithTx } from '../core/db/services/eventVersionServices'
import { getNamespaces } from '../core/db/services/namespaceServices'
import { createLiveCallHandlersWithTx } from '../core/db/services/liveCallHandlerServices'
import { getChainIdsForContractGroups } from '../core/db/services/contractInstanceServices'
import { ident } from 'pg-format'
import uuid4 from 'uuid4'

export async function publishLiveObjectVersion(
    namespace: StringKeyMap,
    liveObjectId: number | null,
    payload: PublishLiveObjectVersionPayload,
    representsContractEvent?: boolean
): Promise<boolean> {
    // Create nsp.name@version formatted string for live object version.
    const namespacedLiveObjectVersion = toNamespacedVersion(
        namespace.name,
        payload.name,
        payload.version
    )
    logger.info(`Publishing live object version: ${namespacedLiveObjectVersion}`)

    // Resolve input event versions.
    const inputEventVersions = await resolveEventVersions(payload.inputEvents)
    if (inputEventVersions === null) return false

    // Resolve the namespaces for any input calls.
    const inputCallNamespaceIds = await resolveInputCallNamespaceIds(payload.inputCalls || [])

    // Get any event versions explicitly requested.
    const additionalEventVersions = await resolveEventVersions(payload.additionalEventAssociations)
    if (additionalEventVersions === null) return false

    // Ensure the version to publish is greater than the existing version (if not contract event live object).
    const latestLov =
        !representsContractEvent && liveObjectId && (await getLatestLiveObjectVersion(liveObjectId))
    if (latestLov && !isVersionGt(payload.version, latestLov.version)) {
        logger.error(
            `Can't publish version ${payload.version} when ${latestLov.version} already exists.`
        )
        return false
    }

    // Derive live object version chain support.
    const config = payload.config
    const tablePath = config.table
    const properties = payload.properties || []
    const contractGroupsToDeriveChainIdsFrom = representsContractEvent
        ? [namespace.name]
        : inputEventVersions.map((ev) => ev.nsp)

    const chainIds = (await getChainIdsForContractGroups(contractGroupsToDeriveChainIdsFrom)) || []
    const chainIdsMap = {}
    for (const chainId of chainIds) {
        chainIdsMap[chainId] = {}
    }
    payload.config.chains = chainIdsMap

    // Use the most recent record in the table/view (if one exists).
    const { example, error } = await pullExampleFromTable(tablePath, properties)
    if (error) return false

    // Create/save all CoreDB data models.
    const saved = await saveDataModels(
        namespace,
        payload,
        liveObjectId,
        example,
        tablePath,
        namespacedLiveObjectVersion,
        inputEventVersions,
        inputCallNamespaceIds,
        additionalEventVersions,
        representsContractEvent
    )
    if (!saved) return false

    logger.info(`Successfully published live object version: ${namespacedLiveObjectVersion}`)
    return true
}

async function pullExampleFromTable(
    tablePath: string,
    properties: LiveObjectVersionProperty[]
): Promise<StringKeyMap> {
    return { example: null }
    const [schema, table] = tablePath.split('.')

    let record
    try {
        record = ((await ChainTables.query(
            schema,
            `select * from ${ident(schema)}.${ident(table)} limit 1;`
        )) || [])[0]
    } catch (err) {
        logger.error(`Error querying ${tablePath} for example record:`, err)
        return { error: err }
    }
    if (!record) {
        return { example: null }
    }

    const example = {}
    for (const property of properties) {
        const colName = camelToSnake(property.name)
        if (!record.hasOwnProperty(colName)) continue

        let colValue = record[colName]
        const derivedColType = guessColTypeFromPropertyType(property.type)
        const isNumeric = derivedColType === INT8
        colValue = isNumeric ? attemptToParseNumber(colValue) : colValue
        example[property.name] = colValue
    }

    return { example }
}

async function saveDataModels(
    namespace: StringKeyMap,
    payload: PublishLiveObjectVersionPayload,
    liveObjectId: number,
    example: StringKeyMap | null,
    tablePath: string,
    namespacedLiveObjectVersion: string,
    inputEventVersions: EventVersion[],
    inputCallNamespaceIds: number[],
    additionalEventVersions: EventVersion[],
    representsContractEvent?: boolean
): Promise<boolean> {
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert live object.
            liveObjectId = liveObjectId || (await createLiveObject(namespace.id, payload, tx))

            // Create new live object version.
            const liveObjectVersionId = await createLiveObjectVersion(
                namespace.name,
                liveObjectId,
                payload,
                example,
                tx
            )

            // Only create the <Name>Changed event for non-contract event live objects.
            if (!representsContractEvent) {
                // LiveObjectChanged event.
                const event = ((await upsertEventsWithTx(
                    [
                        {
                            namespaceId: namespace.id,
                            name: `${payload.name}Changed`,
                        },
                    ],
                    tx
                )) || {})[0]

                // LiveObjectChanged event version
                const eventVersion = ((await upsertEventVersionsWithTx(
                    [
                        {
                            eventId: event.id,
                            nsp: namespace.name,
                            name: event.name,
                            version: payload.version,
                        },
                    ],
                    tx
                )) || {})[0]

                // LiveObjectChanged live event version.
                if (eventVersion) {
                    await createLiveEventVersionsWithTx(
                        [
                            {
                                liveObjectVersionId,
                                eventVersionId: eventVersion.id,
                                isInput: false,
                            },
                        ],
                        tx
                    )
                }
            }

            // Input live event versions.
            inputEventVersions.length &&
                (await createLiveEventVersionsWithTx(
                    inputEventVersions.map((ev) => ({
                        liveObjectVersionId,
                        eventVersionId: ev.id,
                        isInput: true,
                    })),
                    tx
                ))

            // Create any additional live event versions that were explicitly specified.
            additionalEventVersions.length &&
                (await createLiveEventVersionsWithTx(
                    unique(additionalEventVersions.map((ev) => ev.id)).map((eventVersionId) => ({
                        liveObjectVersionId,
                        eventVersionId,
                        isInput: false,
                    })),
                    tx
                ))

            // Input call handlers.
            inputCallNamespaceIds.length &&
                (await createLiveCallHandlersWithTx(
                    payload.inputCalls
                        .map((callName, i) => {
                            const callNamespaceId = inputCallNamespaceIds[i]
                            if (!callNamespaceId) return null
                            const functionName = callName.split('.').pop()
                            return {
                                functionName,
                                liveObjectVersionId,
                                namespaceId: callNamespaceId,
                            }
                        })
                        .filter((v) => !!v),
                    tx
                ))
        })

        // Set the stage for record count tracking.
        await ChainTables.query(
            null,
            `insert into record_counts (table_path) values ($1) on conflict do nothing`,
            [tablePath]
        )
    } catch (err) {
        logger.error(
            `Failed to save data models while publishing ${namespacedLiveObjectVersion}: ${err}`
        )
        return false
    }
    return true
}

async function resolveEventVersions(namespacedVersions: string[]): Promise<EventVersion[] | null> {
    if (!namespacedVersions?.length) return []
    return await getEventVersionsByNamespacedVersions(namespacedVersions)
}

async function resolveInputCallNamespaceIds(inputCalls: string[]): Promise<number[]> {
    if (!inputCalls.length) return []
    const uniqueNsps = new Set<string>()
    const nspNameByIndex = {}
    for (let i = 0; i < inputCalls.length; i++) {
        const splitInputCallName = inputCalls[i].split('.')
        splitInputCallName.pop()
        const inputCallNsp = splitInputCallName.join('.')
        uniqueNsps.add(inputCallNsp)
        nspNameByIndex[i] = inputCallNsp
    }

    const namespaces = await getNamespaces(Array.from(uniqueNsps))
    const nspNameToId = {}
    for (const namespace of namespaces) {
        nspNameToId[namespace.name] = namespace.id
    }

    const namespaceIds = []
    for (let j = 0; j < inputCalls.length; j++) {
        const nspName = nspNameByIndex[j]
        const namespaceId = nspNameToId[nspName]
        namespaceIds.push(namespaceId)
    }

    return namespaceIds
}

async function createLiveObject(
    namespaceId: number,
    payload: PublishLiveObjectVersionPayload,
    tx: any
): Promise<number> {
    const liveObject = await upsertLiveObject(
        {
            uid: uuid4(),
            name: payload.name,
            desc: payload.description,
            displayName: payload.displayName,
            namespaceId: namespaceId,
        },
        tx
    )
    return liveObject.id
}

async function createLiveObjectVersion(
    nsp: string,
    liveObjectId: number,
    payload: PublishLiveObjectVersionPayload,
    example: StringKeyMap | null,
    tx: any
): Promise<number | null> {
    const liveObjectVersion = await createLiveObjectVersionWithTx(
        {
            uid: uuid4(),
            nsp,
            name: payload.name,
            version: payload.version,
            properties: payload.properties,
            example,
            config: payload.config,
            liveObjectId,
        },
        tx
    )
    return liveObjectVersion.id
}
