import {
    logger,
    StringKeyMap,
    NewContractInstancePayload,
    Abi,
    ContractInstance,
    AbiItemType,
    uniqueByKeys,
    CoreDB,
    contractNamespaceForChainId,
    upsertContractInstancesWithTx,
    designDataModelsFromEventSpec,
    upsertContractEventView,
    getAbis,
    upsertContractAndNamespace,
    upsertContractEvents,
    enqueueDelayedJob,
    getContractInstancesInNamespace,
    createContractRegistrationJob,
    AbiItem,
    getContractGroupAbi,
    saveContractGroupAbi,
    contractRegistrationJobFailed,
    unique,
    saveAbisMap,
    polishAbis,
    publishContractEventLiveObject,
    ContractEventSpec,
} from '../../../shared'
import uuid4 from 'uuid4'

const errors = {
    GENERAL: 'Error registering contracts.',
    ABI_RESOLUTION_FAILED: 'Failed to resolve contract ABIs.',
    NO_GROUP_ABI: 'No ABI exists for the contract group yet.',
    LIVE_OBJECTS: 'Error creating Live Objects for contract events.'
}

async function registerContractInstances(
    nsp: string,
    groupIndex: number,
    uid: string,
    name: string,
    instances: NewContractInstancePayload[],
    abi?: Abi,
) {
    const group = [nsp, name].join('.')
    logger.info(`[${group}]: Adding ${instances.length} contract instances...`)
    
    // Find all existing contract instances in this group.
    const existingContractInstances = await getContractInstancesInNamespace(group)
    if (existingContractInstances === null) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        return
    }
    const allInstances = uniqueByKeys([
        ...instances,
        ...existingContractInstances.map(({ address, chainId }) => ({ address, chainId })),
    ], ['address', 'chainId']) as NewContractInstancePayload[]

    // Resolve and merge ABIs for all contract instances in this group.
    const { groupAbi, error } = await resolveAbis(group, allInstances, abi)
    if (error) {
        await contractRegistrationJobFailed(uid, error)
        return
    }

    // Get all ABI event items with fully-named params.
    const eventAbiItems = groupAbi.filter(item => (
        item.type === AbiItemType.Event &&
        !!item.name &&
        !!(item.inputs?.every(input => !!input.name))
    ))

    // Upsert namespace, contract, contract instances, events, and event versions.
    const eventSpecs = await saveDataModels(
        group,
        instances,
        existingContractInstances,
        eventAbiItems, 
    )
    if (eventSpecs === null) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        return
    }
    if (!eventSpecs.length) {
        logger.warn(`[${group}] No contract events to create live objects for.`)
    }

    // Package what's needed to turn these contract events into views and live objects.
    const dataModelSpecs = eventSpecs.map(eventSpec => (
        designDataModelsFromEventSpec(eventSpec, nsp)
    ))

    // Upsert views and live object versions for each contract event.
    for (const { lovSpec, viewSpecs } of dataModelSpecs) {
        for (const viewSpec of viewSpecs) {
            if (!(await upsertContractEventView(viewSpec, true))) {
                await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
                return     
            }
        }
        if (!(await publishContractEventLiveObject(viewSpecs[0].namespace, lovSpec))) {
            await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
            return     
        }
    }

    /*
    TODO:
    -----
    Find and cache some structure that holds:
        - the earliest start block for this group (for each chain)
        - the earliest start block for each event for each chain
    This is the same structure that will be fetched in pre-flight when backfilling an event table.
    
    For the below logic, split each address into X number of parallel sub-jobs to speed up decoding.
    */
    
    // Kick off job to back-decode all contract interactions.
    // Enqueue jobs 1 contract at a time for database lookup reasons (may adjust in future).
    for (const { chainId, address } of instances) {
        await enqueueDelayedJob('decodeContractInteractions', {
            group,
            chainId,
            contractAddresses: [address],
            registrationJobUid: uid,
            groupIndex,
        })
    }
}

