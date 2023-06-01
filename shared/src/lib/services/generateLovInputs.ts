import { CoreDB } from '../core/db/dataSource'
import { SharedTables } from '../shared-tables/db/dataSource'
import { LiveObjectVersion } from '../core/db/entities/LiveObjectVersion'
import { ContractInstance } from '../core/db/entities/ContractInstance'
import logger from '../logger'
import { StringKeyMap } from '../types'
import { fromNamespacedVersion, unique, uniqueByKeys } from '../utils/formatters'
import { In, SimpleConsoleLogger } from 'typeorm'
import { literal, ident } from 'pg-format'
import { schemaForChainId } from '../utils/chainIds'
import { addSeconds, nowAsUTCDateString } from '../utils/date'
import { avgBlockTimesForChainId } from '../utils/chainIds'
import { camelizeKeys } from 'humps'
import {
    toNamespacedVersion,
    snakeToCamel,
    stripLeadingAndTrailingUnderscores,
} from '../utils/formatters'
import { EthTraceStatus } from '../shared-tables/db/entities/EthTrace'
import { formatPgDateString } from '../utils/time'

const lovRepo = () => CoreDB.getRepository(LiveObjectVersion)

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

export const DEFAULT_TARGET_BLOCK_BATCH_SIZE = 5

export async function getLovInputGenerator(
    lovIds: number[],
    startTimestamp: string | null = null,
    targetBatchSize: number = DEFAULT_TARGET_BLOCK_BATCH_SIZE
): Promise<any> {
    const inputGen = await getGroupedInputGeneratorQueriesForLovs(lovIds, startTimestamp)
    if (!inputGen) return null
    const {
        groupQueryCursors: queryCursors,
        groupContractInstanceData: contractInstanceData,
        inputIdsToLovIdsMap,
        liveObjectVersions,
    } = inputGen
    if (!Object.keys(queryCursors).length) return null

    const [earliestStartCursor, shortestBlockTime] =
        getSmallestStartCursorAndBlockTime(queryCursors)

    const generator = buildGenerator(
        earliestStartCursor,
        targetBatchSize * shortestBlockTime,
        queryCursors,
        contractInstanceData
    )

    return { generator, inputIdsToLovIdsMap, liveObjectVersions }
}

export async function generateLovInputsForEventsAndCalls(
    events: string[],
    calls: string[],
    startTimestamp: string | null = null,
    targetBatchSize: number,
    inputGen: StringKeyMap | null = null
) {
    inputGen =
        inputGen || (await getInputGeneratorQueriesForEventsAndCalls(events, calls, startTimestamp))
    if (!inputGen) return null

    const { queryCursors, contractInstanceData } = inputGen
    if (!Object.keys(queryCursors).length) return null

    const [earliestStartCursor, shortestBlockTime] =
        getSmallestStartCursorAndBlockTime(queryCursors)

    const generator = buildGenerator(
        earliestStartCursor,
        targetBatchSize * shortestBlockTime,
        queryCursors,
        contractInstanceData
    )

    return { generator, inputGen }
}

function getSmallestStartCursorAndBlockTime(queryCursors: StringKeyMap): [Date, number] {
    let earliestStartCursor = null
    let shortestBlockTime = null
    for (const chainId in queryCursors) {
        const timestampCursor = queryCursors[chainId].timestampCursor
        if (earliestStartCursor === null || timestampCursor < earliestStartCursor) {
            earliestStartCursor = timestampCursor
        }
        const chainBlockTime = avgBlockTimesForChainId[chainId]
        if (shortestBlockTime === null || chainBlockTime < shortestBlockTime) {
            shortestBlockTime = chainBlockTime
        }
    }
    return [earliestStartCursor, shortestBlockTime]
}

