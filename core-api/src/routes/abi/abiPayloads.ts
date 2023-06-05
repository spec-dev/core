import { ValidatedPayload, StringKeyMap } from '../../types'
import { supportedChainIds } from '../../../../shared'

export interface GetAbiPayload {
    chainId: string
    address: string
}

export function parseGetAbiPayload(data: StringKeyMap): ValidatedPayload<GetAbiPayload> {
    const id = data?.id
    if (!id) {
        return { isValid: false, error: '"id" required' }
    }
    
    const comps = id.split(':')
    if (comps.length !== 2) {
        return { isValid: false, error: '"id" must be in <chainId>:<address> format' }
    }

    const [chainId, address] = comps
    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    return {
        isValid: true,
        payload: { chainId, address: address.toLowerCase() },
    }
}
