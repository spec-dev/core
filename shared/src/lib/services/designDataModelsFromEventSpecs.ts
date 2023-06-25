import { ContractEventSpec, ContractEventViewSpec, PublishLiveObjectVersionPayload } from '../types'
import { schemaForChainId } from '../utils/chainIds'
import { buildContractEventAsLiveObjectVersionPayload } from '../utils/liveObjects'
import { camelToSnake } from '../utils/formatters'
import { hash } from '../utils/hash'
import { MAX_TABLE_NAME_LENGTH } from '../utils/pgMeta'

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
    const viewName = createEventVersionViewName(eventSpec, nsp)
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

function createEventVersionViewName(eventSpec: ContractEventSpec, nsp: string): string {
    const { contractName, eventName, abiItem } = eventSpec
    const shortSig = abiItem.signature.slice(0, 10)
    const viewName = [nsp, contractName, eventName, shortSig].join('_').toLowerCase()
    return viewName.length >= MAX_TABLE_NAME_LENGTH
        ? [nsp, hash(viewName).slice(0, 10)].join('_').toLowerCase()
        : viewName
}