function buildGenerator(
    earliestStartCursor: Date,
    batchSizeInSeconds: number,
    queryCursors: StringKeyMap,
    contractInstanceData: StringKeyMap
): Function {
    const generator = async (startBlockDate?: Date) => {
        startBlockDate = startBlockDate || earliestStartCursor
        const endBlockDate = addSeconds(startBlockDate, batchSizeInSeconds)

        const chainIdsToQueryForInputs = []
        for (const chainId in queryCursors) {
            const timestampCursor = queryCursors[chainId].timestampCursor
            if (timestampCursor < endBlockDate) {
                chainIdsToQueryForInputs.push(chainId)
            }
        }

        const chainInputPromises = []
        for (const chainId of chainIdsToQueryForInputs) {
            const schema = schemaForChainId[chainId]
            const { inputEventsQueryComps, inputFunctionsQueryComps } = queryCursors[chainId]
            const startPgDateStr = formatPgDateString(startBlockDate, false)
            const endPgDateTime = formatPgDateString(endBlockDate, false)
            chainInputPromises.push(
                ...[
                    inputEventsQueryComps.length
                        ? SharedTables.query(
                              `select * from ${ident(schema)}.${ident(
                                  'logs'
                              )} where (${inputEventsQueryComps.join(
                                  ' or '
                              )}) and block_timestamp >= $1 and block_timestamp < $2`,
                              [startPgDateStr, endPgDateTime]
                          )
                        : [],
                    inputFunctionsQueryComps.length
                        ? SharedTables.query(
                              `select * from ${ident(schema)}.${ident(
                                  'traces'
                              )} where (${inputFunctionsQueryComps.join(
                                  ' or '
                              )}) and block_timestamp >= $1 and block_timestamp < $2`,
                              [startPgDateStr, endPgDateTime]
                          )
                        : [],
                ]
            )
        }

        let chainInputs = await Promise.all(chainInputPromises)

        const uniqueTxHashes = {}
        for (let i = 0; i < chainInputs.length; i++) {
            const chainId = chainIdsToQueryForInputs[Math.floor(i / 2)]
            const inputType = i % 2 === 0 ? 'event' : 'call'
            uniqueTxHashes[chainId] = uniqueTxHashes[chainId] || new Set()

            for (let j = 0; j < chainInputs[i].length; j++) {
                chainInputs[i][j]._inputType = inputType
                chainInputs[i][j]._chainId = chainId
                const txHash = chainInputs[i][j].transaction_hash
                txHash && uniqueTxHashes[chainId].add(txHash)
            }
        }

        const successfulTxHashes = {}
        const promises = []
        for (const chainId of chainIdsToQueryForInputs) {
            const wrapper = async () => {
                const schema = schemaForChainId[chainId]
                const txHashesSet = uniqueTxHashes[chainId]
                if (!txHashesSet || !txHashesSet.size) return
                const txHashes = Array.from(txHashesSet)
                const placeholders = []
                let i = 1
                for (const _ of txHashes) {
                    placeholders.push(`$${i}`)
                    i++
                }
                const txResults = await SharedTables.query(
                    `select hash, status from ${ident(schema)}.${ident(
                        'transactions'
                    )} where hash in (${placeholders.join(', ')})`,
                    txHashes
                )
                successfulTxHashes[chainId] = new Set(
                    txResults.filter((tx) => tx.status != 0).map((tx) => tx.hash)
                )
            }
            promises.push(wrapper())
        }
        await Promise.all(promises)

        const inputs = chainInputs.flat()
        const successfulInputs = []
        for (const input of inputs) {
            const chainId = input._chainId
            const txHash = input.transaction_hash

            // Empty transaction hashes (polygon).
            if (input._inputType === 'call' && !txHash && input.status !== EthTraceStatus.Failure) {
                successfulInputs.push(input)
                continue
            }
            if (!successfulTxHashes[chainId] || !successfulTxHashes[chainId].has(txHash)) {
                continue
            }
            if (input._inputType === 'call' && input.status === EthTraceStatus.Failure) {
                continue
            }
            successfulInputs.push(input)
        }

        const sortedInputs = successfulInputs.sort(
            (a, b) =>
                a.block_timestamp - b.block_timestamp ||
                Number(a._chainId) - Number(b._chainId) ||
                Number(a._transaction_index) - Number(b._transaction_index) ||
                Number(a._inputType === 'event' ? a.log_index : a.trace_index) -
                    Number(b._inputType === 'event' ? b.log_index : b.trace_index)
        )

        const inputSpecs = []
        for (const input of sortedInputs) {
            const { _chainId, _inputType } = input
            delete input._chainId
            delete input._inputType
            const record = camelizeKeys(input)

            if (_inputType === 'event') {
                const associatedContractInstances =
                    contractInstanceData[[_chainId, record.address, 'event'].join(':')] || []
                for (const { name: contractInstanceName, nsp } of associatedContractInstances) {
                    const { data, eventOrigin } = formatLogAsSpecEvent(
                        record,
                        contractInstanceName,
                        _chainId
                    )
                    inputSpecs.push({
                        origin: eventOrigin,
                        name: toNamespacedVersion(nsp, record.eventName, '0.0.1'),
                        data: data,
                    })
                }
            } else {
                const associatedContractInstances =
                    contractInstanceData[[_chainId, record.to, 'call'].join(':')] || []
                for (const { name: contractInstanceName, nsp } of associatedContractInstances) {
                    const { callOrigin, inputs, inputArgs, outputs, outputArgs } =
                        formatTraceAsSpecCall(record, contractInstanceName, _chainId)
                    inputSpecs.push({
                        origin: callOrigin,
                        name: [nsp, record.functionName].join('.'),
                        inputs,
                        inputArgs,
                        outputs,
                        outputArgs,
                    })
                }
            }
        }

        const currentDate = new Date(nowAsUTCDateString())
        const isLastBatch = endBlockDate > currentDate

        return {
            inputs: inputSpecs,
            nextStartDate: isLastBatch ? null : endBlockDate,
        }
    }

    return generator
}

