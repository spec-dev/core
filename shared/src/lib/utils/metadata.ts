export const metaProtocolIds = {
    IPFS: '1',
}

export const supportedMetaProtocolIds = new Set(Object.values(metaProtocolIds))

export const metaProtocols = {
    IPFS: 'ipfs://',
}

export const metaProtocolForId = {
    [metaProtocolIds.IPFS]: metaProtocols.IPFS,
}

export const parseMetaPointer = (val: string, protocolId?: string): string | null => {
    if (!val) return null
    if (protocolId) {
        const protocol = metaProtocolForId[protocolId]
        if (!protocol) return null
        if (val.startsWith(protocol)) {
            val = val.slice(protocol.length)
        }
    } else {
        for (const [id, protocol] of Object.entries(metaProtocolForId)) {
            if (val.startsWith(protocol)) {
                val = val.slice(protocol.length)
                protocolId = id
            }
        }
    }
    if (!protocolId) {
        protocolId = metaProtocolIds.IPFS
    }

    if (protocolId === metaProtocolIds.IPFS && val.startsWith('ipfs/')) {
        val = val.slice(5)
    }

    return val
}
