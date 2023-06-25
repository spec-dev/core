import { ValidatedPayload, StringKeyMap } from '../../types'
import { supportedChainIds } from '../../../../shared'

export interface GetAbiPayload {
    chainId: string
    group: string
}

export function parseGetAbiPayload(data: StringKeyMap): ValidatedPayload<GetAbiPayload> {
    const chainId = data?.chainId
    const group = data?.group

    if (!group) {
        return { isValid: false, error: '"group" required' }
    }

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    return {
        isValid: true,
        payload: { chainId, group },
    }
}