/*
Example return structure:
{
    queryCursors: {
        "137": {
            "inputEventsQueryComps": [
                "(address = '0xdb46d1dc155634fbc732f92e853b10b288ad5a1d' and event_name in ('DefaultProfileSet', 'DispatcherSet'))"
            ],
            "inputFunctionsQueryComps": [],
            "timestampCursor": "2022-10-10T05:00:00.000Z"
        }
    }
    // Data about the contract instances associated with all inputS.
    contractInstanceData: {
        "137:0xdb46d1dc155634fbc732f92e853b10b288ad5a1d:event": [
            {
                "name": "LensHubProxy",
                "nsp": "polygon.contracts.lens.LensHubProxy"
            }
        ]
    }
}
*/
export async function getInputGeneratorQueriesForEventsAndCalls(
    eventIds: string[],
    callIds: string[],
    startTimestamp: string | null = null
) {
    // Get unique list of nsps across all events and calls.
    const eventNsps = unique(
        eventIds.map((id) => fromNamespacedVersion(id).nsp).filter((nsp) => !!nsp)
    )
    const callNsps = unique(
        callIds
            .map((id) => {
                const split = id.split('.')
                split.pop() // pop off function name
                return split.join('.')
            })
            .filter((nsp) => !!nsp)
    )
    const eventNspSet = new Set(eventNsps)
    const callNspSet = new Set(callNsps)
    const allInputNsps = unique([...eventNsps, ...callNsps])

    // Get contract instances for these namespaces.
    let contractInstances
    try {
        contractInstances = await contractInstancesRepo().find({
            relations: { contract: { namespace: true } },
            where: { contract: { namespace: { name: In(allInputNsps) } } },
        })
    } catch (err) {
        logger.error(
            `Error finding ContractInstances with namespaces in ${allInputNsps.join(', ')}`,
            err
        )
        return null
    }

    const eventContractInstancesByNamespace = {}
    const callContractInstancesByNamespace = {}
    const contractInstanceData = {}
    for (const contractInstance of contractInstances) {
        const nsp = contractInstance.contract.namespace.name
        const isUsedByEvent = eventNspSet.has(nsp)
        const isUsedByCall = callNspSet.has(nsp)

        if (isUsedByEvent) {
            const ciKey = [contractInstance.chainId, contractInstance.address, 'event'].join(':')
            contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
            contractInstanceData[ciKey].push({
                name: contractInstance.name,
                nsp,
            })
            if (!eventContractInstancesByNamespace.hasOwnProperty(nsp)) {
                eventContractInstancesByNamespace[nsp] = []
            }
            eventContractInstancesByNamespace[nsp].push({
                chainId: contractInstance.chainId,
                contractAddress: contractInstance.address,
            })
        }
        if (isUsedByCall) {
            const ciKey = [contractInstance.chainId, contractInstance.address, 'call'].join(':')
            contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
            contractInstanceData[ciKey].push({
                name: contractInstance.name,
                nsp,
            })
            if (!callContractInstancesByNamespace.hasOwnProperty(nsp)) {
                callContractInstancesByNamespace[nsp] = []
            }
            callContractInstancesByNamespace[nsp].push({
                chainId: contractInstance.chainId,
                contractAddress: contractInstance.address,
            })
        }
    }

    const chainInputs = {}
    for (const eventId of eventIds) {
        const { nsp } = fromNamespacedVersion(eventId)
        if (!nsp) continue

        const eventContractInstance = eventContractInstancesByNamespace[nsp] || []
        if (!eventContractInstance.length) continue

        eventContractInstance.forEach(({ chainId, contractAddress }) => {
            chainInputs[chainId] = chainInputs[chainId] || {}
            chainInputs[chainId].inputEventData = chainInputs[chainId].inputEventData || {}
            if (!chainInputs[chainId].inputEventData[eventId]) {
                chainInputs[chainId].inputEventData[eventId] = {
                    eventId,
                    contractAddresses: [],
                }
            }
            chainInputs[chainId].inputEventData[eventId].contractAddresses.push(contractAddress)
        })
    }

    const inputContractFunctions = callIds
        .map((id) => {
            const split = id.split('.')
            const functionName = split.pop()
            const nsp = split.join('.')
            const contractInstancesInfo = callContractInstancesByNamespace[nsp] || []
            return contractInstancesInfo.map((ci) => ({
                chainId: ci.chainId,
                contractAddress: ci.contractAddress,
                functionName: functionName,
                nsp: nsp,
            }))
        })
        .flat() as StringKeyMap[]

    for (const inputContractFunction of inputContractFunctions) {
        const { chainId, contractAddress, functionName, nsp } = inputContractFunction
        chainInputs[chainId] = chainInputs[chainId] || {}
        chainInputs[chainId].inputFunctionData = chainInputs[chainId].inputFunctionData || []
        chainInputs[chainId].inputFunctionData.push({ contractAddress, functionName, nsp })
    }

    const queryCursors = await buildQueryCursors(chainInputs, startTimestamp)

    return { queryCursors, contractInstanceData }
}

