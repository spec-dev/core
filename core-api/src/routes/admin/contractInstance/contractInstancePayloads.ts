import { ValidatedPayload, StringKeyMap, NewContractPayload } from '../../../types'
import { supportedChainIds } from '../../../../../shared'

export function parseNewContractInstancesPayload(data: StringKeyMap[]): ValidatedPayload<NewContractPayload[]> {
    data = data || []
    if (!data.length) {
        return { isValid: false, error: 'empty list of contracts given' }
    }

    const uniqueNsps = new Set()

    for (const contract of data) {
        if (!contract.nsp) {
            return { isValid: false, error: '"nsp" required for contract' }
        }
        uniqueNsps.add(contract.nsp)

        if (!contract.name) {
            return { isValid: false, error: '"name" required for contract' }
        }

        if (!contract.desc) {
            return { isValid: false, error: '"desc" required for contract' }
        }

        if (!contract.instances?.length) {
            return { isValid: false, error: '"instances" missing or empty for contract' }
        }

        for (const instance of contract.instances) {
            if (!instance.chainId || !supportedChainIds.has(instance.chainId)) {
                return { isValid: false, error: `invalid "chainId" for instance: ${instance.chainId}` }
            }

            if (!instance.address) {
                return { isValid: false, error: '"address" required for instance' }
            }

            if (!instance.name) {
                return { isValid: false, error: '"name" required for instance' }
            }
        }
    }
    
    if (uniqueNsps.size > 1) {
        return { isValid: false, error: 'Can only register multiple new contracts if they all share the same "nsp".' }
    }

    return { 
        isValid: true,
        payload: data as NewContractPayload[],
    }
}