import {
    logger,
    StringKeyMap,
    NewContractInstancePayload,
    Abi,
    ContractInstance,
    AbiItemType,
    uniqueByKeys,
    CoreDB,
    upsertContractInstancesWithTx,
    designDataModelsFromEventSpec,
    upsertContractEventView,
    getAbis,
    upsertContractAndNamespace,
    upsertContractEvents,
    enqueueDelayedJob,
    setDecodeJobRangeCount,
    getContractInstancesInNamespace,
    AbiItem,
    getContractGroupAbi,
    saveContractGroupAbi,
    contractRegistrationJobFailed,
    unique,
    saveAbisMap,
    polishAbis,
    publishContractEventLiveObject,
    ContractEventSpec,
    schemaForChainId,
    toNamespacedVersion,
    fromNamespacedVersion,
    findStartBlocksForEvent,
    setEventStartBlocks,
    getBlockEventsSeriesNumber,
    getNamespace,
} from '../../../shared'
import { checkIfJobDone, findStartBlock } from './decodeContractInteractions'
import config from '../config'

const errors = {
    GENERAL: 'Error registering contracts.',
    ABI_RESOLUTION_FAILED: 'Failed to resolve contract ABIs.',
    NO_GROUP_ABI: 'No ABI exists for the contract group yet.',
    NO_NAMESPACE_FOUND: 'No namespace found for contract group.',
    LIVE_OBJECTS: 'Error creating Live Objects for contract events.',
    INTERNAL_ERROR: 'Internal error',
}

async function registerContractInstances(
    uid: string,
    nsp: string,
    name: string,
    instances: NewContractInstancePayload[],
    isFactoryGroup: boolean,
    abi?: Abi,
    abiChanged?: boolean,
) {
    const group = [nsp, name].join('.')
    logger.info(`[${group}]: Registering ${instances.length} contract instances...`)
    abiChanged && logger.info(`[${group}] ABI changed`)
    
    // Find all existing contract instances in this group.
    const existingContractInstances = await getContractInstancesInNamespace(group)
    if (existingContractInstances === null) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        return
    }
    const allInstances = uniqueByKeys([
        ...instances,
        ...existingContractInstances.map(({ address, chainId }) => ({ address, chainId })),
    ], ['chainId', 'address']) as NewContractInstancePayload[]

    const addressesByChainId = {}
    for (const { chainId, address } of allInstances) {
        addressesByChainId[chainId] = addressesByChainId[chainId] || []
        addressesByChainId[chainId].push(address)
    }

    // Resolve and merge ABIs for all contract instances in this group.
    const { groupAbi, error } = await resolveAbis(group, allInstances, addressesByChainId, abi)
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
        isFactoryGroup,
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

    // Get contract group namespace.
    const namespace = await getNamespace(group)
    if (!namespace) {
        await contractRegistrationJobFailed(uid, errors.NO_NAMESPACE_FOUND)
        return
    }

    // Upsert views and live object versions for each contract event.
    const eventNamespaceVersions = []
    for (const { lovSpec, viewSpecs } of dataModelSpecs) {
        eventNamespaceVersions.push(toNamespacedVersion(
            lovSpec.namespace,
            lovSpec.name,
            lovSpec.version,
        ))
        if (!(await publishContractEventLiveObject(namespace, lovSpec))) {
            await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
            return     
        }
        for (const viewSpec of viewSpecs) {
            if (!(await upsertContractEventView(viewSpec, true))) {
                await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
                return
            }
        }
    }

    // Update start blocks for each event.
    if (!(await findAndCacheStartBlocksForEvents(eventNamespaceVersions, addressesByChainId))) {
        await contractRegistrationJobFailed(uid, errors.INTERNAL_ERROR)
        return
    }
    const instancesToDecode = abiChanged ? allInstances : instances
    if (!instancesToDecode.length) {
        await checkIfJobDone(uid, group)
        return
    }

    // Get the start blocks for each instance to decode.
    const startBlocks = await Promise.all(instancesToDecode.map(({ chainId, address }) => (
        findStartBlock(schemaForChainId[chainId], [address])
    )))

    logger.info(`[${group}]: Will decode ${instancesToDecode.length} instances...`)
    
    const currentBlocks = {}
    for (let i = 0; i < instancesToDecode.length; i++) {
        const { chainId, address } = instancesToDecode[i]
        const decodeParams = {
            group,
            chainId,
            contractAddresses: [address],
            registrationJobUid: uid,
        }

        const startBlock = startBlocks[i]
        if (!startBlock && startBlock !== 0) {
            await enqueueDelayedJob('decodeContractInteractions', decodeParams)
            continue
        }

        const currentBlock = currentBlocks[chainId] || await getBlockEventsSeriesNumber(chainId)
        currentBlocks[chainId] = currentBlock

        let rangeSize = config.DECODE_RANGE_SIZE
        const maxRangeWithDefaultSize = config.MAX_DECODE_PARALLELIZATION * config.DECODE_RANGE_SIZE
        if (currentBlock - startBlock > maxRangeWithDefaultSize) {
            rangeSize = Math.ceil((currentBlock - startBlock) / config.MAX_DECODE_PARALLELIZATION)
        }

        const ranges = []
        let cursor = startBlock
        while (true) {
            let end = cursor + rangeSize - 1
            const isLastBatch = end > currentBlock
            ranges.push([cursor, isLastBatch ? null : end])
            cursor += rangeSize
            if (isLastBatch) break
        }

        const decodeJobKey = [uid, name, chainId, address, 'num-range-jobs'].join(':')
        await setDecodeJobRangeCount(decodeJobKey, ranges.length)

        let j = 0
        for (const [startBlock, endBlock] of ranges) {
            await enqueueDelayedJob('decodeContractInteractions', {
                ...decodeParams,
                startBlock,
                endBlock,
                cursorIndex: j,
            })
            j++
        }
    }
}

