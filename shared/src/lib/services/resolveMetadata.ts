import { StringKeyMap } from '../types'
import { metaProtocolIds, publicMetadataGatewaysForId } from '../utils/metadata'
import path from 'path'
import config from '../../lib/config'
import RaceFetch, { RaceFetchEntry } from './raceFetch'

export async function resolveMetadata(protocolId: string, pointer: string): Promise<StringKeyMap> {
    switch (protocolId) {
        case metaProtocolIds.IPFS:
            return raceFetchIpfsMetadata(pointer)
        default:
            return { error: `Invalid metadata protocol id: ${protocolId}` }
    }
}

async function raceFetchIpfsMetadata(pointer: string): Promise<StringKeyMap> {
    // Public IPFS gateway contestants.
    const publicIpfsGateways = publicMetadataGatewaysForId[metaProtocolIds.IPFS]
    const contestants: RaceFetchEntry[] = publicIpfsGateways.map((baseUrl) => ({
        url: path.join(baseUrl, pointer),
    }))

    // Add Pinata to the race if configured.
    if (config.PINATA_GATEWAY_ORIGIN && config.PINATA_GATEWAY_TOKEN) {
        contestants.push({
            url: path.join(config.PINATA_GATEWAY_ORIGIN, 'ipfs', pointer),
            headers: { 'x-pinata-gateway-token': config.PINATA_GATEWAY_TOKEN },
        })
    }

    // Run the race.
    let race = new RaceFetch(contestants, config.METADATA_RESOLUTION_TIMEOUT)
    const resp = await race.start()
    race = null

    return resp
}
