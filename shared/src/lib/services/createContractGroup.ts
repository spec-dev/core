import logger from '../logger'
import { Abi, AbiItem, AbiItemType } from '../abi/types'
import { getNamespaces } from '../core/db/services/namespaceServices'
import { contractNamespaceForChainId } from '../utils/chainIds'
import { polishAbis } from '../utils/formatters'
import { CoreDB } from '../core/db/dataSource'
import { ContractEventSpec } from '../types'
import {
    upsertContractAndNamespace,
    upsertContractEvents,
    upsertContractEventView,
    publishContractEventLiveObject,
} from './contractEventServices'
import { designDataModelsFromEventSpec } from './designDataModelsFromEventSpecs'

/**
 * Create a new, empty contract group for a set of chain ids.
 */
export async function createContractGroup(nsp: string, name: string, chainIds: string[], abi: Abi) {
    const group = [nsp, name].join('.')
    if (group.split('.').length !== 2) throw `Invalid contract group: ${group}`

    // Get chain-specific contract nsps ("eth.contracts", "polygon.contracts", etc.)
    const chainSpecificContractNsps = chainIds
        .map((chainId) => contractNamespaceForChainId(chainId))
        .filter((v) => !!v)
    if (chainSpecificContractNsps.length !== chainIds.length) {
        throw `Contract namespaces missing for one or more chain ids`
    }

    // Build full namespaces.
    const fullNsps = chainSpecificContractNsps.map((contractNspPrefix) =>
        [contractNspPrefix, group].join('.')
    )

    // Ensure namespaces don't already exist.
    const namespaces = await getNamespaces(fullNsps)
    if (namespaces === null) throw `Internal error`
    if (namespaces.length) throw `Contract group already exists`

    // Polish group abi.
    const fakeAddress = '0x'
    const [polishedAbisMap, _] = polishAbis({ [fakeAddress]: abi })
    const polishedAbi = polishedAbisMap[fakeAddress] || []
    if (!polishedAbi.length) throw 'Invalid ABI'

    // Get all ABI event items with fully-named params.
    const eventAbiItems = polishedAbi.filter(
        (item) =>
            item.type === AbiItemType.Event &&
            !!item.name &&
            !!item.inputs?.every((input) => !!input.name)
    )

    // Upsert namespaces, contracts, events, and event versions.
    const eventSpecs = await saveDataModels(chainIds, fullNsps, name, eventAbiItems)
    if (!eventSpecs.length) {
        logger.warn(`[${group}] No contract events to create live objects for.`)
        return
    }

    // Package what's needed to turn these contract events into views and live objects.
    const dataModelSpecs = eventSpecs.map((eventSpec) =>
        designDataModelsFromEventSpec(eventSpec, nsp, eventSpec.chainId)
    )

    // Upsert views and live object versions for each contract event.
    for (const { viewSpec, lovSpec, chainId } of dataModelSpecs) {
        if (!(await upsertContractEventView(viewSpec, chainId, true))) {
            throw 'Internal error'
        }
        if (!(await publishContractEventLiveObject(viewSpec.namespace, lovSpec))) {
            throw 'Error publishing contract event live object'
        }
    }
}

async function saveDataModels(
    chainIds: string[],
    fullNsps: string[],
    contractName: string,
    eventAbiItems: AbiItem[]
): Promise<ContractEventSpec[]> {
    let allEventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            for (let i = 0; i < chainIds.length; i++) {
                const chainId = chainIds[i]
                const fullNsp = fullNsps[i]

                // Upsert contract and namespace.
                const contract = await upsertContractAndNamespace(
                    fullNsp,
                    contractName,
                    '',
                    chainId,
                    tx
                )

                // Upsert events with versions for each event abi item.
                const eventSpecs = await upsertContractEvents(
                    contract,
                    [],
                    eventAbiItems,
                    chainId,
                    tx
                )
                allEventSpecs.push(...eventSpecs)
            }
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${fullNsps.join(
                ', '
            )}: ${err}`
        )
        throw 'Internal error'
    }
    return allEventSpecs
}
