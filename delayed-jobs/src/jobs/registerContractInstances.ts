import {
    logger,
    StringKeyMap,
    NewContractInstancePayload,
    Abi,
    ContractInstance,
    Contract,
    Namespace,
    AbiItemType,
    uniqueByKeys,
    CoreDB,
    contractNamespaceForChainId,
    hash,
    upsertNamespaceWithTx,
    upsertContractWithTx,
    upsertContractInstancesWithTx,
    upsertEventsWithTx,
    upsertEventVersionsWithTx,
    toNamespacedVersion,
    schemaForChainId,
    MAX_TABLE_NAME_LENGTH,
    buildContractEventAsLiveObjectVersionPayload,
    PublishLiveObjectVersionPayload,
    camelToSnake,
    specGithubRepoUrl,
    SharedTables,
    CHAIN_ID_COL,
    CONTRACT_NAME_COL,
    CONTRACT_ADDRESS_COL,
    namespaceForChainId,
    getAbis,
    enqueueDelayedJob,
    getContractInstancesInGroup,
    createContractRegistrationJob,
    AbiItem,
    getContractGroupAbi,
    saveContractGroupAbi,
    contractRegistrationJobFailed,
    unique,
} from '../../../shared'
import { EventViewSpec, EventSpec } from '../types'
import { publishLiveObjectVersion } from './publishLiveObjectVersion'
import { ident, literal } from 'pg-format'
import { 
    fetchAbis, 
    providers, 
    polishAbis,
    saveAbisMap,
} from './upsertAbis'
import uuid4 from 'uuid4'

