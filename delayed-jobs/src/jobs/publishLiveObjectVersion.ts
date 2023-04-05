import {
    logger,
    PublishLiveObjectVersionPayload,
    StringKeyMap,
    toNamespacedVersion,
    getLatestLiveObjectVersion,
    isVersionGt,
    upsertLiveObject,
    createLiveObjectVersionWithTx,
    upsertEdgeFunction,
    createEdgeFunctionVersionWithTx,
    CoreDB,
    lowerCaseCamel,
    LiveEdgeFunctionVersionRole,
    createLiveEdgeFunctionVersionWithTx,
    createLiveEventVersionsWithTx,
    getEventVersionsByNamespacedVersions,
    EventVersion,
    doesSharedTableExist,
    doesSharedViewExist,
    LiveObjectVersionProperty,
    chainIdForSchema,
    camelToSnake,
    SharedTables,
    supportedChainIds,
    INT8,
    guessColTypeFromPropertyType,
    upsertEventsWithTx,
    attemptToParseNumber,
    upsertEventVersionsWithTx,
    unique,
    getNamespaces,
    createLiveCallHandlersWithTx,
} from '../../../shared'
import os from 'os'
import path from 'path'
import fs from 'fs'
import rimraf from 'rimraf'
import git from 'nodegit'
import { MAIN_FUNCTION } from '../templates/deno'
import { deployToDeno } from '../cmds/deno'
import uuid4 from 'uuid4'
import { ident } from 'pg-format'

const denoProjects = {
    FUNCTIONS: 'functions',
    EVENTS: 'events',
}

const denoFiles = {
    INDEX: 'index.ts',
    UID: '_uid.ts',
}

export async function publishLiveObjectVersion(
    namespace: StringKeyMap,
    liveObjectId: number | null,
    payload: PublishLiveObjectVersionPayload,
) {
    // Create nsp.name@version formatted string for live object version.
    const namespacedLiveObjectVersion = toNamespacedVersion(
        namespace.name,
        payload.name,
        payload.version,
    )
    logger.info(`Publishing live object version: ${namespacedLiveObjectVersion}`)

    // Namespace needs a codeUrl to git-clone.
    if (!namespace.codeUrl) {
        logger.error(`Namespace "${namespace.name}" has no remote git repository.`)
        return
    }

    // Resolve input event versions.
    const inputEventVersions = await resolveEventVersions(payload.inputEvents)
    if (inputEventVersions === null) return
    
    // Resolve the namespaces for any input calls.
    const inputCallNamespaceIds = await resolveInputCallNamespaceIds(payload.inputCalls || [])

    // Get any event versions explicitly requested.
    const additionalEventVersions = await resolveEventVersions(payload.additionalEventAssociations)
    if (additionalEventVersions === null) return

    // Ensure the version to publish is greater than the existing version.
    const latestLiveObjectVersion = liveObjectId && await getLatestLiveObjectVersion(liveObjectId)
    if (latestLiveObjectVersion && !isVersionGt(payload.version, latestLiveObjectVersion.version)) {
        logger.error(
            `Can't publish version ${payload.version} when ${latestLiveObjectVersion.version} already exists.`
        )
        return
    }

    // Derive live object version chain support.
    const config = payload.config
    const tablePath = config.table
    const properties = payload.properties || []
    const chainsGiven = Object.keys(config.chains || {}).length > 0
    if (chainsGiven) {
        // Upsert table with path payload.config.table
    } else {
        // Table or view must already exist at this point.
        const exists = await ensureTableOrViewExists(tablePath)
        if (!exists) return

        // Use table schema or chain_id column values to derive chain support.
        const chains = await deriveChainSupportFromTable(tablePath, properties)
        if (!chains) return
        payload.config.chains = chains
    }

    // Use the most recent record in the table/view (if one exists).
    const { example, error } = await pullExampleFromTable(tablePath, properties)
    if (error) return

    // Create/save all CoreDB data models.
    const saved = await saveDataModels(
        namespace,
        payload,
        liveObjectId,
        example,
        namespacedLiveObjectVersion,
        inputEventVersions,
        inputCallNamespaceIds,
        additionalEventVersions,
    )
    if (!saved) return

    logger.info(`Successfully published live object version: ${namespacedLiveObjectVersion}`)
}