export async function getGroupedInputGeneratorQueriesForLovs(
    lovIds: number[],
    startTimestamp?: string
): Promise<StringKeyMap | null> {
    const results = (
        await Promise.all(lovIds.map((lovId) => getLovInputGeneratorQueries(lovId, startTimestamp)))
    ).filter((v) => !!v)

    const lovQueryCursors = []
    const groupContractInstanceData = {}
    const liveObjectVersions = {}
    for (const { queryCursors, contractInstanceData, liveObjectVersion } of results) {
        lovQueryCursors.push(queryCursors)
        liveObjectVersions[liveObjectVersion.id] = liveObjectVersion
        for (const key in contractInstanceData) {
            groupContractInstanceData[key] = groupContractInstanceData[key] || []
            groupContractInstanceData[key].push(...contractInstanceData[key])
        }
    }

    for (const key in groupContractInstanceData) {
        groupContractInstanceData[key] = uniqueByKeys(groupContractInstanceData[key], [
            'name',
            'nsp',
        ])
    }

    const groupQueryCursors = {}
    const inputIdsToLovIdsMap = {}

    for (let i = 0; i < lovQueryCursors.length; i++) {
        const queryCursors = lovQueryCursors[i]
        if (queryCursors === null) return null
        const lovId = lovIds[i]

        for (const chainId in queryCursors) {
            const {
                inputEventsQueryComps,
                inputEventIds,
                inputFunctionsQueryComps,
                inputFunctionIds,
                timestampCursor,
            } = queryCursors[chainId]

            groupQueryCursors[chainId] = groupQueryCursors[chainId] || {}
            groupQueryCursors[chainId].inputEventsQueryComps =
                groupQueryCursors[chainId].inputEventsQueryComps || []
            groupQueryCursors[chainId].inputFunctionsQueryComps =
                groupQueryCursors[chainId].inputFunctionsQueryComps || []
            groupQueryCursors[chainId].timestampCursors =
                groupQueryCursors[chainId].timestampCursors || []

            groupQueryCursors[chainId].inputEventsQueryComps.push(...inputEventsQueryComps)
            groupQueryCursors[chainId].inputFunctionsQueryComps.push(...inputFunctionsQueryComps)
            groupQueryCursors[chainId].timestampCursors.push(timestampCursor)

            const uniqueInputIds = [...Array.from(inputEventIds), ...Array.from(inputFunctionIds)]
            uniqueInputIds.forEach((key: string) => {
                inputIdsToLovIdsMap[key] = inputIdsToLovIdsMap[key] || []
                inputIdsToLovIdsMap[key].push(lovId)
            })
        }
    }

    for (const chainId in groupQueryCursors) {
        const timestampCursors = groupQueryCursors[chainId].timestampCursors || []
        groupQueryCursors[chainId].timestampCursor = new Date(
            Math.min.apply(null, timestampCursors)
        )
    }

    return { groupQueryCursors, groupContractInstanceData, inputIdsToLovIdsMap, liveObjectVersions }
}