async function resolveAbis(
    group: string,
    instances: NewContractInstancePayload[],
    givenAbi?: Abi,
): Promise<StringKeyMap> {
    const addressesByChainId = {}
    for (const { chainId, address } of instances) {
        addressesByChainId[chainId] = addressesByChainId[chainId] || []
        addressesByChainId[chainId].push(address)
    }

    let crossGroupAbisMap = {}
    for (const [chainId, addresses] of Object.entries(addressesByChainId)) {
        const chainGroupAbis = await getAbis(addresses as string[], chainId)
        if (chainGroupAbis === null) {
            return { error: errors.ABI_RESOLUTION_FAILED }
        }
        for (const address in chainGroupAbis) {
            const abi = chainGroupAbis[address]
            const key = [chainId, address].join(':')
            crossGroupAbisMap[key] = abi
        }
    }

    let existingGroupAbi = await getContractGroupAbi(group)
    if (existingGroupAbi === null) {
        return { error: errors.ABI_RESOLUTION_FAILED }
    }

    // If an ABI is given, assign it to all addresses.
    const abisMap = {}
    if (givenAbi) {
        givenAbi.forEach(item => {
            delete item.signature // delete to prevent spoofing during polishing.
        })
        instances.forEach(({ chainId, address }) => {
            const key = [chainId, address].join(':')
            abisMap[key] = givenAbi
        })
    }
    // Error out if no ABI is given and no group ABI exists yet.
    else if (!existingGroupAbi.length) {
        return { error: errors.NO_GROUP_ABI }
    }
    // Assign current group abi to given addresses.
    else {
        instances.forEach(({ chainId, address }) => {
            const key = [chainId, address].join(':')
            abisMap[key] = existingGroupAbi
        })
    }

    // Polish all ABIs (to add signatures).
    const [polishedAbisMap, _] = polishAbis(abisMap)
    const [polishedCrossGroupAbisMap, __] = polishAbis(crossGroupAbisMap)

    const crossGroupAbiSignatures = {}
    const crossGroupKeys = unique([
        ...instances.map(i => [i.chainId, i.address].join(':')), 
        ...Object.keys(polishedCrossGroupAbisMap)
    ])
    for (const key of crossGroupKeys) {
        const itemsBySig = {}
        const items = polishedCrossGroupAbisMap[key] || []
        items.forEach(item => {
            itemsBySig[item.signature] = item
        })
        crossGroupAbiSignatures[key] = itemsBySig
    }

    // Merge ABI items for the group.
    const mergedAbiItemsBySignature = {}
    existingGroupAbi.forEach(item => {
        mergedAbiItemsBySignature[item.signature] = item
    })
    for (const key in polishedAbisMap) {
        for (const item of polishedAbisMap[key]) {
            if (!mergedAbiItemsBySignature.hasOwnProperty(item.signature)) {
                mergedAbiItemsBySignature[item.signature] = item
            }
        }
    }

    // Apply the new group items to each individual cross-group ABI.
    for (const signature in mergedAbiItemsBySignature) {
        const item = mergedAbiItemsBySignature[signature]
        for (const key in crossGroupAbiSignatures) {
            if (!crossGroupAbiSignatures[key].hasOwnProperty(signature)) {
                crossGroupAbiSignatures[key][signature] = item
            }
        }
    }

    // Flatten back to list of items (classic ABI type structure).
    const newGroupAbi = Object.values(mergedAbiItemsBySignature) as Abi
    await saveContractGroupAbi(group, newGroupAbi)

    const newCrossGroupAbisMap = {}
    for (const key in crossGroupAbiSignatures) {
        const [chainId, address] = key.split(':')
        newCrossGroupAbisMap[chainId] = newCrossGroupAbisMap[chainId] || {}
        newCrossGroupAbisMap[chainId][address] = Object.values(crossGroupAbiSignatures[key])
    }
    for (const [chainId, chainAbisMap] of Object.entries(newCrossGroupAbisMap)) {
        await saveAbisMap(chainAbisMap, chainId)
    }

    return { groupAbi: newGroupAbi }
}

async function saveDataModels(
    group: string,
    contractInstancePayloads: NewContractInstancePayload[],
    existingContractInstances: ContractInstance[],
    eventAbiItems: AbiItem[],
): Promise<ContractEventSpec[] | null> {
    let eventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert contract and namespace.
            const contract = existingContractInstances[0]?.contract || await upsertContractAndNamespace(
                group,
                tx,
            )

            // Upsert contract instances.
            const contractInstances = await upsertContractInstances(
                contract.id, 
                contract.name,
                contractInstancePayloads, 
                tx,
            )
            const allGroupContractInstances = uniqueByKeys([
                ...contractInstances,
                ...existingContractInstances,
            ], ['chainId', 'address']) as ContractInstance[]

            // Upsert events with versions for each event abi item.
            eventSpecs = await upsertContractEvents(
                contract, 
                allGroupContractInstances, 
                eventAbiItems, 
                tx,
            )
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${group}: ${err}`
        )
        return null
    }
    return eventSpecs
}

async function upsertContractInstances(
    contractId: number,
    contractName: string,
    contractInstancePayloads: NewContractInstancePayload[],
    tx: any,
): Promise<ContractInstance[]> {
    const contractInstancesData = contractInstancePayloads.map(instance => ({
        chainId: instance.chainId,
        address: instance.address,
        name: contractName,
        desc: '',
        contractId,
    }))
    return await upsertContractInstancesWithTx(contractInstancesData, tx)
}

export default function job(params: StringKeyMap) {
    const nsp = params.nsp
    const groupIndex = params.groupIndex
    const uid = params.uid
    const name = params.name
    const instances = params.instances || []
    const abi = params.abi

    return {
        perform: async () => {
            try {
                await registerContractInstances(
                    nsp,
                    groupIndex,
                    uid,
                    name,
                    instances,
                    abi,
                )    
            } catch (err) {
                logger.error(err)
                uid && await contractRegistrationJobFailed(uid, errors.GENERAL)
            }
        }
    }
}