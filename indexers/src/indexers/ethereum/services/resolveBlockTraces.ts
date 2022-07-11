import config from '../../../config'
import fetch from 'cross-fetch'
import { ExternalEthTrace } from '../types'
import { EthTrace } from 'shared'   
import { externalToInternalTraces } from '../transforms/traceTransforms'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 34
}

async function resolveBlockTraces(hexBlockNumber: string, chainId: number): Promise<EthTrace[]> {
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

    return externalToInternalTraces(externalTraces, chainId)
}

async function fetchTraces(hexBlockNumber: string): Promise<ExternalEthTrace[] | null> {
    return new Promise(async (res, _) => {
        const resp = await fetch(config.ALCHEMY_ETH_MAINNET_REST_URL, {
            method: 'POST', 
            body: JSON.stringify({
                method: 'trace_block',
                params: [hexBlockNumber],
                id: 1,
                jsonrpc: '2.0',
            }),
            headers: { 'Content-Type': 'application/json' }
        })
    
        const data = await resp.json()
        
        if (data.error?.code === -32000) {
            setTimeout(() => {
                res(null)
            }, timing.NOT_READY_DELAY)
        } else if (data.error) {
            throw `error fetching traces: ${data.error.code} - ${data.error.message}`
        } else if (data.result) {
            res(data.result as ExternalEthTrace[])
        }
    })
}

export default resolveBlockTraces