export async function getLovInputGeneratorQueries(
    lovId: number,
    startTimestamp?: string
): Promise<StringKeyMap> {
    let liveObjectVersion
    try {
        liveObjectVersion = await lovRepo().findOne({
            relations: {
                liveEventVersions: { eventVersion: { event: true } },
                liveCallHandlers: { namespace: { contracts: { contractInstances: true } } },
            },
            where: { id: lovId },
        })
    } catch (err) {
        logger.error(`Error finding LiveObjectVersion where id=${lovId}: ${err}`)
        return null
    }

    const inputContractEventVersions = liveObjectVersion.liveEventVersions
        .filter((lev) => lev.isInput)
        .map((lev) => lev.eventVersion)
        .filter((ev) => ev.event.isContractEvent)

    const uniqueEventNamespaceIds = unique(
        inputContractEventVersions.map((ev) => ev.event.namespaceId)
    )

    let eventContractInstances
    try {
        eventContractInstances = await contractInstancesRepo().find({
            relations: { contract: { namespace: true } },
            where: { contract: { namespaceId: In(uniqueEventNamespaceIds) } },
        })
    } catch (err) {
        logger.error(
            `Error finding ContractInstances with namepace_id in ${uniqueEventNamespaceIds.join(
                ', '
            )}`,
            err
        )
        return null
    }

    const eventContractInstancesByNamespaceId = {}
    const contractInstanceData = {}
    for (const contractInstance of eventContractInstances) {
        const ciKey = [contractInstance.chainId, contractInstance.address, 'event'].join(':')
        contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
        contractInstanceData[ciKey].push({
            name: contractInstance.name,
            nsp: contractInstance.contract.namespace.name,
        })
        const namespaceId = contractInstance.contract.namespaceId
        if (!eventContractInstancesByNamespaceId.hasOwnProperty(namespaceId)) {
            eventContractInstancesByNamespaceId[namespaceId] = []
        }
        eventContractInstancesByNamespaceId[namespaceId].push({
            chainId: contractInstance.chainId,
            contractAddress: contractInstance.address,
        })
    }

    const chainInputs = {}
    for (const eventVersion of inputContractEventVersions) {
        const eventContractInstance =
            eventContractInstancesByNamespaceId[eventVersion.event.namespaceId] || []
        if (!eventContractInstance.length) continue

        eventContractInstance.forEach(({ chainId, contractAddress }) => {
            chainInputs[chainId] = chainInputs[chainId] || {}
            chainInputs[chainId].inputEventData = chainInputs[chainId].inputEventData || {}

            if (!chainInputs[chainId].inputEventData[eventVersion.id]) {
                chainInputs[chainId].inputEventData[eventVersion.id] = {
                    eventVersion,
                    contractAddresses: [],
                }
            }

            chainInputs[chainId].inputEventData[eventVersion.id].contractAddresses.push(
                contractAddress
            )
        })
    }

    const inputContractFunctions = liveObjectVersion.liveCallHandlers
        .map((call) => {
            const contract = call.namespace.contracts[0]
            if (!contract) return []
            return contract.contractInstances.map((contractInstance) => ({
                chainId: contractInstance.chainId,
                contractAddress: contractInstance.address,
                contractInstanceName: contractInstance.name,
                functionName: call.functionName,
                nsp: call.namespace.name,
            }))
        })
        .flat() as StringKeyMap[]

    for (const inputContractFunction of inputContractFunctions) {
        const { chainId, contractAddress, contractInstanceName, functionName, nsp } =
            inputContractFunction

        chainInputs[chainId] = chainInputs[chainId] || {}
        chainInputs[chainId].inputFunctionData = chainInputs[chainId].inputFunctionData || []
        chainInputs[chainId].inputFunctionData.push({ contractAddress, functionName, nsp })

        const ciKey = [chainId, contractAddress, 'call'].join(':')
        contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
        contractInstanceData[ciKey].push({
            name: contractInstanceName,
            nsp,
        })
    }

    const queryCursors = await buildQueryCursors(chainInputs, startTimestamp)

    return { queryCursors, contractInstanceData, liveObjectVersion }
}

