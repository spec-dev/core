import { CoreDB } from '../core/db/dataSource'
import { SharedTables } from '../shared-tables/db/dataSource'
import { LiveObjectVersion } from '../core/db/entities/LiveObjectVersion'
import { ContractInstance } from '../core/db/entities/ContractInstance'
import { EvmTransaction } from '../shared-tables/db/entities/EvmTransaction'
import logger from '../logger'
import { StringKeyMap } from '../types'
import { fromNamespacedVersion, unique, uniqueByKeys } from '../utils/formatters'
import { In } from 'typeorm'
import { literal, ident } from 'pg-format'
import { Pool } from 'pg'
import { Abi } from '../abi/types'
import { schemaForChainId, isContractNamespace } from '../utils/chainIds'
import { addSeconds, nowAsUTCDateString } from '../utils/date'
import { avgBlockTimesForChainId } from '../utils/chainIds'
import { camelizeKeys } from 'humps'
import { getContractGroupAbi } from '../abi/redis'
import { bulkSaveLogs, bulkSaveTraces, decodeFunctionCall, decodeLogEvents } from './decodeServices'
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

    const indexingContractFactoryLov = !!(
        Object.values(liveObjectVersions) as LiveObjectVersion[]
    ).find((lov) => lov.config?.isContractFactory === true)

    const generator = buildGenerator(
        earliestStartCursor,
        targetBatchSize * shortestBlockTime,
        queryCursors,
        contractInstanceData,
        indexingContractFactoryLov
    )

    return { generator, inputIdsToLovIdsMap, liveObjectVersions, indexingContractFactoryLov }
}

