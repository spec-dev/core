import { ValidatedPayload, StringKeyMap } from '../../types'
import { supportedChainIds, Abi, isValidContractGroup } from '../../../../shared'

interface CreateContractGroupPayload {
    nsp: string
    name: string
    isFactoryGroup: boolean
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
    const nsp = data?.nsp
    const name = data?.name
    const isFactoryGroup = !!data?.isFactoryGroup
    const abi = data?.abi

    if (!nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    if (!name) {
        return { isValid: false, error: '"name" required' }
    }

    if (!abi) {
        return { isValid: false, error: '"abi" required' }
    }

    const group = [nsp, name].join('.')
    if (!isValidContractGroup(group)) {
        return { isValid: false, error: `Malformed group name: ${group}` }
    }

    if (!Array.isArray(abi)) {
        return { isValid: false, error: 'Invalid "abi" -- Expecting array.' }
    }

    return {
        isValid: true,
        payload: {
            nsp,
            name,
            isFactoryGroup,
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