const errors = {
    GENERAL: 'Error registering contracts',
    ABIS: 'Failed to resolve contract ABIs',
    LIVE_OBJECTS: 'Error creating Live Objects for contract events'
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
    const groupAbi = await resolveAbis(chainId, contractGroup, allInstancePayloads, abi)
    if (groupAbi === null) {
        await contractRegistrationJobFailed(uid, errors.ABIS)
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
        let success = await upsertView(viewSpec, chainId)
        success = success ? await publishContractEventLiveObject(viewSpec.namespace, lovSpec) : false
        if (!success) {
            await contractRegistrationJobFailed(uid, errors.LIVE_OBJECTS)
            return
        }
    }
    
    // Kick-off job to back-decode all contract interactions.
    // Enqueue jobs for individual contracts for database lookup speed reasons.
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
): Promise<Abi | null> {
    const addresses = instances.map(i => i.address)
    const [crossGroupAbisMap, existingGroupAbi] = await Promise.all([
        getAbis(addresses, chainId),
        getContractGroupAbi(contractGroup, chainId)
    ])
    if (crossGroupAbisMap === null || existingGroupAbi === null) {
        return null
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
    } else {
        // Fetch ABIs from <ether>scan.
        logger.info(`Fetching ABIs for ${addresses.join(', ')}...`)
        const abisMap = await fetchAbis(addresses, providers.STARSCAN, chainId)

        // Ensure an ABI was found for each address.
        const unverifiedAbiAddresses = addresses.filter(a => !abisMap.hasOwnProperty(a))
        if (unverifiedAbiAddresses.length) {
            logger.error(`ABIs not verified for contracts: ${unverifiedAbiAddresses.join(', ')}`)
            return null
        }
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

    return newGroupAbi
}

async function saveDataModels(
    chainId: string,
    fullNsp: string,
    contractName: string,
    contractDesc: string,
    contractInstancePayloads: NewContractInstancePayload[],
    existingContractInstances: ContractInstance[],
    eventAbiItems: AbiItem[],
): Promise<EventSpec[] | null> {
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
            eventSpecs = await upsertEvents(contract, allGroupContractInstances, eventAbiItems, tx)
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${fullNsp}: ${err}`
        )
        return null
    }
    return eventSpecs
}

function designDataModelsFromEventSpec(
    eventSpec: EventSpec,
    nsp: string,
    chainId: string,
):{
    viewSpec: EventViewSpec,
    lovSpec: PublishLiveObjectVersionPayload,
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
        viewPath,
    )

    // Package what's needed to create a Postgres view of this contract event.
    const viewSpec = {
        schema: viewSchema,
        name: viewName,
        columnNames: lovSpec.properties.map(p => camelToSnake(p.name)),
        numEventArgs: eventParams.length,
        contractInstances: eventSpec.contractInstances,
        namespace: eventSpec.namespace,
        eventName: eventSpec.eventName,
        eventSig: eventSpec.abiItem.signature,
    }
    
    return { viewSpec, lovSpec }
}

function createEventVersionViewName(eventSpec: EventSpec, nsp: string): string {
    const { contractName, eventName, abiItem } = eventSpec
    const shortSig = abiItem.signature.slice(0, 10)
    const viewName = [nsp, contractName, eventName, shortSig].join('_').toLowerCase()
    return viewName.length >= MAX_TABLE_NAME_LENGTH
        ? [nsp, hash(viewName).slice(0, 10)].join('_').toLowerCase()
        : viewName
}

async function upsertView(viewSpec: EventViewSpec, chainId: string): Promise<boolean> {
    const {
        schema,
        name,
        columnNames,
        numEventArgs,
        contractInstances,
        eventSig,
    } = viewSpec

    logger.info(`Upserting view ${schema}.${name}`)

    const contractNameOptions = [
        ...contractInstances.map(ci => (
            `when address = ${literal(ci.address)} then ${literal(ci.name)}`
        )),
        `else 'unknown'`
    ].map(l => `        ${l}`).join('\n')

    const selectLines = []
    for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i]
        const isEventArgColumn = i < numEventArgs
        let line = columnName

        if (isEventArgColumn) {
            line = `event_args -> ${i} -> 'value' as ${ident(columnName)}`
        }
        else if (columnName === CONTRACT_NAME_COL) {
            line = `case\n${contractNameOptions}\n    end ${ident(columnName)}`
        }
        else if (columnName === CHAIN_ID_COL) {
            line = `unnest(array[${literal(chainId)}]) as ${ident(columnName)}`
        }
        else if (columnName === CONTRACT_ADDRESS_COL) {
            line = `address as ${ident(columnName)}`
        }
        if (i < columnNames.length - 1) {
            line += ','
        }
        selectLines.push(line)
    }

    const select = selectLines.map(l => `    ${l}`).join('\n')
    const addresses = contractInstances.map(ci => ci.address)
    const upsertViewSql = 
`create or replace view ${ident(schema)}.${ident(name)} as 
select
${select} 
from ${ident(schema)}."logs" 
where "topic0" = ${literal(eventSig)}
and "address" in (${addresses.map(a => literal(a)).join(', ')})`

    try {
        await SharedTables.query(upsertViewSql)
    } catch (err) {
        logger.error(`Error upserting view ${schema}.${name}: ${err}`)
        return false
    }

    return true
}

async function publishContractEventLiveObject(
    namespace: Namespace, 
    payload: PublishLiveObjectVersionPayload,
): Promise<boolean> {
    try {
        const liveObjectId = null // just let the live object queries happen in the other service.
        await publishLiveObjectVersion(namespace, liveObjectId, payload, true)
    } catch (err) {
        logger.error(`Failed to publish live object version ${payload.additionalEventAssociations[0]}.`)
        return false
    }

    return true
}

async function upsertContractAndNamespace(
    fullNsp: string, // "eth.contracts.gitcoin.GovernorAlpha"
    contractName: string, // "GovernorAlpha"
    contractDesc: string,
    chainId: string,
    tx: any,
): Promise<Contract> {
    const namespace = await upsertNamespaceWithTx(fullNsp, specGithubRepoUrl(namespaceForChainId[chainId]), tx)
    const contract = await upsertContractWithTx(namespace.id, contractName, contractDesc, tx)
    contract.namespace = namespace
    return contract
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

async function upsertEvents(
    contract: Contract,
    contractInstances: ContractInstance[],
    eventAbiItems: Abi,
    tx: any,
): Promise<EventSpec[]> {
    if (!contractInstances.length) return []
    const namespace = contract.namespace

    // Upsert events for each event abi item.
    const eventsData = uniqueByKeys(eventAbiItems.map(abiItem => ({
        namespaceId: namespace.id,
        name: abiItem.name,
        desc: 'contract event',
        isContractEvent: true,
    })), ['name'])
    
    const events = await upsertEventsWithTx(eventsData, tx)
    const eventsMap = {}
    for (const event of events) {
        eventsMap[event.name] = event
    }

    // Upsert event versions for each abi item.
    const eventSpecs = []
    const eventVersionsData = []
    for (const abiItem of eventAbiItems) {
        const event = eventsMap[abiItem.name]
        const data = {
            nsp: namespace.name,
            name: event.name,
            version: abiItem.signature,
            eventId: event.id,
        }
        eventVersionsData.push(data)

        eventSpecs.push({
            eventName: event.name,
            contractName: contract.name,
            contractInstances,
            namespace,
            abiItem,
            namespacedVersion: toNamespacedVersion(data.nsp, data.name, data.version),
        })
    }
    await upsertEventVersionsWithTx(eventVersionsData, tx)

    return eventSpecs
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