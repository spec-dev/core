import { ContractEventSpec, ContractEventViewSpec, PublishLiveObjectVersionPayload } from '../types'
import { schemaForChainId } from '../utils/chainIds'
import { buildContractEventAsLiveObjectVersionPayload } from '../utils/liveObjects'
import { camelToSnake, formatEventVersionViewNameFromEventSpec } from '../utils/formatters'

export function designDataModelsFromEventSpec(
    eventSpec: ContractEventSpec,
    nsp: string,
    chainId: string
): {
    viewSpec: ContractEventViewSpec
    lovSpec: PublishLiveObjectVersionPayload
    chainId: string
} {
    const eventParams = eventSpec.abiItem.inputs || []
    const viewSchema = schemaForChainId[chainId]
    const viewName = formatEventVersionViewNameFromEventSpec(eventSpec, nsp)
    const viewPath = [viewSchema, viewName].join('.')

    // Package what's needed to publish a live object version of this contract event.
    const lovSpec = buildContractEventAsLiveObjectVersionPayload(
        nsp,
        eventSpec.contractName,
        eventSpec.eventName,
        eventSpec.namespacedVersion,
        chainId,
        eventParams,
        viewPath
    )

    // Package what's needed to create a Postgres view of this contract event.
    const viewSpec = {
        schema: viewSchema,
        name: viewName,
        columnNames: lovSpec.properties.map((p) => camelToSnake(p.name)),
        numEventArgs: eventParams.length,
        contractName: eventSpec.contractName,
        contractInstances: eventSpec.contractInstances,
        namespace: eventSpec.namespace,
        eventName: eventSpec.eventName,
        eventSig: eventSpec.abiItem.signature,
    }

    return { viewSpec, lovSpec, chainId }
}
