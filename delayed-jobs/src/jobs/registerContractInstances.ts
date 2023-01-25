import {
    logger,
    StringKeyMap,
    NewContractPayload,
    unique,
    Abi,
    ContractInstance,
    Contract,
    Namespace,
    AbiItemType,
    uniqueByKeys,
    CoreDB,
    contractNamespaceForChainId,
    upsertNamespaceWithTx,
    upsertContractWithTx,
    upsertContractInstancesWithTx,
    upsertEventsWithTx,
    upsertEventVersionsWithTx,
    toNamespacedVersion,
    schemaForChainId,
    MAX_TABLE_NAME_LENGTH,
    formatBackupContractEventViewName,
    buildContractEventAsLiveObjectVersionPayload,
    PublishLiveObjectVersionPayload,
    camelToSnake,
    specGithubRepoUrl,
    SharedTables,
    CHAIN_ID_COL,
    CONTRACT_NAME_COL,
    CONTRACT_ADDRESS_COL,
    namespaceForChainId,
} from '../../../shared'
import { EventViewSpec, EventSpec } from '../types'
import { publishLiveObjectVersion } from './publishLiveObjectVersion'
import { ident, literal } from 'pg-format'
import config from '../config'
import { 
    fetchAbis, 
    providers, 
    polishAbis,
    saveAbisMap,
    saveFuncSigHashes,
} from './upsertAbis'

async function registerContractInstances(nsp: string, chainId: string, contractPayloads: NewContractPayload[]) {
    // Get all unique contract addresses given.
    const allContractAddresses = unique(contractPayloads.map(c => (c.instances || []).map(i => i.address)).flat())
    logger.info(`[${chainId}:${nsp}]: Registering ${allContractAddresses.length} contract instances...`)
    
    // Get chain-specific contract nsp (e.g. "eth.contracts", "polygon.contracts", etc.)
    const chainSpecificContractNsp = contractNamespaceForChainId(chainId)
    if (!chainSpecificContractNsp) {
        logger.error(`No contract namespace for chain id: ${chainId}`)
        return null
    }

    // Ex: "eth.contracts.uniswap"
    const newContractGroupNsp = [chainSpecificContractNsp, nsp].join('.')
    const chainSpecificSpecRepo = specGithubRepoUrl(namespaceForChainId[chainId])

    // Upsert ABIs for the given contract addresses.
    const abisMap = await upsertVerifiedAbis(allContractAddresses, chainId)
    if (!abisMap) return

    // Verify all instances of the same contract share the "same" ABI.
    const contractAbis = ensureAllInstancesShareSimilarAbis(contractPayloads, abisMap)
    if (!contractAbis) return

    // Upsert namespaces, contracts, contract instances, events, and event versions.
    const eventSpecs = await saveDataModels(
        newContractGroupNsp,
        chainSpecificSpecRepo,
        chainId,
        contractPayloads,
        contractAbis,
    )
    if (eventSpecs === null) return
    if (!eventSpecs.length) {
        logger.warn(`No contract events to create live objects for.`)
        return
    }

    // Package what's needed to turn these contract events into views and live objects.
    const dataModelSpecs = eventSpecs.map(eventSpec => (
        designDataModelsFromEventSpec(eventSpec, nsp, chainId)
    ))

    // Upsert views and live object versions for each contract event.
    for (const { viewSpec, lovSpec } of dataModelSpecs) {
        if (await upsertView(viewSpec, chainId)) {
            await publishContractEventLiveObject(viewSpec.namespace, lovSpec)
        }
    }

    // Kick off jobs to back-decode all events for their associated contract instance addresses.
}

async function upsertVerifiedAbis(addresses: string[], chainId: string): Promise<{ [key: string]: Abi } | null> {    
    // Pull verified abis for each address.
    const verifiedAbisMap = await fetchAbis(addresses, providers.STARSCAN, chainId)

    // Ensure all addresses had corresponding verified ABIs. 
    const unverifiedAbiAddresses = addresses.filter(a => !verifiedAbisMap.hasOwnProperty(a))
    if (unverifiedAbiAddresses.length) {
        logger.error(`ABIs not verified for contracts: ${unverifiedAbiAddresses.join(', ')}`)
        return null
    }

    // Polish the abis by adding signatures to each item.
    const [abisMap, funcSigHashesMap] = polishAbis(verifiedAbisMap)

    // Save ABIs and function signatures.
    await Promise.all([saveAbisMap(abisMap, chainId), saveFuncSigHashes(funcSigHashesMap)])

    return abisMap as { [key: string]: Abi }
}

