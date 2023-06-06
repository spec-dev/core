import config from '../../../config'
import fetch from 'cross-fetch'
import { PolygonTrace, logger, sleep, StringKeyMap } from '../../../../../shared'
import { externalToInternalTraces } from '../transforms/traceTransforms'

async function resolveBlockTraces(
    hexBlockNumber: string,
    blockNumber: number,
    blockHash: string,
    chainId: string,
): Promise<PolygonTrace[]> {
    let externalTraces = null
    let numAttempts = 0

    try {
        while (externalTraces === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            externalTraces = await fetchTraces(hexBlockNumber, blockNumber, chainId)
            if (externalTraces === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching traces for block ${hexBlockNumber}: ${err}`
    }

    if (externalTraces === null) {
        throw `Out of attempts - No traces found for block ${blockNumber}...`
    } else if (externalTraces.length === 0) {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] No traces this block.`)
    } else {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got traces.`)
    }

    return externalToInternalTraces(externalTraces, blockNumber, blockHash, chainId)
}

async function fetchTraces(
    hexBlockNumber: string,
    blockNumber: number,
    chainId: string,
): Promise<StringKeyMap[] | null> {
    let resp, error
    try {
        resp = await fetch(config.RPC_REST_URL, {
            method: 'POST',
            body: JSON.stringify({
                method: 'debug_traceBlockByNumber',
                params: [hexBlockNumber, { tracer: 'callTracer' }],
                id: 1,
                jsonrpc: '2.0',
            }),
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (err) {
        error = err
    }

    if (error) {
        logger.error(`Error fetching traces: ${error}. Will retry`)
        return null
    }

    let data: { [key: string]: any } = {}
    try {
        data = await resp.json()
    } catch (err) {
        config.IS_RANGE_MODE ||
            logger.error(
                `Error parsing json response while fetching traces for block ${hexBlockNumber}: ${err}`
            )
        data = {}
    }

    if (data?.error) {
        logger.error(
            `[${chainId}:${blockNumber}] Error fetching traces: ${data.error?.code} - ${data.error?.message}. Will retry`
        )
        return null
    }
    if (!data?.result) return null

    return data.result || []
}

export default resolveBlockTraces
