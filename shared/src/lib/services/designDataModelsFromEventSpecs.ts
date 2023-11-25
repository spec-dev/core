import { ContractEventSpec, ContractEventViewSpec, PublishLiveObjectVersionPayload } from '../types'
import { buildContractEventAsLiveObjectVersionPayload } from '../utils/liveObjects'
import { camelToSnake, formatEventVersionViewNameFromEventSpec } from '../utils/formatters'

export function designDataModelsFromEventSpec(
    eventSpec: ContractEventSpec,
    nsp: string
): {
    lovSpec: PublishLiveObjectVersionPayload
    viewSpecs: ContractEventViewSpec[]
} {
    const eventParams = eventSpec.abiItem.inputs || []
    const viewName = formatEventVersionViewNameFromEventSpec(eventSpec, nsp)

    // Package what's needed to publish a live object version of this contract event.
    const lovSpec = buildContractEventAsLiveObjectVersionPayload(
        nsp,
        eventSpec.contractName,
        eventSpec.eventName,
        eventSpec.namespacedVersion,
        eventParams,
        viewName
    )

    const instances = eventSpec.contractInstances || []
    const addressesByChainId = {}
    for (const { chainId, address } of instances) {
        addressesByChainId[chainId] = addressesByChainId[chainId] || []
        addressesByChainId[chainId].push(address)
    }

    // Package what's needed to create a Postgres view of this contract event.
    const viewSpecCommon = {
        name: viewName,
        columnNames: lovSpec.properties.map((p) => camelToSnake(p.name)),
        numEventArgs: eventParams.length,
        contractName: eventSpec.contractName,
        namespace: eventSpec.namespace,
        eventName: eventSpec.eventName,
        eventSig: eventSpec.abiItem.signature,
    }

    const viewSpecs = []
    for (const [chainId, addresses] of Object.entries(addressesByChainId)) {
        viewSpecs.push({
            chainId,
            addresses,
            ...viewSpecCommon,
        })
    }

    return { lovSpec, viewSpecs }
}
