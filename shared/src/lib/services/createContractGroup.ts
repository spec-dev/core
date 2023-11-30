import logger from '../logger'
import { Abi, AbiItem, AbiItemType } from '../abi/types'
import { getNamespace } from '../core/db/services/namespaceServices'
import { polishAbis } from '../utils/formatters'
import { CoreDB } from '../core/db/dataSource'
import { ContractEventSpec, StringKeyMap } from '../types'
import {
    upsertContractAndNamespace,
    upsertContractEvents,
    upsertContractEventView,
    publishContractEventLiveObject,
} from './contractEventServices'
import { designDataModelsFromEventSpec } from './designDataModelsFromEventSpecs'
import { saveContractGroupAbi } from '../abi/redis'

/**
 * Create a new, empty contract group for a set of chain ids.
 */
export async function createContractGroup(
    nsp: string,
    name: string,
    abi: Abi,
    isFactoryGroup: boolean = false,
    saveGroupAbi: boolean = true
): Promise<StringKeyMap> {
    const group = [nsp, name].join('.')
    if (group.split('.').length !== 2) throw `Invalid contract group: ${group}`

    // Ensure namespace doesn't already exist.
    let namespace = await getNamespace(group)
    if (namespace) {
        return { exists: true }
    }

    // Polish ABI and save it for the group.
    const fakeAddress = '0x'
    const [polishedAbisMap, _] = polishAbis({ [fakeAddress]: abi })
    const polishedAbi = polishedAbisMap[fakeAddress] || []
    if (!polishedAbi.length) throw 'Invalid ABI'
    if (saveGroupAbi && !(await saveContractGroupAbi(group, polishedAbi))) {
        throw 'Failed to save ABI'
    }

    // Get all ABI event items with fully-named params.
    const eventAbiItems = polishedAbi.filter(
        (item) =>
            item.type === AbiItemType.Event &&
            !!item.name &&
            !!item.inputs?.every((input) => !!input.name)
    )

    // Upsert namespaces, contracts, events, and event versions.
    const eventSpecs = await saveDataModels(group, isFactoryGroup, eventAbiItems)
    if (!eventSpecs.length) {
        logger.warn(`[${group}] No contract events to create live objects for.`)
        return {}
    }

    namespace = await getNamespace(group)
    if (!namespace) throw `Failed to find newly created namespace: ${group}`

    // Package what's needed to turn these contract events into views and live objects.
    const dataModelSpecs = eventSpecs.map((eventSpec) =>
        designDataModelsFromEventSpec(eventSpec, nsp, true)
    )

    // Upsert views and live object versions for each contract event.
    for (const { lovSpec, viewSpecs } of dataModelSpecs) {
        if (!(await publishContractEventLiveObject(namespace, lovSpec))) {
            throw 'Error publishing contract event live object'
        }
        for (const viewSpec of viewSpecs) {
            if (!(await upsertContractEventView(viewSpec, true))) {
                throw 'Internal error'
            }
        }
    }

    return {}
}

async function saveDataModels(
    group: string,
    isFactoryGroup: boolean,
    eventAbiItems: AbiItem[]
): Promise<ContractEventSpec[]> {
    let allEventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert contract and namespace.
            const contract = await upsertContractAndNamespace(tx, group, isFactoryGroup)
            // Upsert events with versions for each event abi item.
            const eventSpecs = await upsertContractEvents(contract, [], eventAbiItems, tx)
            allEventSpecs.push(...eventSpecs)
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${group}: ${err}`
        )
        throw 'Internal error'
    }
    return allEventSpecs
}
