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
    getContractInstancesInGroup,
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
    chainId: string,
    nsp: string,
    contractName: string,
    contractDesc: string,
    instances: NewContractInstancePayload[],
    abi?: Abi,
    uid?: string,
) {
    // Unique-ify the instances by address.
    const seenAddresses = new Set<string>()
    const uniqueInstances = []
    for (const instance of instances) {
        instance.address = instance.address.toLowerCase()
        if (seenAddresses.has(instance.address)) continue
        seenAddresses.add(instance.address)
        uniqueInstances.push(instance)
    }

    const contractAddresses = Array.from(seenAddresses)
    logger.info(`[${chainId}:${nsp}.${contractName}]: Registering ${contractAddresses.length} contract instances: ${contractAddresses.join(', ')}`)
    
    // Create new registration job to track progress.
    try {
        uid = uid || uuid4()
        await createContractRegistrationJob(
            nsp,
            contractName,
            contractAddresses,
            chainId,
            uid,
        )
    } catch (err) {
        logger.error(err)
        return
    }

    // Get chain-specific contract nsp ("eth.contracts", "polygon.contracts", etc.)
    const chainSpecificContractNsp = contractNamespaceForChainId(chainId)
    if (!chainSpecificContractNsp) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        logger.error(`[${chainId}:${nsp}.${contractName}]: No contract namespace for chain id: ${chainId}`)
        return
    }

    // Ex: "eth.contracts.gitcoin.GovernorAlpha"
    const contractGroup = [nsp, contractName].join('.')
    const fullNsp = [chainSpecificContractNsp, contractGroup].join('.')

    // Find other existing contract instances in this group (contract-specific namespace).
    const existingContractInstances = await getContractInstancesInGroup(fullNsp)
    if (existingContractInstances === null) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        return
    }
    const allInstancePayloads = uniqueByKeys([
        ...instances,
        ...existingContractInstances.map(({ address, name, desc }) => ({ address, name, desc })),
    ], ['address']) as NewContractInstancePayload[]

    // Resolve and merge ABIs for all contract instances in this group.
    const { groupAbi, error } = await resolveAbis(chainId, contractGroup, allInstancePayloads, abi)
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
        chainId,
        fullNsp,
        contractName,
        contractDesc,
        instances,
        existingContractInstances,
        eventAbiItems, 
    )
    if (eventSpecs === null) {
        await contractRegistrationJobFailed(uid, errors.GENERAL)
        return
    }
    if (!eventSpecs.length) {
        logger.warn(`[${fullNsp}] No contract events to create live objects for.`)
    }

    // Package what's needed to turn these contract events into views and live objects.
    const dataModelSpecs = eventSpecs.map(eventSpec => (
        designDataModelsFromEventSpec(eventSpec, nsp, chainId)
    ))

    // Upsert views and live object versions for each contract event.
    for (const { viewSpec, lovSpec } of dataModelSpecs) {
        let success = await upsertContractEventView(viewSpec, chainId, true)
        success = success ? await publishContractEventLiveObject(viewSpec.namespace, lovSpec) : false
        if (!success) {
            await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
            return
        }
    }
    
    // Kick-off job to back-decode all contract interactions.
    // Enqueue jobs 1 contract at a time for database lookup reasons (may adjust in future).
    for (const contractAddress of contractAddresses) {
        await enqueueDelayedJob('decodeContractInteractions', {
            chainId, 
            registrationJobUid: uid,
            contractAddresses: [contractAddress],
        })
    }
}

