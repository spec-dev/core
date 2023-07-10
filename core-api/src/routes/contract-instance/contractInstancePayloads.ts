import { ValidatedPayload, StringKeyMap, ContractRegistrationPayload } from '../../types'
import { supportedChainIds } from '../../../../shared'

export function parseContractRegistrationPayload(
    data: StringKeyMap
): ValidatedPayload<ContractRegistrationPayload> {
    const chainId = data?.chainId
    const nsp = data?.nsp
    const name = data?.name
    const desc = data?.desc || ''
    const abi = data?.abi
    const givenInstances = data?.instances || []

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (!nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    if (!name) {
        return { isValid: false, error: '"name" required' }
    }

    if (!givenInstances.length) {
        return { isValid: false, error: '"instances" missing or empty' }
    }

    const seenAddresses = new Set<string>()
    const instances = []
    for (const instance of givenInstances) {
        if (!instance.address) {
            return { isValid: false, error: '"address" required for all instances' }
        }

        instance.address = instance.address.toLowerCase()
        instance.name = instance.name || name

        // Ensure instances are unique by address.
        if (seenAddresses.has(instance.address)) continue
        seenAddresses.add(instance.address)
        instances.push(instance)
    }

    return {
        isValid: true,
        payload: {
            chainId,
            nsp,
            name,
            desc,
            instances,
            abi,
        },
    }
}
