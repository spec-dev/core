import { StringKeyMap } from '../types'
import { schemaForChainId } from '../utils/chainIds'
import logger from '../logger'
import {
    unique,
    toNamespacedVersion,
    uniqueByKeys,
    polishAbis,
    fromNamespacedVersion,
    formatLogAsSpecEvent,
} from '../utils/formatters'
import { setEventStartBlocks } from '../indexer/redis'
import {
    getContractInstancesInNamespace,
    upsertContractInstancesWithTx,
} from '../core/db/services/contractInstanceServices'
import { isValidContractGroup } from '../utils/validators'
import { getContractGroupAbi, getAbis, saveAbisMap } from '../abi/redis'
import { AbiItemType } from '../abi/types'
import { ContractInstance } from '../core/db/entities/ContractInstance'
import { CoreDB } from '../core/db/dataSource'
import { upsertContractEventView } from './contractEventServices'
import { designDataModelsFromEventSpec } from './designDataModelsFromEventSpecs'
import { ident } from 'pg-format'
import {
    decodeTransactions,
    decodeLogs,
    bulkSaveTransactions,
    bulkSaveLogs,
} from './decodeServices'
import { upsertContractWithTx } from '../core/db/services/contractServices'
import { getNamespace } from '../core/db/services/namespaceServices'
import {
    addChainSupportToLovs,
    addChainSupportToLovsDependentOn,
} from '../core/db/services/liveObjectVersionServices'
import { camelizeKeys } from 'humps'
import ChainTables from '../chain-tables/ChainTables'
import { findStartBlocksForEvent } from './contractInteractionServices'

const buildTableRefsForChainId = (chainId: string): StringKeyMap => {
    const schema = schemaForChainId[chainId]
    if (!schema) throw `Invalid chainId ${chainId}`
    return {
        transactions: [ident(schema), 'transactions'].join('.'),
        traces: [ident(schema), 'traces'].join('.'),
        logs: [ident(schema), 'logs'].join('.'),
    }
}

