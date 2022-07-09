import config from '../../../config'
import fetch from 'node-fetch'
import { ExternalTrace } from '../types'

async function getBlockTraces(blockNumber: number): Promise<ExternalTrace[]> {
    let resp, data
    try {
        resp = await fetch(config.ALCHEMY_ETH_MAINNET_REST_URL, {
            method: 'POST', 
            body: JSON.stringify({
                method: 'trace_block',
                params: [blockNumber ...], // TODO: HEX THIS
                id: 1,
                jsonrpc: '2.0',
            }),
            headers: { 'Content-Type': 'application/json' }
        })
        data = await resp.json()    
    } catch (err) {
        throw `Error fetching traces for block ${blockNumber}: ${err}`
    }

    return (data.result || []) as ExternalTrace[]
}

export default getBlockTraces