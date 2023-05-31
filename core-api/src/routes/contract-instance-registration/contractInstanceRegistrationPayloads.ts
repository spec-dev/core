import { ValidatedPayload, StringKeyMap, NewContractsPayload } from '../../types'
import { supportedChainIds } from '../../../../shared/dist/main'

interface ContractInstanceRegistrationPayload {
    uid: string
}

export function parseContractInstanceRegistrationProgress(
    data: StringKeyMap
): ValidatedPayload<ContractInstanceRegistrationPayload> {

    const payload: ContractInstanceRegistrationPayload = {
        uid: data.uid
    }

    return {
        isValid: true,
        payload
    }
}
