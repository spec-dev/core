import { 
    StringKeyMap, 
    logger, 
    getLovInputGenerator, 
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    newTablesJWT,
    sleep,
    enqueueDelayedJob,
} from '../../../shared'
import config from '../config'
import fetch from 'cross-fetch'

const DEFAULT_MAX_JOB_TIME = 60000

export async function indexLiveObjectVersions(
    lovIds: number[],
    startTimestamp: string | null = null,
    maxJobTime: number = DEFAULT_MAX_JOB_TIME
) {
    logger.info(`Indexing (${lovIds.join(', ')}) from ${startTimestamp || 'origin'}...`)

    let timer = setTimeout(() => {
        timer = null
    }, maxJobTime)

    let cursor = null
    try {
        // Get lov input generator.
        const { generator, inputIdsToLovIdsMap, liveObjectVersions } = (
            await getLovInputGenerator(lovIds, startTimestamp)
        ) || {}
        if (!generator) throw `Failed to get LOV input generator`
        
        // Set live object version statuses to indexing.
        await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Indexing)

        // Index live object versions.
        while (true) {
            const results = await generator(cursor)
            const inputs = results.inputs || []
            await processInputs(inputs, inputIdsToLovIdsMap, liveObjectVersions)
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
        await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Live)
        return
    }

    logger.info(`Enqueueing next indexer interation.`)

    // Iterate.
    await enqueueDelayedJob('indexLiveObjectVersions', {
        lovIds,
        startTimestamp: cursor.toISOString(),
        maxJobTime,
    })
}

async function processInputs(
    inputs: StringKeyMap[],
    inputIdsToLovIdsMap: StringKeyMap,
    liveObjectVersions: StringKeyMap,
) {
    if (!inputs.length) return
    logger.info(`Processing ${inputs.length} live object version inputs...`)
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
            sendInputsToLov(inputs, liveObjectVersion, attempts + 1)
        } else {
            throw err
        }
    }

    let respData
    try {
        respData = (await resp?.json()) || []
    } catch (err) {
        logger.error(`Failed to parse JSON response (lovId=${id}): ${err}`)
    }
    if (resp?.status !== 200) {
        const msg = `Request to ${url} (lovId=${id}) failed with status ${resp?.status}: ${
            JSON.stringify(respData || [])
        }.`
        logger.error(msg)
        if (attempts <= 10) {
            await sleep(2000)
            sendInputsToLov(inputs, liveObjectVersion, attempts + 1)
        } else {
            throw msg
        }
    }
}

export default function job(params: StringKeyMap) {
    const lovIds = params.lovIds || {}
    const startTimestamp = params.startTimestamp
    const maxJobTime = params.maxJobTime || DEFAULT_MAX_JOB_TIME
    return {
        perform: async () => indexLiveObjectVersions(lovIds, startTimestamp, maxJobTime)
    }
}