async function ensureTableOrViewExists(tablePath: string): Promise<boolean> {
    const [schema, table] = tablePath.split('.')
    const exists = (await doesSharedTableExist(schema, table)) || (await doesSharedViewExist(schema, table))
    if (!exists) logger.error(`Neither table or view exists for path: ${tablePath}`)
    return exists
}

async function deriveChainSupportFromTable(
    tablePath: string, 
    properties: LiveObjectVersionProperty[],
): Promise<StringKeyMap | null> {
    const chainIdsToMap = (chainIds: string[]): StringKeyMap => {
        let m = {}
        for (const chainId of chainIds) {
            m[chainId] = {}
        }
        return m
    }

    // For schemas like "ethereum", "polygon", "etc", derive the chainId from there.
    const [schema, table] = tablePath.split('.')
    const schemaChainId = chainIdForSchema[schema]
    if (schemaChainId) return chainIdsToMap([schemaChainId])

    // Otherwise, find the 1 property in the live object spec that holds chain ids.
    const chainIdProperty = properties.find(p => 
        [
            p.name.toLowerCase(),
            p.type.toLowerCase(),
        ].includes('chainid')
    )
    if (!chainIdProperty) {
        logger.error(`No property representing chainId exists.`)
        return null
    }

    // Convert found chainIdProperty property name to column name.
    const chainIdColumnName = camelToSnake(chainIdProperty.name)

    let derivedChainIds = []
    try {
        const result = (await SharedTables.query(
            `select distinct(${ident(chainIdColumnName)}) from ${ident(schema)}.${ident(table)}`
        )) || []
        derivedChainIds = result.map(r => r[chainIdColumnName]).filter(v => supportedChainIds.has(v))            
    } catch (err) {
        logger.error(`Error querying ${tablePath}.${chainIdColumnName} for distinct chain id values`, err)
        return null
    }
    if (!derivedChainIds.length) {
        logger.error(`No supported chain ids were derived from table/view ${tablePath}`)
        return null
    }

    return chainIdsToMap(derivedChainIds)
}

