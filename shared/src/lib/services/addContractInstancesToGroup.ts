import { StringKeyMap } from '../types'
import { contractNamespaceForChainId, schemaForChainId } from '../utils/chainIds'
import {
    unique,
    toNamespacedVersion,
    uniqueByKeys,
    polishAbis,
    formatLogAsSpecEvent,
    formatTraceAsSpecCall,
} from '../utils/formatters'
import {
    getContractInstancesInGroup,
    upsertContractInstancesWithTx,
} from '../core/db/services/contractInstanceServices'
import { getContractGroupAbi, getAbis, saveAbisMap } from '../abi/redis'
import { AbiItemType } from '../abi/types'
import { ContractInstance } from '../core/db/entities/ContractInstance'
import { CoreDB } from '../core/db/dataSource'
import { upsertContractEventView } from './upsertContractEventView'
import { designDataModelsFromEventSpec } from './designDataModelsFromEventSpecs'
import { ident } from 'pg-format'
import { Pool } from 'pg'
import {
    decodeTransactions,
    decodeTraces,
    decodeLogs,
    bulkSaveTransactions,
    bulkSaveTraces,
    bulkSaveLogs,
} from './decodeServices'
import { SharedTables } from '../shared-tables/db/dataSource'

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
    addresses: string[],
    chainId: string,
    group: string,
    atBlockNumber: number,
    pool: Pool,
    existingBlockEvents: StringKeyMap[] = [],
    existingBlockCalls: StringKeyMap[] = []
): Promise<StringKeyMap> {
    if (group.split('.').length !== 2) throw `Invalid contract group: ${group}`

    // Get chain-specific contract nsp ("eth.contracts", "polygon.contracts", etc.)
    const chainSpecificContractNsp = contractNamespaceForChainId(chainId)
    if (!chainSpecificContractNsp) throw `No contract namespace for chain id: ${chainId}`

    // Ex: "eth.contracts.gitcoin.GovernorAlpha"
    const fullNsp = [chainSpecificContractNsp, group].join('.')

    // Find other existing contract instances in this group,
    // and make sure it already has at least one entry.
    const existingContractInstances = await getContractInstancesInGroup(fullNsp)
    if (existingContractInstances === null) {
        throw `Failed finding existing contract instances in namespace: ${fullNsp}`
    }
    if (!existingContractInstances.length) {
        throw `No contract instances exist in namespace "${fullNsp}" yet`
    }
    const contract = existingContractInstances[0].contract
    const namespace = contract.namespace

    // Filter out given addresses already in the group.
    const existingContractInstanceAddresses = new Set(
        existingContractInstances.map((ci) => ci.address)
    )
    const newAddresses = unique(addresses.map((a) => a.toLowerCase())).filter(
        (address) => !existingContractInstanceAddresses.has(address)
    )
    if (!newAddresses.length) {
        return { newEventSpecs: [], newCallSpecs: [] }
    }

    // Get abis for the new individual addresses as well as the group's abi.
    const [existingNewAddressAbisMap, groupAbi] = await Promise.all([
        getAbis(newAddresses, chainId),
        getContractGroupAbi(group, chainId),
    ])
    if (!groupAbi?.length) throw 'Contract group has no ABI'

    // Map abis by item signatures.
    const [polishedExistingNewAddressAbisMap, __] = polishAbis(existingNewAddressAbisMap)
    const newAddressAbiSignatures = {}
    for (const address in polishedExistingNewAddressAbisMap) {
        const itemsBySig = {}
        const items = polishedExistingNewAddressAbisMap[address] || []
        items.forEach((item) => {
            itemsBySig[item.signature] = item
        })
        newAddressAbiSignatures[address] = itemsBySig
    }

    // Add all group abi items to each individual address.
    for (const item of groupAbi) {
        for (const address of newAddresses) {
            newAddressAbiSignatures[address] = newAddressAbiSignatures[address] || {}
            if (!newAddressAbiSignatures[address].hasOwnProperty(item.signature)) {
                newAddressAbiSignatures[address][item.signature] = item
            }
        }
    }

    // Save all abis for the new individual addresses.
    const newAddressAbisMap = {}
    for (const address in newAddressAbiSignatures) {
        newAddressAbisMap[address] = Object.values(newAddressAbiSignatures[address])
    }
    await saveAbisMap(newAddressAbisMap, chainId)

    // Create the new contract instances.
    let newContractInstances = []
    try {
        await CoreDB.manager.transaction(async (tx) => {
            newContractInstances = await upsertContractInstancesWithTx(
                newAddresses.map((address) => ({
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
        throw `[${fullNsp}] Failed to create new contract instance while adding to group ${newAddresses.join(
            ', '
        )}: ${err}`
    }
    const allGroupContractInstances = uniqueByKeys(
        [...newContractInstances, ...existingContractInstances],
        ['address']
    ) as ContractInstance[]

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
            contractName: contract.name,
            allGroupContractInstances,
            namespace,
            abiItem,
            namespacedVersion: toNamespacedVersion(namespace.name, abiItem.name, abiItem.signature),
        })
    }

    // Package what's needed to turn these contract events into views.
    const dataModelSpecs = contractEventSpecs.map((contractEventSpec) =>
        designDataModelsFromEventSpec(contractEventSpec, group.split('.')[0], chainId)
    )

    // Upsert contract event views to incorporate the new addresses.
    for (const { viewSpec } of dataModelSpecs) {
        const { schema, name } = viewSpec
        let success = await upsertContractEventView(viewSpec, chainId)
        if (!success) throw `Failed to update contract event view ${schema}.${name}`
    }

    // Decode any interactions with these new contract addresses at the given block number.
    const tables = buildTableRefsForChainId(chainId)

    const [transactions, traces, logs] = await Promise.all([
        decodeTransactions(
            atBlockNumber,
            atBlockNumber,
            newAddresses,
            newAddressAbisMap,
            tables,
            true
        ),
        decodeTraces(atBlockNumber, atBlockNumber, newAddresses, newAddressAbisMap, tables, true),
        decodeLogs(atBlockNumber, atBlockNumber, newAddresses, newAddressAbisMap, tables, true),
    ])

    const decodeErr = (table) => `[${chainId}:${atBlockNumber}] Failed to decode ${table}`
    if (transactions === null) throw decodeErr(tables.transactions)
    if (traces === null) throw decodeErr(tables.traces)
    if (logs === null) throw decodeErr(tables.logs)

    await Promise.all([
        bulkSaveTransactions(
            transactions.filter((t) => !t._alreadyDecoded),
            tables.transactions,
            pool,
            true
        ),
        bulkSaveTraces(
            traces.filter((t) => !t._alreadyDecoded),
            tables.traces,
            pool,
            true
        ),
        bulkSaveLogs(
            logs.filter((l) => !l._alreadyDecoded),
            tables.logs,
            pool,
            true
        ),
    ])

    // Get all transactions for the logs in this block so we can quickly
    // check whether a log succeeded or not (by tx hash).
    const logTxHashes = unique(logs.map((log) => log.transactionHash))
    const phs = logTxHashes.map((_, i) => `$${i + 1}`).join(', ')
    let logTxs = []
    try {
        logTxs = logTxHashes.length
            ? await SharedTables.query(
                  `select * from ${tables.transactions} where "hash" in (${phs})`,
                  logTxHashes
              )
            : []
    } catch (err) {
        throw `Error querying ${tables.transactions} for block number ${atBlockNumber}: ${err}`
    }
    const txSuccess = {}
    for (const tx of logTxs) {
        txSuccess[tx.hash] = tx.status != 0
    }

    // Successful & decoded logs/traces associated with the new addresses.
    const decodedSuccessfulLogs = logs.filter(
        (log) => txSuccess[log.transactionHash] && !!log.eventName
    )
    const decodedSuccessfulTraceCalls = traces.filter(
        (trace) => trace.status !== 0 && !!trace.functionName
    )

    // Get unique sets of events and calls that have already gone out.
    const existingBlockEventIds = new Set<string>()
    existingBlockEvents.forEach((event) => {
        const origin = event.origin
        if (!origin.transactionHash || !origin.hasOwnProperty('logIndex')) return
        existingBlockEventIds.add([origin.transactionHash, origin.logIndex, event.name].join(':'))
    })
    const existingBlockCallIds = new Set<string>()
    existingBlockCalls.forEach((call) => {
        call.origin._id && existingBlockCallIds.add([call.origin._id, call.name].join(':'))
    })

    // New block events generated *for this contract group* due to one of the new addresses.
    const newEventSpecs = []
    for (const decodedLog of decodedSuccessfulLogs) {
        const { eventName, topic0, transactionHash, logIndex } = decodedLog
        const name = toNamespacedVersion(fullNsp, eventName, topic0)
        const uniqueEventKey = [transactionHash, logIndex, name].join(':')
        if (existingBlockEventIds.has(uniqueEventKey)) continue

        const formattedEventData = formatLogAsSpecEvent(
            decodedLog,
            groupAbi,
            contract.name,
            chainId
        )
        if (!formattedEventData) continue

        const { eventOrigin, data } = formattedEventData
        newEventSpecs.push({
            origin: eventOrigin,
            data,
            name,
        })
    }

    // New block calls generated *for this contract group* due to one of the new addresses.
    const newCallSpecs = []
    for (const decodedTrace of decodedSuccessfulTraceCalls) {
        const { functionName, input, id } = decodedTrace
        const signature = input?.slice(0, 10)
        const name = toNamespacedVersion(fullNsp, functionName, signature)
        const uniqueCallKey = [id, name].join(':')
        if (existingBlockCallIds.has(uniqueCallKey)) continue

        const formattedCallData = formatTraceAsSpecCall(
            decodedTrace,
            signature,
            groupAbi,
            contract.name,
            chainId
        )
        if (!formattedCallData) continue
        const { callOrigin, inputs, inputArgs, outputs, outputArgs } = formattedCallData
        newCallSpecs.push({
            origin: callOrigin,
            name: toNamespacedVersion(fullNsp, functionName, signature),
            inputs,
            inputArgs,
            outputs,
            outputArgs,
        })
    }

    return { newEventSpecs, newCallSpecs }
}
