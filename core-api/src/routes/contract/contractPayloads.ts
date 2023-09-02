import { ValidatedPayload, StringKeyMap } from '../../types'
import { supportedChainIds, Abi, isValidContractGroup } from '../../../../shared'

interface CreateContractGroupPayload {
    chainIds: string[]
    nsp: string
    name: string
    abi: Abi
}

interface ContractGroupPayload {
    group: string
}

export interface ContractGroupsPayloadFilters {
    namespace?: string
}

interface ContractGroupsPayload {
    filters: ContractGroupsPayloadFilters
}

export function parseCreateContractGroupPayload(
    data: StringKeyMap
): ValidatedPayload<CreateContractGroupPayload> {
    const chainIds = data?.chainIds || []
    const nsp = data?.nsp
    const name = data?.name
    const abi = data?.abi

    if (!chainIds.length) {
        return { isValid: false, error: `"chainIds" missing or empty` }
    }

    const invalidChainIds = chainIds.filter((id) => !supportedChainIds.has(id))
    if (invalidChainIds.length) {
        return { isValid: false, error: `Invalid chain ids: ${invalidChainIds.join(', ')}` }
    }

    if (!nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    if (!name) {
        return { isValid: false, error: '"name" required' }
    }

    if (!abi) {
        return { isValid: false, error: '"abi" required' }
    }

    if (!Array.isArray(abi)) {
        return { isValid: false, error: 'Invalid "abi" -- Expecting array.' }
    }

    return {
        isValid: true,
        payload: {
            chainIds,
            nsp,
            name,
            abi: abi as Abi,
        },
    }
}

export function parseContractGroupPayload(
    data: StringKeyMap
): ValidatedPayload<ContractGroupPayload> {
    const group = data?.group

    if (!group) {
        return { isValid: false, error: '"group" required' }
    }

    if (!isValidContractGroup(group)) {
        return { isValid: false, error: 'Invalid "group" name' }
    }

    return {
        isValid: true,
        payload: {
            group,
        },
    }
}

export function parseContractGroupsPayload(data: StringKeyMap): ValidatedPayload<ContractGroupsPayload> {
    const filters = data?.filters || {}
    
    return {
        isValid: true,
        payload: { filters, },
    }
}
