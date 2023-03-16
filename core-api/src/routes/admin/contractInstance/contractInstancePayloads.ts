import { ValidatedPayload, StringKeyMap, NewContractsPayload } from '../../../types'
import { supportedChainIds } from '../../../../../shared'

export function parseNewContractInstancesPayload(
    data: StringKeyMap
): ValidatedPayload<NewContractsPayload> {
    const nsp = data?.nsp
    const chainId = data?.chainId
    const contracts = data?.contracts || []
    const refetchAbis = data?.refetchAbis || false

    if (!data.nsp) {
        return { isValid: false, error: '"nsp" required' }
    }

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (!contracts.length) {
        return { isValid: false, error: '"contracts" was missing or empty' }
    }

    for (const contract of contracts) {
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
            if (!instance.address) {
                return { isValid: false, error: '"address" required for instance' }
            }

            if (!instance.name) {
                return { isValid: false, error: '"name" required for instance' }
            }
        }
    }

    return {
        isValid: true,
        payload: {
            nsp,
            chainId,
            contracts,
            refetchAbis,
        },
    }
}