function ensureAllInstancesShareSimilarAbis(
    contracts: NewContractPayload[],
    abisMap: { [key: string]: Abi },
): Abi[] | null {
    const contractAbis: Abi[] = []

    for (const contract of contracts) {
        // Get contract instances.
        const instances = contract.instances || []
        if (!instances.length) {
            logger.error(`No instances given for contract: ${contract.name}`)
            return null
        }

        // Get abis for each contract instance.
        const abis = instances.map(instance => abisMap[instance.address])

        // Get abi with the least number of items.
        let matchAbi: Abi = null
        let matchAbiIndex = 0
        for (let i = 0; i < abis.length; i++) {
            const abi = abis[i]
            if (!matchAbi || abi.length < matchAbi.length) {
                matchAbi = abi
                matchAbiIndex = i
            }
        }

        contractAbis.push(matchAbi)
        const requiredSigs = matchAbi.map(item => item.signature)
        const requiredEventSigs = matchAbi.filter(item => (
            !!item.name &&
            item.type === AbiItemType.Event
        )).map(item => item.signature)

        // Ensure other abis have all required signatures.
        for (let i = 0; i < abis.length; i++) {
            if (i === matchAbiIndex) continue
            const contractInstance = instances[i]
            const abi = abis[i]
            const abiSigs = new Set(abi.map(item => item.signature))

            for (const sig of requiredEventSigs) {
                if (!abiSigs.has(sig)) {
                    logger.error(
                        `contract ${contractInstance.name} missing abi event: ${JSON.stringify(
                            matchAbi.find(item => item.signature === sig),
                        )}`
                    )
                    return null
                }
            }

            const numMatchingSigs = requiredSigs.filter(sig => abiSigs.has(sig)).length
            const matchingFraction = numMatchingSigs / requiredSigs.length
            logger.info(contractInstance.name, matchingFraction)
            
            if (matchingFraction < config.MIN_CONTRACT_ABI_SIMILARITY) {
                logger.error(
                    `contract ${contractInstance.name} failed ABI similarity with ${matchingFraction} score.`
                )
                return null
            }
        }
    }
    
    return contractAbis
}

async function saveDataModels(
    newContractGroupNsp: string,
    chainSpecificSpecRepo: string,
    chainId: string,
    contractPayloads: NewContractPayload[],
    contractAbis: Abi[],
): Promise<EventSpec[] | null> {
    let eventSpecs = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert contracts with namespaces.
            const contracts = await Promise.all(contractPayloads.map(contractPayload => (
                upsertContractNamespace(newContractGroupNsp, chainSpecificSpecRepo, contractPayload, tx)
            )))

            // Upsert contract instances for each contract.
            const contractInstances = await Promise.all(contracts.map((contract, i) => (
                upsertContractInstances(contract.id, contractPayloads[i], chainId, tx)
            )))

            // Upsert events with versions for each event abi item.
            eventSpecs = await Promise.all(contracts.map((contract, i) => (
                upsertEvents(contract, contractInstances[i], contractAbis[i], tx)
            )))
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while registering contracts under ${newContractGroupNsp}: ${err}`
        )
        return null
    }
    return eventSpecs.flat()
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
    const viewName = createEventViewName(eventSpec, nsp)
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

    // Package what's needed to create a postgres view of this contract event.
    const viewSpec = {
        schema: viewSchema,
        name: viewName,
        columnNames: lovSpec.properties.map(p => camelToSnake(p.name)),
        numEventArgs: eventParams.length,
        contractInstances: eventSpec.contractInstances,
        namespace: eventSpec.namespace,
        eventName: eventSpec.eventName,
    }
    
    return { viewSpec, lovSpec }
}

function createEventViewName(eventSpec: EventSpec, nsp: string): string {
    const { contractName, eventName } = eventSpec
    const viewName = [nsp, contractName, eventName].join('_').toLowerCase()
    return viewName.length >= MAX_TABLE_NAME_LENGTH
        ? formatBackupContractEventViewName(eventSpec.eventUid)
        : viewName
}

async function upsertView(viewSpec: EventViewSpec, chainId: string): Promise<boolean> {
    const {
        schema,
        name,
        columnNames,
        numEventArgs,
        contractInstances,
        eventName,
    } = viewSpec

    logger.info(`Upserting view ${schema}.${name}...`)

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
where "event_name" = ${literal(eventName)}
and "address" in (${addresses.map(a => literal(a)).join(', ')})`

    try {
        await SharedTables.query(upsertViewSql)
    } catch (err) {
        logger.error(`Error upserting view ${schema}.${name}: ${err}`)
        return false
    }

    return true
}