async function pullExampleFromTable(
    tablePath: string,
    properties: LiveObjectVersionProperty[],
): Promise<StringKeyMap> {
    const [schema, table] = tablePath.split('.')

    let record
    try {
        record = ((await SharedTables.query(
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

async function cloneRepo(url: string, uid: string): Promise<string | null> {
    // Create unique tmp dir to clone repo into.
    const dst = path.join(os.tmpdir(), uid)

    // Clone repo.
    try {
        await git.Clone(url, dst)
    } catch (err) {
        logger.error(`Error cloning ${url} into ${dst}: ${err}`)
        return null
    }

    // Ensure folder exists now.
    if (!fs.existsSync(dst)) {
        logger.error(`Cloning ${url} failed - No folder found at ${dst}`)
        return null
    }

    return dst
}

function deployLiveObjectMainFunction(liveObjectFolderPath: string, uid: string): string | null {
    // Save uid file so that deno recognizes a diff.
    if (!saveLiveObjectUidFile(liveObjectFolderPath, uid)) return null

    // Save index.ts entrypoint file.
    if (!saveIndexFile(liveObjectFolderPath, MAIN_FUNCTION)) return null
    
    // Deploy main function.
    return deployToDeno(
        denoProjects.FUNCTIONS, 
        liveObjectFolderPath,
        denoFiles.INDEX,
    )
}

function saveLiveObjectUidFile(liveObjectFolderPath: string, uid: string): boolean {
    try {
        fs.writeFileSync(path.join(liveObjectFolderPath, denoFiles.UID), uid)
    } catch (err) {
        logger.error(`Error saving live object uid file: ${err}`)
        return false
    }
    return true
}

function saveIndexFile(liveObjectFolderPath: string, fileContents: string): boolean {
    try {
        fs.writeFileSync(path.join(liveObjectFolderPath, denoFiles.INDEX), fileContents)
    } catch (err) {
        logger.error(`Error saving live object ${denoFiles.INDEX} file: ${err}`)
        return false
    }
    return true
}

async function saveDataModels(
    namespace: StringKeyMap,
    payload: PublishLiveObjectVersionPayload,
    liveObjectId: number,
    example: StringKeyMap | null,
    namespacedLiveObjectVersion: string,
    inputEventVersions: EventVersion[],
    inputCallNamespaceIds: number[],
    additionalEventVersions: EventVersion[],
): Promise<boolean> {
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert live object.
            liveObjectId = liveObjectId || await createLiveObject(namespace.id, payload, tx)

            // Create new live object version.
            const liveObjectVersionId = await createLiveObjectVersion(
                namespace.name, 
                liveObjectId, 
                payload,
                example,
                tx,
            )

            // LiveObjectUpserted event.
            const event = ((await upsertEventsWithTx([{
                namespaceId: namespace.id,
                name: `${payload.name}Upserted`,
            }], tx)) || {})[0]

            // LiveObjectUpserted event version
            const eventVersion = ((await upsertEventVersionsWithTx([{
                eventId: event.id,
                nsp: namespace.name,
                name: event.name,
                version: payload.version,
            }], tx)) || {})[0]

            // LiveObjectUpserted live event version.
            if (eventVersion) {
                await createLiveEventVersionsWithTx([{
                    liveObjectVersionId,
                    eventVersionId: eventVersion.id,
                    isInput: false,
                }], tx)
            }

            // Input live event versions.
            inputEventVersions.length && await createLiveEventVersionsWithTx(inputEventVersions.map(ev => ({
                liveObjectVersionId,
                eventVersionId: ev.id,
                isInput: true,
            })), tx)

            // Create any additional live event versions that were explicitly specified.
            additionalEventVersions.length && await createLiveEventVersionsWithTx(
                unique(additionalEventVersions.map(ev => ev.id)).map(eventVersionId => ({
                    liveObjectVersionId,
                    eventVersionId,
                    isInput: false,
                })), 
                tx,
            )
            
            // Input call handlers.
            inputCallNamespaceIds.length && await createLiveCallHandlersWithTx(payload.inputCalls.map((callName, i) => {
                const callNamespaceId = inputCallNamespaceIds[i]
                if (!callNamespaceId) return null
                const functionName = callName.split('.').pop()
                return {
                    functionName,
                    liveObjectVersionId,
                    namespaceId: callNamespaceId,
                }
            }).filter(v => !!v), tx)
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while publishing ${namespacedLiveObjectVersion}: ${err}`
        )
        return false
    }
    return true
}

function deleteDir(dir: string) {
    try {
        rimraf.sync(dir)
    } catch (err) {
        logger.error(`Failed to delete cloned git repo at ${dir}: ${err}`)
    }
}

async function resolveEventVersions(namespacedVersions: string[]): Promise<EventVersion[] | null> {
    if (!namespacedVersions?.length) return []
    return await getEventVersionsByNamespacedVersions(namespacedVersions)
}

export async function resolveInputCallNamespaceIds(inputCalls: string[]): Promise<number[]> {
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
    tx: any,
): Promise<number> {
    const liveObject = await upsertLiveObject({
        uid: uuid4(),
        name: payload.name,
        desc: payload.description,
        displayName: payload.displayName,
        namespaceId: namespaceId,
    }, tx)
    return liveObject.id
}

async function createLiveObjectVersion(
    nsp: string, 
    liveObjectId: number, 
    payload: PublishLiveObjectVersionPayload, 
    example: StringKeyMap | null,
    tx: any,
): Promise<number | null> {
    const liveObjectVersion = await createLiveObjectVersionWithTx({
        uid: uuid4(),
        nsp,
        name: payload.name,
        version: payload.version,
        properties: payload.properties,
        example,
        config: payload.config,
        liveObjectId,
    }, tx)
    return liveObjectVersion.id
}

export default function job(params: StringKeyMap) {
    const namespace = params.namespace || {}
    const liveObjectId = params.liveObjectId
    const payload = params.payload || {}
    return {
        perform: async () => publishLiveObjectVersion(namespace, liveObjectId, payload)
    }
}