export async function addContractInstancesToGroup(
    instances: StringKeyMap[],
    group: string,
    atBlock?: StringKeyMap,
    existingBlockEvents?: StringKeyMap[],
    existingBlockCalls?: StringKeyMap[]
): Promise<StringKeyMap> {
    existingBlockEvents = existingBlockEvents || []
    existingBlockCalls = existingBlockCalls || []

    if (!isValidContractGroup(group)) throw `Invalid contract group: ${group}`
    const [nsp, contractName] = group.split('.')

    // Ensure this contract group's namespace already exists.
    const namespace = await getNamespace(group)
    if (!namespace) throw `No contract group namespace found for ${group}`

    const existingContractInstances = await getContractInstancesInNamespace(group)
    if (existingContractInstances === null) {
        throw `Failed finding existing contract instances in namespace: ${group}`
    }
    const existingContractInstanceKeys = new Set(
        existingContractInstances.map(({ chainId, address }) => [chainId, address].join(':'))
    )
    const existingGroupChainIds = new Set(existingContractInstances.map((ci) => ci.chainId))
    const newInstances = []
    for (const { chainId, address } of instances) {
        const lowerAddress = address.toLowerCase()
        const key = [chainId, lowerAddress].join(':')
        if (existingContractInstanceKeys.has(key)) continue
        newInstances.push({ chainId, address: lowerAddress })
    }
    if (!newInstances.length) {
        return { newEventSpecs: [], newCallSpecs: [], newInstances }
    }
    const newInstanceChainIds = newInstances.map((ci) => ci.chainId)
    const newGroupChainIds = newInstanceChainIds.filter(
        (chainId) => !existingGroupChainIds.has(chainId)
    )

    const newAddressesByChainId = {}
    for (const { chainId, address } of newInstances) {
        newAddressesByChainId[chainId] = newAddressesByChainId[chainId] || []
        newAddressesByChainId[chainId].push(address)
    }

    // Get abis for the new individual addresses as well as the group's abi.
    let existingNewAddressAbisMap = {}
    for (const [chainId, addresses] of Object.entries(newAddressesByChainId)) {
        const newChainAbis = await getAbis(addresses as string[], chainId)
        for (const address in newChainAbis) {
            const abi = newChainAbis[address]
            const key = [chainId, address].join(':')
            existingNewAddressAbisMap[key] = abi
        }
    }
    const groupAbi = await getContractGroupAbi(group)
    if (!groupAbi?.length) throw 'Contract group has no ABI'

    // Map abis by item signatures.
    const [polishedExistingNewAddressAbisMap, __] = polishAbis(existingNewAddressAbisMap)
    const newAddressAbiSignatures = {}
    for (const key in polishedExistingNewAddressAbisMap) {
        const itemsBySig = {}
        const items = polishedExistingNewAddressAbisMap[key] || []
        items.forEach((item) => {
            itemsBySig[item.signature] = item
        })
        newAddressAbiSignatures[key] = itemsBySig
    }

    // Add all group abi items to each individual address.
    for (const item of groupAbi) {
        for (const { chainId, address } of newInstances) {
            const key = [chainId, address].join(':')
            newAddressAbiSignatures[key] = newAddressAbiSignatures[key] || {}
            if (!newAddressAbiSignatures[key].hasOwnProperty(item.signature)) {
                newAddressAbiSignatures[key][item.signature] = item
            }
        }
    }

    // Save all abis for the new individual addresses.
    const newAddressAbisMap = {}
    for (const key in newAddressAbiSignatures) {
        newAddressAbisMap[key] = Object.values(newAddressAbiSignatures[key])
    }

    const newChainAddressAbisMap = {}
    for (const key in newAddressAbisMap) {
        const [chainId, address] = key.split(':')
        newChainAddressAbisMap[chainId] = newChainAddressAbisMap[chainId] || {}
        newChainAddressAbisMap[chainId][address] = newAddressAbisMap[key]
    }
    for (const [chainId, chainAbisMap] of Object.entries(newChainAddressAbisMap)) {
        await saveAbisMap(chainAbisMap, chainId)
    }

    // Create the new contract instances.
    let newContractInstances = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            const contract = await upsertContractWithTx(tx, namespace.id, contractName)
            newContractInstances = await upsertContractInstancesWithTx(
                newInstances.map(({ chainId, address }) => ({
                    chainId,
                    address,
                    contractId: contract.id,
                    name: contract.name,
                    desc: '',
                })),
                tx
            )
        })
    } catch (err) {
        throw `[${group}] Failed to create new contract instances while adding to ${group} ${JSON.stringify(
            newInstances
        )}: ${err}`
    }
    const allGroupContractInstances = uniqueByKeys(
        [...newContractInstances, ...existingContractInstances],
        ['chainId', 'address']
    ) as ContractInstance[]
    const addressesByChainId = {}
    for (const { chainId, address } of allGroupContractInstances) {
        addressesByChainId[chainId] = addressesByChainId[chainId] || []
        addressesByChainId[chainId].push(address)
    }

    // Build contract event specs from the group's ABI.
    const eventAbiItems = groupAbi.filter(
        (item) =>
            item.type === AbiItemType.Event &&
            !!item.name &&
            !!item.inputs?.every((input) => !!input.name)
    )
    const contractEventSpecs = []
    for (const abiItem of eventAbiItems) {
        contractEventSpecs.push({
            eventName: abiItem.name,
            contractName: contractName,
            contractInstances: allGroupContractInstances,
            namespace,
            abiItem,
            namespacedVersion: toNamespacedVersion(namespace.name, abiItem.name, abiItem.signature),
        })
    }

    // Package what's needed to turn these contract events into views.
    const dataModelSpecs = contractEventSpecs.map((contractEventSpec) =>
        designDataModelsFromEventSpec(contractEventSpec, nsp)
    )

    // Upsert views for each contract event.
    const eventNamespaceVersions = []
    for (const { lovSpec, viewSpecs } of dataModelSpecs) {
        eventNamespaceVersions.push(
            toNamespacedVersion(lovSpec.namespace, lovSpec.name, lovSpec.version)
        )
        for (const viewSpec of viewSpecs) {
            if (!(await upsertContractEventView(viewSpec))) {
                throw `[${viewSpec.chainId}] Failed to update view for event: ${viewSpec.name}`
            }
        }
    }

    // Ensure chain support scales/is-registered automatically.
    if (newGroupChainIds.length) {
        await Promise.all([
            addChainSupportToLovs(eventNamespaceVersions, newGroupChainIds),
            addChainSupportToLovsDependentOn(eventNamespaceVersions, newGroupChainIds),
        ])
    }

    if (!atBlock) {
        if (!(await findAndCacheStartBlocksForEvents(eventNamespaceVersions, addressesByChainId))) {
            throw `Failed to cache start blocks for events in group ${group}`
        }
        return { newEventSpecs: [], newCallSpecs: [], newInstances }
    }

    const { chainId, blockNumber: atBlockNumber } = atBlock
    const schema = schemaForChainId[chainId]
    const tables = buildTableRefsForChainId(chainId)
    const newAddresses = newInstances.filter((i) => i.chainId === chainId).map((i) => i.address)
    if (!newAddresses.length) {
        return { newEventSpecs: [], newCallSpecs: [], newInstances }
    }
    const chainAbisMap = newChainAddressAbisMap[chainId] || {}

    // Decode any interactions with these new contract addresses at the given block number / chain.
    const [transactions, logs] = await Promise.all([
        decodeTransactions(
            schema,
            atBlockNumber,
            atBlockNumber,
            newAddresses,
            chainAbisMap,
            tables,
            true
        ),
        decodeLogs(schema, atBlockNumber, atBlockNumber, newAddresses, chainAbisMap, tables, true),
    ])

    const decodeErr = (table) => `[${chainId}:${atBlockNumber}] Failed to decode ${table}`
    if (transactions === null) throw decodeErr(tables.transactions)
    if (logs === null) throw decodeErr(tables.logs)

    await Promise.all([
        bulkSaveTransactions(
            schema,
            transactions.filter((t) => !t._alreadyDecoded),
            tables.transactions,
            false,
            true
        ),
        bulkSaveLogs(
            schema,
            logs.filter((l) => !l._alreadyDecoded),
            tables.logs,
            false,
            true
        ),
    ])

    // Get all transactions for the logs & traces in this block so we can quickly
    // check whether a log succeeded or not (by tx hash) and attach the full tx.
    const uniqueTxHashes = unique([...logs.map((log) => log.transactionHash)])
    const phs = uniqueTxHashes.map((_, i) => `$${i + 1}`).join(', ')
    let inputTxs = []
    try {
        inputTxs = uniqueTxHashes.length
            ? await ChainTables.query(
                  schema,
                  `select * from ${tables.transactions} where "hash" in (${phs})`,
                  uniqueTxHashes
              )
            : []
    } catch (err) {
        throw `Error querying ${tables.transactions} for block number ${atBlockNumber}: ${err}`
    }
    inputTxs = camelizeKeys(inputTxs) as any[]

    const txMap = {}
    const txSuccess = {}
    for (const tx of inputTxs) {
        txMap[tx.hash] = tx
        txSuccess[tx.hash] = tx.status != 0
    }

    // Successful & decoded logs/traces associated with the new addresses.
    const decodedSuccessfulLogs = logs.filter(
        (log) => txSuccess[log.transactionHash] && !!log.eventName
    )

    // Get unique sets of events and calls that have already gone out.
    const existingBlockEventIds = new Set<string>()
    existingBlockEvents.forEach((event) => {
        const origin = event.origin
        if (!origin.transactionHash || !origin.hasOwnProperty('logIndex')) return
        existingBlockEventIds.add([origin.transactionHash, origin.logIndex, event.name].join(':'))
    })

    // New block events generated *for this contract group* due to one of the new addresses.
    const newEventSpecs = []
    for (const decodedLog of decodedSuccessfulLogs) {
        const { eventName, topic0, transactionHash, logIndex } = decodedLog
        const name = toNamespacedVersion(group, eventName, topic0)
        const uniqueEventKey = [transactionHash, logIndex, name].join(':')
        if (existingBlockEventIds.has(uniqueEventKey)) continue

        const formattedEventData = formatLogAsSpecEvent(
            decodedLog,
            groupAbi,
            contractName,
            chainId,
            txMap[transactionHash]
        )
        if (!formattedEventData) continue

        const { eventOrigin, data } = formattedEventData
        newEventSpecs.push({
            origin: eventOrigin,
            data,
            name,
        })
    }

    return { newEventSpecs, newCallSpecs: [], newInstances }
}

async function findAndCacheStartBlocksForEvents(
    eventNamespaceVersions: string[],
    addressesByChainId: StringKeyMap
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
