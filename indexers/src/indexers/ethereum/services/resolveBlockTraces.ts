import config from '../../../config'
import fetch from 'cross-fetch'
import { ExternalEthTrace } from '../types'
import { EthTrace, logger } from 'shared'   
import { externalToInternalTraces } from '../transforms/traceTransforms'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100
}

async function resolveBlockTraces(hexBlockNumber: string, blockNumber: number, chainId: number): Promise<EthTrace[]> {
    let externalTraces = null
    let numAttempts = 0

    try {
        while (externalTraces === null && numAttempts < timing.MAX_ATTEMPTS) {
            externalTraces = await fetchTraces(hexBlockNumber)
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching traces for block ${hexBlockNumber}: ${err}`
    }

    if (externalTraces === null) {
        // TODO: Need to re-enqueue block to retry with top priority
        throw `Out of attempts - No traces found for block ${blockNumber}...`
    } else if (externalTraces.length === 0) {
        logger.info(`[${chainId}:${blockNumber}] No traces this block.`)
    } else {
        logger.info(`[${chainId}:${blockNumber}] Got traces.`)
    }

    return externalToInternalTraces(externalTraces, chainId)
}

async function fetchTraces(hexBlockNumber: string): Promise<ExternalEthTrace[] | null> {
    return new Promise(async (res, _) => {
        let resp
        try {
            resp = await fetch(config.ALCHEMY_ETH_MAINNET_REST_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    method: 'trace_block',
                    params: [hexBlockNumber],
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' }
            })
        } catch (err) {
            logger.error('Error fetching traces in top level block')
            setTimeout(() => res(null), timing.NOT_READY_DELAY)
            return
        }

        let data: { [key: string]: any } = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(`Error parsing json response while fetching traces for block ${hexBlockNumber}: ${err}`)
            data = {}
        }
        
        if (data?.error?.code === -32000 || !data?.result) {
            setTimeout(() => res(null), timing.NOT_READY_DELAY)
        } else if (data?.error) {
            throw `error fetching traces: ${data.error.code} - ${data.error.message}`
        } else {
            res(data.result || [] as ExternalEthTrace[])
        }
    })
}

export default resolveBlockTraces