import { ValidatedPayload, StringKeyMap, ContractRegistrationPayload } from '../../types'
import { supportedChainIds, isValidContractGroup } from '../../../../shared'

export function parseContractRegistrationPayload(
    data: StringKeyMap
): ValidatedPayload<ContractRegistrationPayload> {
    const nsp = data?.nsp
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

        const instances = group.instances || []
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

        groups.push({
            name,
            instances: uniqueInstances,
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
