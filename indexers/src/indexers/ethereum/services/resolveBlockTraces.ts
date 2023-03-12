import config from '../../../config'
import fetch from 'cross-fetch'
import { ExternalEthTrace } from '../types'
import { EthTrace, logger, sleep } from '../../../../../shared'
import { externalToInternalTraces } from '../transforms/traceTransforms'

async function resolveBlockTraces(
    hexBlockNumber: string,
    blockNumber: number,
    chainId: string
): Promise<EthTrace[]> {
    let externalTraces = null
    let numAttempts = 0

    try {
        while (externalTraces === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            externalTraces = await fetchTraces(hexBlockNumber)
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

    return externalToInternalTraces(externalTraces, chainId)
}

async function fetchTraces(hexBlockNumber: string): Promise<ExternalEthTrace[] | null> {
    let resp, error
    try {
        resp = await fetch(config.ALCHEMY_REST_URL, {
            method: 'POST',
            body: JSON.stringify({
                method: 'trace_block',
                params: [hexBlockNumber],
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

    if (data?.error?.code === -32000 || !data?.result) {
        return null
    } else if (data?.error) {
        throw `error fetching traces: ${data.error.code} - ${data.error.message}`
    } else {
        return (data.result || []) as ExternalEthTrace[]
    }
}

export default resolveBlockTraces
