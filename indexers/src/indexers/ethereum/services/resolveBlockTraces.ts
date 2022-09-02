import config from '../../../config'
import fetch from 'cross-fetch'
import { ExternalEthTrace } from '../types'
import { EthTrace, logger, sleep } from '../../../../../shared'
import { externalToInternalTraces } from '../transforms/traceTransforms'
import { shouldRetryOnWeb3ProviderError } from '../../../errors'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
}

async function resolveBlockTraces(
    hexBlockNumber: string,
    blockNumber: number,
    chainId: number
): Promise<EthTrace[]> {
    let externalTraces = null
    let numAttempts = 0

    try {
        while (externalTraces === null && numAttempts < timing.MAX_ATTEMPTS) {
            externalTraces = await fetchTraces(hexBlockNumber)
            if (externalTraces === null) {
                await sleep(timing.NOT_READY_DELAY)
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
        resp = await fetch(config.ALCHEMY_ETH_MAINNET_REST_URL, {
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

    if (error) return null
    // if (error && shouldRetryOnWeb3ProviderError(error)) {
    //     return null
    // } else if (error) {
    //     throw error
    // }

    let data: { [key: string]: any } = {}
    try {
        data = await resp.json()
    } catch (err) {
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
        return data.result || ([] as ExternalEthTrace[])
    }
}

export default resolveBlockTraces