async function resolveAbis(
    chainId: string,
    contractGroup: string,
    instances: NewContractInstancePayload[],
    givenAbi?: Abi,
): Promise<StringKeyMap> {
    const addresses = instances.map(i => i.address)
    const [crossGroupAbisMap, existingGroupAbi] = await Promise.all([
        getAbis(addresses, chainId),
        getContractGroupAbi(contractGroup, chainId)
    ])
    if (crossGroupAbisMap === null || existingGroupAbi === null) {
        return { error: errors.ABI_RESOLUTION_FAILED }
    }

    // If an ABI is given, assign it to all addresses.
    const abisMap = {}
    if (givenAbi) {
        givenAbi.forEach(item => {
            delete item.signature // delete to prevent spoofing during polishing.
        })
        addresses.forEach(address => {
            abisMap[address] = givenAbi
        })
    }
    // If no ABI is given and no group ABI exists yet, error out.
    else if (!existingGroupAbi.length) {
        return { error: errors.NO_GROUP_ABI }
    }
    // Assign current group abi to given addresses.
    else {
        addresses.forEach(address => {
            abisMap[address] = existingGroupAbi
        })
    }

    // Polish all ABIs (to add signatures).
    const [polishedAbisMap, _] = polishAbis(abisMap)
    const [polishedCrossGroupAbisMap, __] = polishAbis(crossGroupAbisMap)

    const crossGroupAbiSignatures = {}
    const crossGroupAddresses = unique([...addresses, ...Object.keys(polishedCrossGroupAbisMap)])
    for (const address of crossGroupAddresses) {
        const itemsBySig = {}
        const items = polishedCrossGroupAbisMap[address] || []
        items.forEach(item => {
            itemsBySig[item.signature] = item
        })
        crossGroupAbiSignatures[address] = itemsBySig
    }

    // Merge ABI items for the group.
    const mergedAbiItemsBySignature = {}
    existingGroupAbi.forEach(item => {
        mergedAbiItemsBySignature[item.signature] = item
    })
    for (const address in polishedAbisMap) {
        for (const item of polishedAbisMap[address]) {
            if (!mergedAbiItemsBySignature.hasOwnProperty(item.signature)) {
                mergedAbiItemsBySignature[item.signature] = item
            }
        }
    }

    // Apply the new group items to each individual cross-group ABI.
    for (const signature in mergedAbiItemsBySignature) {
        const item = mergedAbiItemsBySignature[signature]
        for (const address in crossGroupAbiSignatures) {
            if (!crossGroupAbiSignatures[address].hasOwnProperty(signature)) {
                crossGroupAbiSignatures[address][signature] = item
            }
        }
    }
    const newCrossGroupAbisMap = {}
    for (const address in crossGroupAbiSignatures) {
        newCrossGroupAbisMap[address] = Object.values(crossGroupAbiSignatures[address])
    }

    // Flatten back to list of items (classic ABI type structure).
    const newGroupAbi = Object.values(mergedAbiItemsBySignature) as Abi

    // Save ABIs for the individual addresses (cross group) as well as the new group ABI.
    await Promise.all([
        saveAbisMap(newCrossGroupAbisMap, chainId),
        saveContractGroupAbi(contractGroup, newGroupAbi, chainId)
    ])

    return { groupAbi: newGroupAbi }
}

async function saveDataModels(
    chainId: string,
    fullNsp: string,
    contractName: string,
    contractDesc: string,
    contractInstancePayloads: NewContractInstancePayload[],
    existingContractInstances: ContractInstance[],
    eventAbiItems: AbiItem[],
): Promise<ContractEventSpec[] | null> {
    let eventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert contract and namespace.
            const contract = existingContractInstances[0]?.contract || await upsertContractAndNamespace(
                fullNsp,
                contractName,
                contractDesc,
                chainId,
                tx,
            )

            // Upsert contract instances.
            const contractInstances = await upsertContractInstances(contract.id, contractInstancePayloads, chainId, tx)
            const allGroupContractInstances = uniqueByKeys([
                ...contractInstances,
                ...existingContractInstances,
            ], ['address']) as ContractInstance[]

            // Upsert events with versions for each event abi item.
            eventSpecs = await upsertContractEvents(contract, allGroupContractInstances, eventAbiItems, chainId, tx)
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${fullNsp}: ${err}`
        )
        return null
    }
    return eventSpecs
}

async function upsertContractInstances(
    contractId: number,
    contractInstancePayloads: NewContractInstancePayload[],
    chainId: string,
    tx: any,
): Promise<ContractInstance[]> {
    const contractInstancesData = contractInstancePayloads.map(instance => ({
        chainId,
        address: instance.address,
        name: instance.name,
        desc: instance.desc,
        contractId,
    }))
    return await upsertContractInstancesWithTx(contractInstancesData, tx)
}

export default function job(params: StringKeyMap) {
    const chainId = params.chainId
    const nsp = params.nsp
    const contractName = params.name
    const contractDesc = params.desc || ''
    const instances = params.instances || []
    const abi = params.abi
    const uid = params.uid

    return {
        perform: async () => {
            try {
                await registerContractInstances(
                    chainId, 
                    nsp, 
                    contractName,
                    contractDesc,
                    instances,
                    abi,
                    uid,
                )    
            } catch (err) {
                logger.error(err)
                uid && await contractRegistrationJobFailed(uid, errors.GENERAL)
            }
        }
    }
}