async function buildQueryCursors(
    chainInputs: StringKeyMap,
    startTimestamp?: string
): Promise<StringKeyMap> {
    const queryCursors = {}
    for (const chainId in chainInputs) {
        const inputEvents = Object.values(
            chainInputs[chainId].inputEventData || {}
        ) as StringKeyMap[]
        const inputEventIds = new Set<string>()

        // Turn input events into a combined *.logs query.
        const uniqueEventContractAddresses = new Set()
        let inputEventsQueryComps = []
        for (const { eventVersion, eventId, contractAddresses } of inputEvents) {
            if (!contractAddresses.length) continue

            inputEventIds.add(
                eventId ||
                    toNamespacedVersion(eventVersion.nsp, eventVersion.name, eventVersion.version)
            )

            contractAddresses.forEach((a) => {
                uniqueEventContractAddresses.add(a)
            })

            const eventName = eventId ? fromNamespacedVersion(eventId).name : eventVersion.name

            inputEventsQueryComps.push(
                `(event_name = ${literal(eventName)} and address in (${contractAddresses
                    .map(literal)
                    .join(', ')}))`
            )
        }
        if (uniqueEventContractAddresses.size === 1) {
            const address = Array.from(uniqueEventContractAddresses)[0]
            const eventNames = inputEvents.map(({ eventVersion, eventId }) =>
                eventId ? fromNamespacedVersion(eventId).name : eventVersion.name
            )
            inputEventsQueryComps = [
                `(address = ${literal(address)} and event_name in (${eventNames
                    .map(literal)
                    .join(', ')}))`,
            ]
        }

        // Turn input functions into a combined *.traces query.
        const inputFunctionData = chainInputs[chainId].inputFunctionData || []
        const inputFunctionIds = new Set<string>()
        const inputFunctionsQueryComps = []
        for (const { functionName, contractAddress, nsp } of inputFunctionData) {
            inputFunctionIds.add([nsp, functionName].join('.'))
            inputFunctionsQueryComps.push(
                `(function_name = ${literal(functionName)} and "to" = ${literal(contractAddress)})`
            )
        }

        const schema = schemaForChainId[chainId]
        let timestampCursor: any = startTimestamp
        if (!timestampCursor) {
            let [inputEventsStartTimestamp, inputFunctionsStartTimestamp] = await Promise.all([
                findStartBlockTimestamp(schema, 'logs', inputEventsQueryComps),
                findStartBlockTimestamp(schema, 'traces', inputFunctionsQueryComps),
            ])

            const inputEventsStartDate = inputEventsStartTimestamp
                ? new Date(inputEventsStartTimestamp)
                : new Date()

            const inputFunctionsStartDate = inputFunctionsStartTimestamp
                ? new Date(inputFunctionsStartTimestamp)
                : new Date()

            if (inputEventsStartDate <= inputFunctionsStartDate) {
                timestampCursor = inputEventsStartTimestamp || inputEventsStartDate
            } else {
                timestampCursor = inputFunctionsStartTimestamp || inputFunctionsStartDate
            }
        }

        queryCursors[chainId] = {
            inputEventsQueryComps,
            inputEventIds,
            inputFunctionsQueryComps,
            inputFunctionIds,
            timestampCursor: new Date(timestampCursor),
        }
    }

    return queryCursors
}

