import { 
    StringKeyMap, 
    logger, 
    getLovInputGenerator, 
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    newTablesJWT,
    sleep,
    enqueueDelayedJob,
    DEFAULT_TARGET_BLOCK_BATCH_SIZE,
    CoreDB,
    LiveObjectVersion,
    In,
    unique,
    SharedTables,
    getGeneratedEventsCursors,
} from '../../../shared'
import config from '../config'
import fetch from 'cross-fetch'

const DEFAULT_MAX_JOB_TIME = 60000

const lovsRepo = () => CoreDB.getRepository(LiveObjectVersion)

export async function indexLiveObjectVersions(
    lovIds: number[],
    lovTables: string[],
    startTimestamp: string | null = null,
    iteration: number = 1,
    maxIterations: number | null = null,
    maxJobTime: number = DEFAULT_MAX_JOB_TIME,
    targetBatchSize: number = DEFAULT_TARGET_BLOCK_BATCH_SIZE,
    shouldGenerateEvents: boolean,
    updateOpTrackingFloor: boolean,
    setLovToIndexingBefore: boolean,
    setLovToLiveAfter: boolean,
) {
    logger.info(`Indexing (${lovIds.join(', ')}) from ${startTimestamp || 'origin'}...`)

    let timer = setTimeout(() => {
        timer = null
    }, maxJobTime)

    let cursor = null
    try {
        // Get lov input generator.
        const { generator: generateFrom, inputIdsToLovIdsMap, liveObjectVersions } = (
            await getLovInputGenerator(lovIds, startTimestamp, targetBatchSize)
        ) || {}
        if (!generateFrom) throw `Failed to get LOV input generator`

        // Before/setup logic.
        if (iteration === 1) {
            // Set op-tracking floors to the head of each chain to prevent ops from 
            // being tracked for the potentially massive # of historical records
            // about to be indexed.
            if (updateOpTrackingFloor) {
                lovTables = lovTables.length ? lovTables : await getTablesForLovs(lovIds)
                await updateOpTrackingFloors(lovTables)
            }

            // Set live object version statuses to indexing.
            setLovToIndexingBefore && await updateLiveObjectVersionStatus(
                lovIds, 
                LiveObjectVersionStatus.Indexing,
            )
            
            // Slight break for race conditions with lovs potentially being saved elsewhere.
            await sleep(1000)
        }

        // Index live object versions.
        while (true) {
            const results = await generateFrom(cursor)
            const inputs = results.inputs || []
            await processInputs(lovIds, inputs, inputIdsToLovIdsMap, liveObjectVersions, cursor)
            cursor = results.nextStartDate
            if (!cursor || timer === null) break
        }
    } catch (err) {
        clearTimeout(timer)
        logger.error(`Indexing live object versions (id=${lovIds.join(',')}) failed:`, err)
        await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Failing)
        return
    }

    // All done -> set to "live".
    if (!cursor) {
        logger.info(`Done indexing live object versions (${lovIds.join(', ')}). Setting to "live".`)
        setLovToLiveAfter && await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Live)
        return
    }

    if (maxIterations && iteration >= maxIterations) {
        logger.info(`[${lovIds.join(', ')}] Completed all ${maxIterations} iterations.`)
        return
    }

    logger.info(`[${lovIds.join(', ')}] Enqueueing next indexer interation ${iteration}.`)

    // Iterate.
    await enqueueDelayedJob('indexLiveObjectVersions', {
        lovIds,
        lovTables,
        startTimestamp: cursor.toISOString(),
        iteration: iteration + 1,
        maxIterations,
        maxJobTime,
        targetBatchSize,
        shouldGenerateEvents,
        updateOpTrackingFloor,
        setLovToIndexingBefore,
        setLovToLiveAfter,
    })
}

async function getTablesForLovs(lovIds: number[]): Promise<string[]> {
    let tables = []
    try {
        tables = unique((await lovsRepo().find({
            where: {
                id: In(lovIds)
            }
        })).map(lov => lov.config?.table))
    } catch (err) {
        throw `Failed to get tables for lov ids ${lovIds.join(', ')}: ${err}`
    }

    if (!tables.length) {
        throw `No tables found for lovIds: ${lovIds.join(', ')}`
    }

    return tables
}

async function updateOpTrackingFloors(tables: string[]) {    
    const currentHeads = await getGeneratedEventsCursors()
    if (!Object.keys(currentHeads).length) return

    const updates = []
    for (const table of tables) {
        for (const chainId in currentHeads) {
            const blockNumber = currentHeads[chainId]
            if (blockNumber === null) continue

            // Shielding against potential race conditions.
            const opTrackingFloor = Math.max(0, Number(blockNumber) - 10)

            updates.push([
                table, 
                chainId, 
                opTrackingFloor,
            ])
        }
    }

    const queries = []
    for (const entry of updates) {
        const [table, chainId, opTrackingFloor] = entry
        queries.push({
            sql: `update op_tracking set is_enabled_above = $1 where table_path = $2 and chain_id = $3`,
            bindings: [opTrackingFloor, table, chainId],
        })
    }

    try {
        await Promise.all(queries.map(({ sql, bindings}) => SharedTables.query(sql, bindings)))
    } catch (err) {
        throw `Failed to update op-tracking floors for ${tables.join(', ')}: ${err}`
    }
}