export async function generateLovInputsForEventsAndCalls(
    events: string[],
    calls: string[],
    isContractFactory: boolean,
    startTimestamp: string | null = null,
    targetBatchSize: number,
    inputGen: StringKeyMap | null = null
) {
    inputGen =
        inputGen ||
        (await getInputGeneratorQueriesForEventsAndCalls(
            events,
            calls,
            isContractFactory,
            startTimestamp
        ))
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
    contractInstanceData: StringKeyMap,
    indexingContractFactoryLov: boolean = false
): Function {
    const generator = async (startBlockDate?: Date, pool?: Pool) => {
        startBlockDate = startBlockDate || earliestStartCursor
        const endBlockDate = addSeconds(startBlockDate, batchSizeInSeconds)

        const chainsToQuery = []
        for (const chainId in queryCursors) {
            const timestampCursor = queryCursors[chainId].timestampCursor
            if (timestampCursor < endBlockDate) {
                chainsToQuery.push(chainId)
            }
        }

        const chainInputPromises = []
        for (const chainId of chainsToQuery) {
            const schema = schemaForChainId[chainId]
            const { inputEventsQueryComps, inputFunctionsQueryComps } = queryCursors[chainId]
            const startPgDateStr = formatPgDateString(startBlockDate, false)
            const endPgDateTime = formatPgDateString(endBlockDate, false)

            const eventInputsQuery = inputEventsQueryComps.length
                ? SharedTables.query(
                      `select * from ${ident(schema)}.${ident(
                          'logs'
                      )} where (${inputEventsQueryComps.join(
                          ' or '
                      )}) and block_timestamp >= $1 and block_timestamp < $2`,
                      [startPgDateStr, endPgDateTime]
                  )
                : []

            const callInputsQuery = inputFunctionsQueryComps.length
                ? SharedTables.query(
                      `select * from ${ident(schema)}.${ident(
                          'traces'
                      )} where (${inputFunctionsQueryComps.join(
                          ' or '
                      )}) and block_timestamp >= $1 and block_timestamp < $2`,
                      [startPgDateStr, endPgDateTime]
                  )
                : []

            chainInputPromises.push(...[eventInputsQuery, callInputsQuery])
        }
        let chainInputs = await Promise.all(chainInputPromises)

        const uniqueTxHashes = {}
        for (let i = 0; i < chainInputs.length; i++) {
            const chainId = chainsToQuery[Math.floor(i / 2)]
            const inputType = i % 2 === 0 ? 'event' : 'call'
            uniqueTxHashes[chainId] = uniqueTxHashes[chainId] || new Set()

            for (let j = 0; j < chainInputs[i].length; j++) {
                chainInputs[i][j].inputType = inputType
                chainInputs[i][j].chainId = chainId
                const txHash = chainInputs[i][j].transaction_hash
                txHash && uniqueTxHashes[chainId].add(txHash)
            }
        }

        const successfulTxHashes = {}
        const chainTxsByHash = {}
        let promises = []
        for (const chainId of chainsToQuery) {
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
                    `select * from ${ident(schema)}.${ident(
                        'transactions'
                    )} where hash in (${placeholders.join(', ')})`,
                    txHashes
                )
                successfulTxHashes[chainId] = new Set(
                    txResults.filter((tx) => tx.status != 0).map((tx) => tx.hash)
                )
                const txsByHash = {}
                for (const tx of txResults) {
                    txsByHash[tx.hash] = camelizeKeys(tx)
                }
                chainTxsByHash[chainId] = txsByHash
            }
            promises.push(wrapper())
        }
        await Promise.all(promises)
        promises = null

        const inputs = chainInputs.flat()
        let successfulInputs = []
        for (const input of inputs) {
            const { chainId, inputType } = input
            const txHash = input.transaction_hash

            // Empty transaction hashes (polygon).
            if (inputType === 'call' && !txHash && input.status !== EthTraceStatus.Failure) {
                successfulInputs.push(camelizeKeys(input))
                continue
            }
            if (!successfulTxHashes[chainId] || !successfulTxHashes[chainId].has(txHash)) {
                continue
            }
            if (inputType === 'call' && input.status === EthTraceStatus.Failure) {
                continue
            }
            successfulInputs.push(camelizeKeys(input))
        }

        if (indexingContractFactoryLov && pool) {
            successfulInputs = await decodeInputsIfNotAlready(
                [...successfulInputs],
                contractInstanceData,
                pool
            )
        }

        const sortedInputs = successfulInputs.sort(
            (a, b) =>
                a.blockTimestamp - b.blockTimestamp ||
                Number(a.chainId) - Number(b.chainId) ||
                Number(a.transactionIndex) - Number(b.transactionIndex) ||
                Number(a.inputType === 'event' ? a.logIndex : a.traceIndex) -
                    Number(b.inputType === 'event' ? b.logIndex : b.traceIndex)
        )

        const inputSpecs = []
        for (let input of sortedInputs) {
            const { chainId, inputType, transactionHash } = input
            delete input.chainId
            delete input.inputType
            const record = input
            const chainTxs = chainTxsByHash[chainId] || {}
            const tx = chainTxs[transactionHash]

            if (inputType === 'event') {
                const contractGroups =
                    contractInstanceData[[chainId, record.address, 'event'].join(':')] || []
                if (!contractGroups.length) continue

                for (const {
                    name: contractInstanceName,
                    nsp,
                    abi: contractGroupAbi,
                } of contractGroups) {
                    const fullEventName = toNamespacedVersion(nsp, record.eventName, record.topic0)
                    if (!queryCursors[chainId].inputEventIds.has(fullEventName)) continue

                    const formattedEventData = formatLogAsSpecEvent(
                        record,
                        contractGroupAbi,
                        contractInstanceName,
                        chainId,
                        tx
                    )
                    if (!formattedEventData) continue

                    const { eventOrigin, data } = formattedEventData

                    inputSpecs.push({
                        origin: eventOrigin,
                        name: fullEventName,
                        data,
                    })
                }
            } else {
                const contractGroups =
                    contractInstanceData[[chainId, record.to, 'call'].join(':')] || []
                if (!contractGroups.length) continue

                for (const {
                    name: contractInstanceName,
                    nsp,
                    abi: contractGroupAbi,
                } of contractGroups) {
                    const signature = record.input?.slice(0, 10)
                    const fullCallName = toNamespacedVersion(nsp, record.functionName, signature)
                    if (!queryCursors[chainId].inputFunctionIds.has(fullCallName)) continue

                    const formattedCallData = formatTraceAsSpecCall(
                        record,
                        signature,
                        contractGroupAbi,
                        contractInstanceName,
                        chainId,
                        tx
                    )
                    if (!formattedCallData) continue

                    const { callOrigin, inputs, inputArgs, outputs, outputArgs } = formattedCallData

                    inputSpecs.push({
                        origin: callOrigin,
                        name: fullCallName,
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
                "(address = '0xdb46d1dc155634fbc732f92e853b10b288ad5a1d' and topic0 in ('...', '...'))"
            ],
            "inputEventIds": Set(
                "polygon.contracts.lens.LensHubProxy.PostCreated@<topic>"
            )
            "inputFunctionsQueryComps": [],
            "inputFunctionIds": Set<[]>
            "timestampCursor": "2022-10-10T05:00:00.000Z"
        }
    }
    // Data about the contract instances associated with all inputs.
    contractInstanceData: {
        "137:0xdb46d1dc155634fbc732f92e853b10b288ad5a1d:event": [
            {
                "name": "LensHubProxy",
                "nsp": "polygon.contracts.lens.LensHubProxy",
                "abi": [...contractGroupAbi...]
            },
            ...
        ]
    }
}
*/
export async function getInputGeneratorQueriesForEventsAndCalls(
    eventIds: string[],
    callIds: string[],
    isContractFactory: boolean,
    startTimestamp: string | null = null
) {
    // Get unique list of nsps across all events and calls.
    const eventNsps = unique(
        eventIds.map((id) => fromNamespacedVersion(id).nsp).filter((nsp) => !!nsp)
    )
    const callNsps = unique(
        callIds.map((id) => fromNamespacedVersion(id).nsp).filter((nsp) => !!nsp)
    )
    const eventNspSet = new Set(eventNsps)
    const callNspSet = new Set(callNsps)
    const allInputNsps = unique([...eventNsps, ...callNsps])

    // Get all contract instances in these namespaces.
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
        if (!isContractNamespace(nsp)) continue
        const contractGroup = nsp.split('.').slice(2).join('.')
        if (!contractGroup) continue

        // TODO: Break out above to perform a single redis query using getContractGroupAbis
        // across all contract groups referenced.
        const contractGroupAbi = await getContractGroupAbi(contractGroup)
        if (!contractGroupAbi) continue

        const isUsedByEvent = eventNspSet.has(nsp)
        const isUsedByCall = callNspSet.has(nsp)

        if (isUsedByEvent) {
            const ciKey = [contractInstance.chainId, contractInstance.address, 'event'].join(':')
            contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
            contractInstanceData[ciKey].push({
                name: contractInstance.name,
                nsp,
                abi: contractGroupAbi,
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
                abi: contractGroupAbi,
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
        const { nsp, name, version } = fromNamespacedVersion(eventId)
        if (!nsp || !name || !version) continue

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
        .map((callId) => {
            const { nsp, name, version } = fromNamespacedVersion(callId)
            if (!nsp || !name || !version) return []
            const contractInstancesInfo = callContractInstancesByNamespace[nsp] || []
            return contractInstancesInfo.map((ci) => ({
                chainId: ci.chainId,
                contractAddress: ci.contractAddress,
                callId,
            }))
        })
        .flat() as StringKeyMap[]

    for (const inputContractFunction of inputContractFunctions) {
        const { chainId, contractAddress, callId } = inputContractFunction
        chainInputs[chainId] = chainInputs[chainId] || {}
        chainInputs[chainId].inputFunctionData = chainInputs[chainId].inputFunctionData || []
        chainInputs[chainId].inputFunctionData.push({ callId, contractAddress })
    }

    const queryCursors = await buildQueryCursors(chainInputs, startTimestamp, isContractFactory)

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
            groupQueryCursors[chainId].inputEventIds =
                groupQueryCursors[chainId].inputEventIds || new Set<string>()
            groupQueryCursors[chainId].inputFunctionIds =
                groupQueryCursors[chainId].inputFunctionIds || new Set<string>()

            groupQueryCursors[chainId].inputEventsQueryComps.push(...inputEventsQueryComps)
            groupQueryCursors[chainId].inputFunctionsQueryComps.push(...inputFunctionsQueryComps)
            groupQueryCursors[chainId].timestampCursors.push(timestampCursor)

            Array.from(inputEventIds).forEach((eventId) => {
                groupQueryCursors[chainId].inputEventIds.add(eventId)
            })

            Array.from(inputFunctionIds).forEach((functionId) => {
                groupQueryCursors[chainId].inputFunctionIds.add(functionId)
            })

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
        const nsp = contractInstance.contract.namespace.name
        if (!isContractNamespace(nsp)) continue
        const contractGroup = nsp.split('.').slice(2).join('.')
        if (!contractGroup) continue

        // TODO: Break out above to perform a single redis query using getContractGroupAbis
        // across all contract groups referenced.
        const contractGroupAbi = await getContractGroupAbi(contractGroup)
        if (!contractGroupAbi) continue

        const ciKey = [contractInstance.chainId, contractInstance.address, 'event'].join(':')
        contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
        contractInstanceData[ciKey].push({
            name: contractInstance.name,
            nsp: contractInstance.contract.namespace.name,
            abi: contractGroupAbi,
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
                callId: toNamespacedVersion(call.namespace.name, call.functionName, call.version),
            }))
        })
        .flat() as StringKeyMap[]

    for (const inputContractFunction of inputContractFunctions) {
        const { chainId, contractAddress, contractInstanceName, callId } = inputContractFunction
        const { nsp } = fromNamespacedVersion(callId)
        if (!isContractNamespace(nsp)) continue
        const contractGroup = nsp.split('.').slice(2).join('.')
        if (!contractGroup) continue

        // TODO: Break out above to perform a single redis query using getContractGroupAbis
        // across all contract groups referenced.
        const contractGroupAbi = await getContractGroupAbi(contractGroup)
        if (!contractGroupAbi) continue

        chainInputs[chainId] = chainInputs[chainId] || {}
        chainInputs[chainId].inputFunctionData = chainInputs[chainId].inputFunctionData || []
        chainInputs[chainId].inputFunctionData.push({ callId, contractAddress })

        const ciKey = [chainId, contractAddress, 'call'].join(':')
        contractInstanceData[ciKey] = contractInstanceData[ciKey] || []
        contractInstanceData[ciKey].push({
            name: contractInstanceName,
            nsp,
            abi: contractGroupAbi,
        })
    }

    const queryCursors = await buildQueryCursors(
        chainInputs,
        startTimestamp,
        liveObjectVersion.config?.isContractFactory === true
    )

    return { queryCursors, contractInstanceData, liveObjectVersion }
}

async function buildQueryCursors(
    chainInputs: StringKeyMap,
    startTimestamp: string | null,
    isContractFactory: boolean
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
            const version = eventId ? fromNamespacedVersion(eventId).version : eventVersion.version
            inputEventsQueryComps.push(
                `(topic0 = ${literal(version)} and address in (${contractAddresses
                    .map(literal)
                    .join(', ')}))`
            )
        }
        if (uniqueEventContractAddresses.size === 1) {
            const address = Array.from(uniqueEventContractAddresses)[0]
            const versions = inputEvents.map(({ eventVersion, eventId }) =>
                eventId ? fromNamespacedVersion(eventId).version : eventVersion.version
            )
            inputEventsQueryComps = [
                `(address = ${literal(address)} and topic0 in (${versions
                    .map(literal)
                    .join(', ')}))`,
            ]
        }

        // Turn input functions into a combined *.traces query.
        const inputFunctionData = chainInputs[chainId].inputFunctionData || []
        const inputFunctionIds = new Set<string>()
        const inputFunctionsQueryComps = []
        for (const { callId, contractAddress } of inputFunctionData) {
            const { name } = fromNamespacedVersion(callId)
            inputFunctionIds.add(callId)
            inputFunctionsQueryComps.push(
                `(function_name = ${literal(name)} and "to" = ${literal(contractAddress)})`
            )
            isContractFactory &&
                inputFunctionsQueryComps.push(
                    `(function_name is null and "to" = ${literal(contractAddress)})`
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

async function decodeInputsIfNotAlready(
    inputs: StringKeyMap[],
    contractInstanceData: StringKeyMap,
    pool: Pool
): Promise<StringKeyMap[]> {
    const decodedInputs = []
    const logsToSaveByChainId = {}
    const tracesToSaveByChainId = {}

    for (const input of inputs) {
        const chainId = input.chainId
        const isEvent = input.inputType === 'event'
        const isDecoded = isEvent ? !!input.eventName : !!input.functionName
        if (isDecoded) {
            decodedInputs.push(input)
            continue
        }

        const contractAddress = isEvent ? input.address : input.to
        const ciKey = [chainId, contractAddress, input.inputType].join(':')
        const abis = (contractInstanceData[ciKey] || []).map((d) => d.abi || [])
        if (!abis.length) continue

        let decodedInput
        for (const abi of abis) {
            if (isEvent) {
                const log = decodeLogEvents([input], { [contractAddress]: abi })[0]
                if (log.eventName) {
                    decodedInput = log
                    break
                }
            } else {
                const trace = decodeFunctionCall(input, abi)
                if (trace.functionName) {
                    decodedInput = trace
                    break
                }
            }
        }
        if (!decodedInput) continue

        decodedInputs.push(decodedInput)

        if (isEvent) {
            logsToSaveByChainId[chainId] = logsToSaveByChainId[chainId] || []
            logsToSaveByChainId[chainId].push(decodedInput)
        } else {
            tracesToSaveByChainId[chainId] = tracesToSaveByChainId[chainId] || []
            tracesToSaveByChainId[chainId].push(decodedInput)
        }
    }

    try {
        const savePromises = []
        for (const chainId in logsToSaveByChainId) {
            const schema = schemaForChainId[chainId]
            const tablePath = [schema, 'logs'].join('.')
            savePromises.push(bulkSaveLogs(logsToSaveByChainId[chainId], tablePath, pool, true))
        }
        for (const chainId in tracesToSaveByChainId) {
            const schema = schemaForChainId[chainId]
            const tablePath = [schema, 'traces'].join('.')
            savePromises.push(bulkSaveTraces(tracesToSaveByChainId[chainId], tablePath, pool, true))
        }
        savePromises.length && (await Promise.all(savePromises))
    } catch (err) {
        throw `Failed to decode inputs on-the-fly: ${err}`
    }

    return decodedInputs
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
    contractGroupAbi: Abi,
    contractInstanceName: string,
    chainId: string,
    transaction: EvmTransaction
): StringKeyMap {
    let eventOrigin: StringKeyMap = {
        contractAddress: log.address,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        signature: log.topic0,
        blockHash: log.blockHash,
        blockNumber: Number(log.blockNumber),
        blockTimestamp: log.blockTimestamp.toISOString(),
        chainId,
    }

    const fixedContractEventProperties = {
        ...eventOrigin,
        contractName: contractInstanceName,
        logIndex: log.logIndex,
    }

    // add after creating the fixed properties above.
    eventOrigin = {
        ...eventOrigin,
        transaction,
    }

    const groupAbiItem = contractGroupAbi.find((item) => item.signature === log.topic0)
    if (!groupAbiItem) return null

    const groupArgNames = (groupAbiItem.inputs || []).map((input) => input.name).filter((v) => !!v)
    const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
    if (logEventArgs.length !== groupArgNames.length) return null

    const eventProperties = []
    for (let i = 0; i < logEventArgs.length; i++) {
        const arg = logEventArgs[i]
        if (!arg) return null

        const argName = groupArgNames[i]
        if (!argName) return null

        eventProperties.push({
            name: snakeToCamel(stripLeadingAndTrailingUnderscores(argName)),
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
    signature: string,
    contractGroupAbi: Abi,
    contractInstanceName: string,
    chainId: string,
    transaction: EvmTransaction
): StringKeyMap {
    const callOrigin = {
        _id: trace.id,
        contractAddress: trace.to,
        contractName: contractInstanceName,
        transaction,
        transactionHash: trace.transactionHash,
        transactionIndex: trace.transactionIndex,
        traceIndex: trace.traceIndex,
        signature,
        blockHash: trace.blockHash,
        blockNumber: Number(trace.blockNumber),
        blockTimestamp: trace.blockTimestamp.toISOString(),
        chainId: chainId,
    }

    const groupAbiItem = contractGroupAbi.find((item) => item.signature === signature)
    if (!groupAbiItem) return null

    const groupArgNames = (groupAbiItem.inputs || []).map((input) => input.name)
    const functionArgs = (trace.functionArgs || []) as StringKeyMap[]
    const inputs = {}
    const inputArgs = []
    for (let i = 0; i < functionArgs.length; i++) {
        const arg = functionArgs[i]
        if (!arg) return null

        const argName = groupArgNames[i]
        if (argName) {
            inputs[argName] = arg.value
        }

        inputArgs.push(arg.value)
    }

    const groupOutputNames = (groupAbiItem.outputs || []).map((output) => output.name)
    const functionOutputs = (trace.functionOutputs || []) as StringKeyMap[]
    const outputs = {}
    const outputArgs = []
    for (let i = 0; i < functionOutputs.length; i++) {
        const output = functionOutputs[i]
        if (!output) return null

        const outputName = groupOutputNames[i]
        if (outputName) {
            outputs[outputName] = output.value
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