async function findStartBlockTimestamp(
    schema: string,
    table: string,
    andClauses: string[]
): Promise<string | null> {
    if (!andClauses.length) return null
    try {
        const results =
            (await SharedTables.query(
                `select block_timestamp from ${ident(schema)}.${ident(
                    table
                )} where (${andClauses.join(' or ')}) order by block_timestamp asc limit 1`
            )) || []
        return (results[0] || {})?.block_timestamp || null
    } catch (err) {
        logger.error(
            `Error finding start block timestamp for ${schema}.${table} where ${andClauses.join(
                ' or '
            )}`,
            err
        )
        return null
    }
}

function formatLogAsSpecEvent(
    log: StringKeyMap,
    contractInstanceName: string,
    chainId: string
): StringKeyMap {
    const eventOrigin = {
        contractAddress: log.address,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        blockHash: log.blockHash,
        blockNumber: Number(log.blockNumber),
        blockTimestamp: log.blockTimestamp.toISOString(),
        chainId: chainId,
    }

    const fixedContractEventProperties = {
        ...eventOrigin,
        contractName: contractInstanceName,
        logIndex: log.logIndex,
    }

    const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
    const eventProperties = []
    for (const arg of logEventArgs) {
        if (!arg.name) continue
        eventProperties.push({
            name: snakeToCamel(stripLeadingAndTrailingUnderscores(arg.name)),
            value: arg.value,
        })
    }

    // Ensure event arg property names are unique.
    const seenPropertyNames = new Set(Object.keys(fixedContractEventProperties))
    for (const property of eventProperties) {
        let propertyName = property.name
        while (seenPropertyNames.has(propertyName)) {
            propertyName = '_' + propertyName
        }
        seenPropertyNames.add(propertyName)
        property.name = propertyName
    }

    const data = {
        ...fixedContractEventProperties,
    }
    for (const property of eventProperties) {
        data[property.name] = property.value
    }

    return { data, eventOrigin }
}

function formatTraceAsSpecCall(
    trace: StringKeyMap,
    contractInstanceName: string,
    chainId: string
): StringKeyMap {
    const callOrigin = {
        contractAddress: trace.to,
        contractName: contractInstanceName,
        transactionHash: trace.transactionHash,
        transactionIndex: trace.transactionIndex,
        traceIndex: trace.traceIndex,
        blockHash: trace.blockHash,
        blockNumber: Number(trace.blockNumber),
        blockTimestamp: trace.blockTimestamp.toISOString(),
        chainId: chainId,
    }

    const inputs = {}
    const inputArgs = []
    for (const arg of (trace.functionArgs || []) as StringKeyMap[]) {
        if (arg.name) {
            inputs[arg.name] = arg.value
        }
        inputArgs.push(arg.value)
    }

    const outputs = {}
    const outputArgs = []
    for (const output of (trace.functionOutputs || []) as StringKeyMap[]) {
        if (output.name) {
            outputs[output.name] = output.value
        }
        outputArgs.push(output.value)
    }

    return {
        callOrigin,
        inputs,
        inputArgs,
        outputs,
        outputArgs,
    }
}