async function resolveAbis(
    group: string,
    instances: NewContractInstancePayload[],
    addressesByChainId: StringKeyMap,
    givenAbi?: Abi,
): Promise<StringKeyMap> {
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
        if (!instances.length) {
            abisMap['0x'] = givenAbi
        }
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
    isFactoryGroup: boolean,
    contractInstancePayloads: NewContractInstancePayload[],
    existingContractInstances: ContractInstance[],
    eventAbiItems: AbiItem[],
): Promise<ContractEventSpec[] | null> {
    let eventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert contract and namespace.
            let contract = existingContractInstances[0]?.contract
            if (!contract || contract.isFactoryGroup !== isFactoryGroup) {
                contract = await upsertContractAndNamespace(
                    tx,
                    group,
                    isFactoryGroup,
                )
            }

            // Upsert contract instances.
            const contractInstances = contractInstancePayloads.length ? await upsertContractInstances(
                contract.id, 
                contract.name,
                contractInstancePayloads, 
                tx,
            ) : []
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

async function findAndCacheStartBlocksForEvents(
    eventNamespaceVersions: string[], 
    addressesByChainId: StringKeyMap,
): Promise<boolean> {
    if (!eventNamespaceVersions.length || !Object.keys(addressesByChainId).length) return true
    const eventStartBlocks = {}
    for (const namespacedVersion of eventNamespaceVersions) {
        const { version } = fromNamespacedVersion(namespacedVersion)
        try {
            const startBlocks = await findStartBlocksForEvent(version, addressesByChainId)
            eventStartBlocks[namespacedVersion] = startBlocks
        } catch (err) {
            logger.error(`Failed to find/update start blocks for ${namespacedVersion}`)
            return false
        }
    }
    if (!(await setEventStartBlocks(eventStartBlocks))) {
        return false
    }
    return true
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
    const uid = params.uid
    const nsp = params.nsp
    const name = params.name
    const instances = params.instances || []
    const isFactoryGroup = params.isFactoryGroup
    const abi = params.abi
    const abiChanged = params.abiChanged

    return {
        perform: async () => {
            try {
                await registerContractInstances(
                    uid,
                    nsp,
                    name,
                    instances,
                    isFactoryGroup,
                    abi,
                    abiChanged,
                )    
            } catch (err) {
                logger.error(err)
                uid && await contractRegistrationJobFailed(uid, errors.GENERAL)
            }
        }
    }
}