async function publishContractEventLiveObject(namespace: Namespace, payload: PublishLiveObjectVersionPayload) {
    try {
        const liveObjectId = null // just let the live object queries happen in the other service.
        await publishLiveObjectVersion(namespace, liveObjectId, payload)
    } catch (err) {
        logger.error(`Failed to publish live object version ${payload.additionalEventAssociations[0]}.`)
    }
}

async function upsertContractNamespace(
    newContractGroupNsp: string,
    chainSpecificSpecRepo: string,
    contractPayload: NewContractPayload,
    tx: any,
): Promise<Contract> {
    const { name: contractName, desc } = contractPayload
    const nsp = [newContractGroupNsp, contractName].join('.')
    const namespace = await upsertNamespaceWithTx(nsp, chainSpecificSpecRepo, tx)
    const contract = await upsertContractWithTx(namespace.id, contractName, desc, tx)
    contract.namespace = namespace
    return contract
}

async function upsertContractInstances(
    contractId: number,
    contractPayload: NewContractPayload,
    chainId: string,
    tx: any,
): Promise<ContractInstance[]> {
    const contractInstancesData = uniqueByKeys(contractPayload.instances.map(instance => ({
        chainId,
        address: instance.address.toLowerCase(),
        name: instance.name,
        desc: instance.desc,
        contractId,
    })), ['address', 'chainId', 'contractId'])
    return await upsertContractInstancesWithTx(contractInstancesData, tx)
}

async function upsertEvents(
    contract: Contract,
    contractInstances: ContractInstance[],
    abi: Abi,
    tx: any,
): Promise<EventSpec[]> {
    if (!contractInstances.length) return []
    const namespace = contract.namespace

    // Extract all event abi items.
    const eventAbiItems = uniqueByKeys(
        abi.filter(item => (
            item.type === AbiItemType.Event &&
            !!item.name &&
            !!(item.inputs?.every(input => !!input.name))
        )),
        ['name']
    )
    if (!eventAbiItems.length) return []

    // Upsert events for each event abi item.
    const eventsData = eventAbiItems.map(abiItem => ({
        namespaceId: namespace.id,
        name: abiItem.name,
        desc: 'contract event',
        isContractEvent: true,
    }))
    const events = await upsertEventsWithTx(eventsData, tx)

    // Upsert the first event version for each event.
    const eventSpecs = []
    const eventVersionsData = []
    for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const data = {
            nsp: namespace.name,
            name: event.name,
            version: '0.0.1',
            eventId: event.id,
        }
        eventVersionsData.push(data)
        eventSpecs.push({
            eventUid: event.uid,
            eventName: event.name,
            contractName: contract.name,
            contractInstances,
            namespace,
            abiItem: eventAbiItems[i],
            namespacedVersion: toNamespacedVersion(data.nsp, data.name, data.version),
        })
    }
    await upsertEventVersionsWithTx(eventVersionsData, tx)

    return eventSpecs
}

export default function job(params: StringKeyMap) {
    const nsp = params.nsp
    const chainId = params.chainId
    const contracts = params.contracts || []
    contracts.forEach(c => {
        c.instances.forEach(ci => {
            ci.address = ci.address.toLowerCase()
        })
    })
    return {
        perform: async () => registerContractInstances(nsp, chainId, contracts)
    }
}