async function processInputs(
    lovIds: number[],
    inputs: StringKeyMap[],
    inputIdsToLovIdsMap: StringKeyMap,
    liveObjectVersions: StringKeyMap,
    cursor: Date,
) {
    if (!inputs.length) return
    logger.info(`[${lovIds.join(', ')} - ${cursor?.toISOString()}] Processing ${inputs.length} inputs...`)
    const groupedInputs = createGroupInputs(inputs, inputIdsToLovIdsMap)
    for (const batchInputs of groupedInputs) {
        const lovIds = inputIdsToLovIdsMap[batchInputs[0].name] || []
        await Promise.all(lovIds.map(lovId => sendInputsToLov(batchInputs, liveObjectVersions[lovId])))
    }
}

function createGroupInputs(inputs: StringKeyMap[], inputIdsToLovIdsMap: StringKeyMap): StringKeyMap[][] {
    const groupInputs = []
    let batch = []
    let prevLovId = null
    for (const input of inputs) {
        const lovIds = inputIdsToLovIdsMap[input.name] || []
        if (!lovIds) continue

        if (lovIds.length > 1) {
            batch.length && groupInputs.push(batch)
            groupInputs.push([input])
            batch = []
            prevLovId = null
            continue
        }

        if (!prevLovId) {
            batch = [input]
            prevLovId = lovIds[0]
            continue
        }

        if (lovIds[0] !== prevLovId) {
            batch.length && groupInputs.push(batch)
            batch = [input]
            prevLovId = lovIds[0]
            continue
        }

        batch.push(input)

        if (batch.length > 100) {
            groupInputs.push(batch)
            batch = []
        }
    }
    batch.length && groupInputs.push(batch)
    return groupInputs
}

async function sendInputsToLov(
    inputs: StringKeyMap[],
    liveObjectVersion: StringKeyMap,
    attempts: number = 0,
) {
    const { id, url } = liveObjectVersion
    const tablesApiToken = newTablesJWT(liveObjectVersion.config.table.split('.')[0], 600000)

    const headers = {
        [config.EVENT_GEN_AUTH_HEADER_NAME]: config.EVENT_GENERATORS_JWT,
        [config.TABLES_AUTH_HEADER_NAME]: tablesApiToken,
    }

    let resp
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(inputs),
        })
    } catch (err) {
        logger.error(`Request error to ${url} (lovId=${id}): ${err}`)
        if (attempts <= 10) {
            await sleep(2000)
            return sendInputsToLov(inputs, liveObjectVersion, attempts + 1)
        } else {
            throw err
        }
    }

    let respData
    try {
        respData = (await resp?.json()) || []
    } catch (err) {
        logger.error(`Failed to parse JSON response (lovId=${id}): ${err}`
        )
    }
    if (resp?.status !== 200) {
        const msg = `Request to ${url} (lovId=${id}) failed with status ${resp?.status}: ${
            JSON.stringify(respData || {})
        }.`
        logger.error(msg)
        if (attempts <= 10) {
            await sleep(2000)
            let retryInputs = inputs
            if (resp.status == 500 && respData && respData.hasOwnProperty('index')) {
                retryInputs = retryInputs.slice(Number(respData.index))
            }
            return sendInputsToLov(retryInputs, liveObjectVersion, attempts + 1)
        } else {
            throw msg
        }
    }
}

export default function job(params: StringKeyMap) {
    const lovIds = params.lovIds || []
    const lovTables = params.lovTables || []
    const startTimestamp = params.startTimestamp
    const iteration = params.iteration || 1
    const maxIterations = params.maxIterations || null
    const maxJobTime = params.maxJobTime || DEFAULT_MAX_JOB_TIME
    const targetBatchSize = params.targetBatchSize || DEFAULT_TARGET_BLOCK_BATCH_SIZE
    const shouldGenerateEvents = params.shouldGenerateEvents === true
    const updateOpTrackingFloor = params.updateOpTrackingFloor !== false

    // TODO: Whether to flip status of lov to indexing/live
    const setLovToIndexingBefore = params.setLovToIndexingBefore !== false
    const setLovToLiveAfter = params.setLovToLiveAfter !== false

    return {
        perform: async () => indexLiveObjectVersions(
            lovIds,
            lovTables,
            startTimestamp, 
            iteration,
            maxIterations,
            maxJobTime,
            targetBatchSize,
            shouldGenerateEvents,
            updateOpTrackingFloor,
            setLovToIndexingBefore,
            setLovToLiveAfter,
        )
    }
}