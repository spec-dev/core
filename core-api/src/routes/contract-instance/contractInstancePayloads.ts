import { ValidatedPayload, StringKeyMap, ContractRegistrationPayload, NewContractInstancePayload } from '../../types'
import { supportedChainIds, isValidContractGroup } from '../../../../shared'

interface AddContractsPayload {
    nsp: string
    name: string
    instances: NewContractInstancePayload[]
}

export function parseAddContractsPayload(
    data: StringKeyMap
): ValidatedPayload<AddContractsPayload> {
    const nsp = data?.nsp
    if (!nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    const name = data?.name
    if (!name) {
        return { isValid: false, error: '"name" required' }
    }

    const group = [nsp, name].join('.')
    if (!isValidContractGroup(group)) {
        return { isValid: false, error: `Malformed group name: ${group}` }
    }

    const instances = data?.instances || []
    const seenChainAddresses = new Set<string>()
    const uniqueInstances = []
    for (const instance of instances) {
        const address = instance.address?.toLowerCase()
        const chainId = instance.chainId?.toString()

        if (!address) {
            return { isValid: false, error: '"address" required for all instances' }
        }
        if (!supportedChainIds.has(chainId)) {
            return { isValid: false, error: `Invalid "chainId": ${chainId}` }
        }    

        // Ensure instances are unique by address.
        const key = [instance.address, instance.chainId].join(':')
        if (seenChainAddresses.has(key)) continue
        seenChainAddresses.add(key)
        uniqueInstances.push({ address, chainId })
    }
    if (!uniqueInstances.length) {
        return { isValid: false, error: 'No valid contract instances given' }
    }

    return {
        isValid: true,
        payload: {
            nsp,
            name,
            instances,
        },
    }
}

export function parseContractRegistrationPayload(
    data: StringKeyMap
): ValidatedPayload<ContractRegistrationPayload> {
    const nsp = data?.nsp || data?.namespace
    if (!nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    const groups = data?.groups || []
    const finalGroups = []
    for (const group of groups) {
        const name = group.name
        if (!name) {
            return { isValid: false, error: '"name" required' }
        }
        const fullGroupName = [nsp, name].join('.')
        if (!isValidContractGroup(fullGroupName)) {
            return { isValid: false, error: `Malformed group name: ${fullGroupName}` }
        }

        const instances = group.contracts || group.instances || []
        const seenChainAddresses = new Set<string>()
        const uniqueInstances = []
        for (const instance of instances) {
            const address = instance.address?.toLowerCase()
            const chainId = instance.chainId?.toString()

            if (!address) {
                return { isValid: false, error: '"address" required for all instances' }
            }
            if (!supportedChainIds.has(chainId)) {
                return { isValid: false, error: `Invalid "chainId": ${chainId}` }
            }    

            // Ensure instances are unique by address.
            const key = [instance.address, instance.chainId].join(':')
            if (seenChainAddresses.has(key)) continue
            seenChainAddresses.add(key)
            uniqueInstances.push({ address, chainId })
        }
        if (group.abi && !Array.isArray(group.abi)) {
            return { isValid: false, error: 'Invalid "abi" -- Expecting array.' }
        }

        finalGroups.push({
            name,
            instances: uniqueInstances,
            isFactoryGroup: group.isFactoryGroup,
            abi: group.abi,
        })
    }
    if (!finalGroups.length) {
        return { isValid: false, error: `No valid groups to register` }
    }

    return {
        isValid: true,
        payload: {
            nsp,
            groups: finalGroups
        },
    }
}

