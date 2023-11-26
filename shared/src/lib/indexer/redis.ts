import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { StringKeyMap, StringMap } from '../types'
import { specEnvs } from '../utils/env'
import chainIds from '../utils/chainIds'
import { toDate } from '../utils/date'
import { unique } from '../utils/formatters'
import { sleep } from '../utils/time'

const configureRedis = config.ENV === specEnvs.LOCAL || config.INDEXER_REDIS_HOST !== 'localhost'

export function newRedisClient(url: string) {
    return createClient({ url })
}

// Create redis client.
export const redis = configureRedis ? newRedisClient(config.INDEXER_REDIS_URL) : null

// Log any redis client errors and attempt reconnections.
let reconnectAttempt = 0
redis?.on('error', async (err) => {
    console.error(err)
    logger.error(`Indexer Redis error: ${err}`)

    if (reconnectAttempt >= 3) return
    reconnectAttempt++
    logger.error(`Indexer Redis - attempting reconnect ${reconnectAttempt}`)

    try {
        await redis?.disconnect()
        await sleep(1000)
        await redis?.connect()
    } catch (err) {
        console.error(err)
        logger.error(`Indexer Redis -- reconnect error: ${err}`)
    }
})

export const keys = {
    UNCLED_BLOCKS: 'uncled-blocks',
    CONTRACTS: 'contracts',
    CONTRACT_INSTANCES: 'contract-instances',
    BLOCK_LOGS_INDEXED: 'block-logs-indexed',
    POLYGON_CONTRACTS_CACHE: 'polygon-contract-cache',
    MUMBAI_CONTRACTS_CACHE: 'mumbai-contract-cache',
    FREEZE_ABOVE_BLOCK_PREFIX: 'freeze-above-block',
    FREEZE_ABOVE_BLOCK_UPDATE: 'freeze-above-block-update',
    FORCED_ROLLBACK: 'forced-rollback',
    PROCESS_NEW_HEADS_PREFIX: 'process-new-heads',
    PROCESS_INDEX_JOBS_PREFIX: 'process-index-jobs',
    PROCESS_EVENT_SORTER_JOBS_PREFIX: 'process-event-sorter',
    PROCESS_EVENT_GEN_JOBS_PREFIX: 'process-event-gen-jobs',
    BLOCK_EVENTS_SERIES_NUMBER_PREFIX: 'block-events-series',
    BLOCK_EVENTS_EAGER_BLOCKS_PREFIX: 'block-events-eager-blocks',
    BLOCK_EVENTS_SKIPPED_BLOCKS_PREFIX: 'block-events-skipped-blocks',
    PAUSE_EVENT_SORTER_PREFIX: 'event-sorter-paused',
    PAUSE_EVENT_GENERATOR_PREFIX: 'event-generator-paused',
    FAILING_NAMESPACES: 'failing-namespaces',
    FAILING_TABLES: 'failing-tables',
    FAILING_TABLES_UPDATE: 'failing-tables-update',
    LATEST_BLOCKS: 'latest-blocks',
    LATEST_BLOCK_NUMBERS: 'latest-block-numbers',
    LATEST_TRANSACTIONS: 'latest-transactions',
    TRANSACTION_HASHES_FOR_BLOCK_HASH: 'block-transactions',
    LIVE_OBJECT_TABLES: 'live-object-tables',
    LIVE_OBJECT_VERSION_FAILURES: 'lov-failures',
    GENERATED_EVENTS_CURSOR: 'generated-events-cursor',
    ADDITIONAL_CONTRACTS_TO_GENERATE_INPUTS_FOR_PREFIX: 'additional-contract-inputs',
    EVENT_START_BLOCKS: 'event-start-blocks',
}

const polygonContractsKeyForChainId = (chainId: string): string | null => {
    switch (chainId) {
        case chainIds.POLYGON:
            return keys.POLYGON_CONTRACTS_CACHE
        case chainIds.MUMBAI:
            return keys.MUMBAI_CONTRACTS_CACHE
        default:
            return null
    }
}

const formatUncledBlockValue = (...args) => args.join(':')

export async function registerBlockAsUncled(
    chainId: string,
    blockNumber: number,
    blockHash: string
) {
    const value = formatUncledBlockValue(chainId, blockNumber, blockHash)
    try {
        await redis?.sAdd(keys.UNCLED_BLOCKS, value)
    } catch (err) {
        logger.error(`Error adding ${value} to ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }
}

export async function quickUncleCheck(
    chainId: string,
    blockNumber: number,
    blockHash: string
): Promise<boolean> {
    if (!blockHash) return false
    const value = formatUncledBlockValue(chainId, blockNumber, blockHash)
    try {
        return (await redis?.sIsMember(keys.UNCLED_BLOCKS, value)) || false
    } catch (err) {
        logger.error(`Error checking if ${value} is a member of ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }

    return false
}

export async function registerBlockLogsAsIndexed(blockNumbers: number | number[]) {
    const numbers = (Array.isArray(blockNumbers) ? blockNumbers : [blockNumbers]).map((n) =>
        n.toString()
    )

    try {
        await redis?.sAdd(keys.BLOCK_LOGS_INDEXED, numbers)
    } catch (err) {
        logger.error(`Error adding ${blockNumbers} to ${keys.BLOCK_LOGS_INDEXED} set: ${err}.`)
    }
}

export async function hasBlockBeenIndexedForLogs(blockNumber: number): Promise<boolean> {
    try {
        return (await redis?.sIsMember(keys.BLOCK_LOGS_INDEXED, blockNumber.toString())) || false
    } catch (err) {
        logger.error(
            `Error checking if ${blockNumber} is a member of ${keys.BLOCK_LOGS_INDEXED} set: ${err}.`
        )
    }
    return false
}

export async function storePublishedEvent(specEvent: StringKeyMap): Promise<string | null> {
    try {
        return await redis?.xAdd(
            specEvent.name,
            '*',
            { event: JSON.stringify(specEvent) },
            {
                TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 500 },
            }
        )
    } catch (err) {
        logger.error(`Error storing spec event ${specEvent.name}: ${err}.`)
        return null
    }
}

export async function getLastXEvents(
    eventName: string,
    count: number
): Promise<StringKeyMap[] | null> {
    try {
        return ((await redis?.xRevRange(eventName, '+', '-', { COUNT: count })) || [])
            .map((entry) => entry?.message?.event)
            .filter((event) => !!event)
            .map((event) => JSON.parse(event))
    } catch (err) {
        logger.error(`Error getting last ${count} events for ${eventName}: ${err}.`)
        return null
    }
}

export async function getLastEvent(eventName: string): Promise<StringKeyMap | null> {
    try {
        const lastEntry = ((await redis?.xRevRange(eventName, '+', '-', { COUNT: 1 })) || [])[0]
        const eventData = lastEntry?.message?.event
        if (!eventData) return null
        return JSON.parse(eventData)
    } catch (err) {
        logger.error(`Error getting last event for ${eventName}: ${err}.`)
        return null
    }
}

export async function getLastEventId(eventName: string): Promise<string | null> {
    return (await getLastEvent(eventName))?.id || null
}

// In this function, the "ids" are our "nonces".
export async function getEventIdDirectlyBeforeId(
    eventName: string,
    targetId: string
): Promise<string | null> {
    try {
        const prevEntry = ((await redis?.xRevRange(eventName, targetId, '-', { COUNT: 2 })) ||
            [])[1]
        return prevEntry?.id || null
    } catch (err) {
        logger.error(`Error getting event id directly before ${targetId} for ${eventName}: ${err}.`)
        return null
    }
}

export async function getPublishedEventsAfterEventCursors(
    cursors: StringKeyMap[]
): Promise<{ [key: string]: StringKeyMap[] }> {
    if (!cursors?.length) return {}
    const streams = cursors.map((cursor) => ({
        key: cursor.name,
        id: cursor.nonce,
    }))
    try {
        const results = await redis?.xRead(streams)
        if (!results?.length) return {}

        const eventsMap = {}
        for (const eventGroup of results) {
            const { name: eventName, messages = [] } = eventGroup
            if (!messages.length) continue
            const events = messages
                .filter((entry) => !!entry)
                .map((entry) => {
                    const nonce = entry.id
                    const event = (entry.message || {}).event
                    if (!event) return null
                    return {
                        ...JSON.parse(event),
                        nonce,
                    }
                })
                .filter((event) => !!event)
            if (!events.length) continue
            eventsMap[eventName] = events
        }
        return eventsMap
    } catch (err) {
        logger.error(`Error fetching published events after cursors: ${err}.`, streams)
        return {}
    }
}

export async function getPolygonContracts(
    addresses: string[],
    chainId: string = chainIds.POLYGON
): Promise<StringKeyMap> {
    if (!addresses?.length) return {}
    const nsp = polygonContractsKeyForChainId(chainId)
    if (!nsp) return {}
    try {
        const results = (await redis?.hmGet(nsp, addresses)) || []
        const contracts = {}
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i]
            const contractStr = results[i]
            if (!contractStr) continue
            const abi = JSON.parse(contractStr)
            contracts[address] = abi
        }
        return contracts
    } catch (err) {
        logger.error(
            `Error getting polygon contracts for addresses ${addresses.join(', ')}: ${err}.`
        )
        return {}
    }
}

export async function savePolygonContracts(
    contractsMap: StringMap,
    chainId: string = chainIds.POLYGON
): Promise<boolean> {
    if (!Object.keys(contractsMap).length) return true
    const nsp = polygonContractsKeyForChainId(chainId)
    if (!nsp) return false
    try {
        await redis?.hSet(nsp, contractsMap)
    } catch (err) {
        logger.error(`Error saving polygon contracts: ${err}.`)
        return false
    }
    return true
}

export async function saveBlockEvents(
    chainId: string,
    blockNumber: number,
    events: StringKeyMap[]
) {
    const key = [config.BLOCK_EVENTS_PREFIX, chainId].join('-')
    try {
        await redis?.hSet(key, [blockNumber.toString(), JSON.stringify(events)])
    } catch (err) {
        throw `Error saving block events (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function getBlockEvents(
    chainId: string,
    blockNumber: number
): Promise<StringKeyMap[]> {
    const key = [config.BLOCK_EVENTS_PREFIX, chainId].join('-')
    try {
        const results = (await redis?.hmGet(key, blockNumber.toString())) || []
        return (results?.length ? JSON.parse(results[0]) : []) as StringKeyMap[]
    } catch (err) {
        throw `Error getting block events (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function deleteBlockEvents(chainId: string, blockNumbers: number | number[]) {
    const numbers = ((Array.isArray(blockNumbers) ? blockNumbers : [blockNumbers]) as number[]).map(
        (n) => n.toString()
    )
    const key = [config.BLOCK_EVENTS_PREFIX, chainId].join('-')
    try {
        await redis?.hDel(key, numbers)
    } catch (err) {
        logger.error(
            `Error deleting block events (chainId=${chainId}, blockNumbers=${numbers.join(
                ', '
            )}): ${err}`
        )
        return false
    }
    return true
}

export async function saveBlockCalls(chainId: string, blockNumber: number, calls: StringKeyMap[]) {
    const key = [config.BLOCK_CALLS_PREFIX, chainId].join('-')
    try {
        await redis?.hSet(key, [blockNumber.toString(), JSON.stringify(calls)])
    } catch (err) {
        throw `Error saving block calls (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function getBlockCalls(chainId: string, blockNumber: number): Promise<StringKeyMap[]> {
    const key = [config.BLOCK_CALLS_PREFIX, chainId].join('-')
    try {
        const results = (await redis?.hmGet(key, blockNumber.toString())) || []
        return (results?.length ? JSON.parse(results[0]) : []) as StringKeyMap[]
    } catch (err) {
        throw `Error getting block calls (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function deleteBlockCalls(chainId: string, blockNumbers: number | number[]) {
    const numbers = ((Array.isArray(blockNumbers) ? blockNumbers : [blockNumbers]) as number[]).map(
        (n) => n.toString()
    )
    const key = [config.BLOCK_CALLS_PREFIX, chainId].join('-')
    try {
        await redis?.hDel(key, numbers)
    } catch (err) {
        logger.error(
            `Error deleting block calls (chainId=${chainId}, blockNumber=${numbers.join(
                ', '
            )}): ${err}`
        )
        return false
    }
    return true
}

export async function getBlockEventsSeriesNumber(chainId: string): Promise<number | null> {
    const key = [keys.BLOCK_EVENTS_SERIES_NUMBER_PREFIX, chainId].join('-')
    try {
        const blockNumber = parseInt(await redis?.get(key))
        return Number.isNaN(blockNumber) ? null : blockNumber
    } catch (err) {
        throw `Error getting block events series number (chainId=${chainId}): ${err}`
    }
}

export async function setBlockEventsSeriesNumber(chainId: string, blockNumber: number | null) {
    const key = [keys.BLOCK_EVENTS_SERIES_NUMBER_PREFIX, chainId].join('-')
    try {
        if (blockNumber) {
            await redis?.set(key, Number(blockNumber))
        } else {
            await redis?.del(key)
        }
    } catch (err) {
        throw `Error setting block events series number (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function freezeBlockOperationsAtOrAbove(chainId: string, blockNumber: number | null) {
    const key = [keys.FREEZE_ABOVE_BLOCK_PREFIX, chainId].join('-')
    try {
        if (blockNumber) {
            await redis?.set(key, Number(blockNumber))
        } else {
            await redis?.del(key)
        }
        await redis?.publish(
            keys.FREEZE_ABOVE_BLOCK_UPDATE,
            JSON.stringify({
                chainId,
                blockNumber: blockNumber === null ? null : Number(blockNumber),
            })
        )
    } catch (err) {
        throw `Error freezing block operations above number (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
    }
}

export async function getBlockOpsCeiling(chainId: string): Promise<number | null> {
    const key = [keys.FREEZE_ABOVE_BLOCK_PREFIX, chainId].join('-')
    try {
        const currentBlockOpsCeiling = (await redis?.get(key)) || null
        if (currentBlockOpsCeiling === null) return null
        return Number(currentBlockOpsCeiling)
    } catch (err) {
        throw `[${chainId}] Error getting blocks ops ceiling: ${err}`
    }
}

export async function canBlockBeOperatedOn(chainId: string, blockNumber: number): Promise<boolean> {
    const key = [keys.FREEZE_ABOVE_BLOCK_PREFIX, chainId].join('-')
    try {
        const currentBlockOpsCeiling = (await redis?.get(key)) || null
        if (currentBlockOpsCeiling === null) return true
        return blockNumber < Number(currentBlockOpsCeiling)
    } catch (err) {
        throw `[${chainId}] Error checking if block operations can proceed for block ${blockNumber}: ${err}`
    }
}

export async function switchOffTableForChainId(table: string, chainId: string) {
    logger.warn(`Switching OFF operations for ${table} on chain ${chainId}.`)
    const key = [keys.FAILING_TABLES, chainId].join('-')
    try {
        await redis?.sAdd(key, table)
        await redis?.publish(keys.FAILING_TABLES_UPDATE, JSON.stringify({ chainId }))
    } catch (err) {
        throw `Error switching OFF operations for ${table} on chain ${chainId}: ${err}`
    }
}

export async function switchOnTableForChainId(table: string, chainId: string) {
    logger.warn(`Switching ON operations for ${table} on chain ${chainId}.`)
    const key = [keys.FAILING_TABLES, chainId].join('-')
    try {
        await redis?.sRem(key, table)
        await redis?.publish(keys.FAILING_TABLES_UPDATE, JSON.stringify({ chainId }))
    } catch (err) {
        throw `Error switching ON operations for ${table} on chain ${chainId}: ${err}`
    }
}

export async function getFailingTables(chainId: string): Promise<string[]> {
    const key = [keys.FAILING_TABLES, chainId].join('-')
    try {
        return (await redis?.sMembers(key)) || []
    } catch (err) {
        throw `Error getting failing tables (chainId=${chainId}): ${err}`
    }
}

export async function getLovFailure(lovId: number): Promise<string | null> {
    try {
        const results =
            (await redis?.hmGet(keys.LIVE_OBJECT_VERSION_FAILURES, lovId.toString())) || []
        return results?.length ? results[0] : null
    } catch (err) {
        throw `Error getting lov failure (lovId=${lovId}): ${err}`
    }
}

export async function markLovFailure(lovId: number, blockTimestamp: string) {
    const currentLovFailure = await getLovFailure(lovId)
    if (currentLovFailure) {
        const currentLovFailureDate = toDate(currentLovFailure)
        const blockDate = toDate(blockTimestamp)
        // Prevent update into the future
        if (blockDate && currentLovFailureDate && blockDate > currentLovFailureDate) return
    }
    try {
        await redis?.hSet(keys.LIVE_OBJECT_VERSION_FAILURES, [lovId.toString(), blockTimestamp])
    } catch (err) {
        throw `Error marking lov failure (lovId=${lovId}, blockTimestamp=${blockTimestamp}): ${err}`
    }
}

export async function removeLovFailure(lovId: number) {
    try {
        await redis?.hDel(keys.LIVE_OBJECT_VERSION_FAILURES, lovId.toString())
    } catch (err) {
        throw `Error deleting lov failure (lovId=${lovId}): ${err}`
    }
}

export async function getEagerBlocks(chainId: string): Promise<number[]> {
    const key = [keys.BLOCK_EVENTS_EAGER_BLOCKS_PREFIX, chainId].join('-')
    try {
        return (await redis?.zRange(key, 0, -1)).map((v) => Number(v)).sort()
    } catch (err) {
        throw `Error getting eager blocks (chainId=${chainId}): ${err}`
    }
}

export async function addEagerBlock(chainId: string, blockNumber: number) {
    const key = [keys.BLOCK_EVENTS_EAGER_BLOCKS_PREFIX, chainId].join('-')
    blockNumber = Number(blockNumber)
    try {
        await redis?.zAdd(key, { score: blockNumber, value: blockNumber.toString() })
    } catch (err) {
        throw `Error adding eager block ${blockNumber} (chainId=${chainId}): ${err}`
    }
}

export async function deleteEagerBlocks(chainId: string, blockNumbers: number[]) {
    if (!blockNumbers?.length) return
    const key = [keys.BLOCK_EVENTS_EAGER_BLOCKS_PREFIX, chainId].join('-')
    const values = blockNumbers.map((n) => n.toString())
    try {
        await redis?.zRem(key, values)
    } catch (err) {
        throw `Error deleting eager blocks ${values.join(', ')} (chainId=${chainId}): ${err}`
    }
}

export async function getSkippedBlocks(chainId: string): Promise<number[]> {
    const key = [keys.BLOCK_EVENTS_SKIPPED_BLOCKS_PREFIX, chainId].join('-')
    try {
        return (await redis?.zRange(key, 0, -1)).map((v) => Number(v)).sort()
    } catch (err) {
        throw `Error getting skipped blocks (chainId=${chainId}): ${err}`
    }
}

export async function markBlockAsSkipped(chainId: string, blockNumber: number) {
    const key = [keys.BLOCK_EVENTS_SKIPPED_BLOCKS_PREFIX, chainId].join('-')
    blockNumber = Number(blockNumber)
    try {
        await redis?.zAdd(key, { score: blockNumber, value: blockNumber.toString() })
    } catch (err) {
        throw `Error adding skipped block ${blockNumber} (chainId=${chainId}): ${err}`
    }
}

export async function deleteSkippedBlocks(chainId: string, blockNumbers: number[]) {
    if (!blockNumbers?.length) return
    const key = [keys.BLOCK_EVENTS_SKIPPED_BLOCKS_PREFIX, chainId].join('-')
    const values = blockNumbers.map((n) => n.toString())
    try {
        await redis?.zRem(key, values)
    } catch (err) {
        throw `Error deleting skipped blocks ${values.join(', ')} (chainId=${chainId}): ${err}`
    }
}

export async function isEventSorterPaused(chainId: string): Promise<boolean> {
    const key = [keys.PAUSE_EVENT_SORTER_PREFIX, chainId].join('-')
    try {
        return (await redis?.get(key)) === 't'
    } catch (err) {
        throw `Error getting event sorter pause status (chainId=${chainId}): ${err}`
    }
}

export async function pauseEventSorter(chainId: string) {
    const key = [keys.PAUSE_EVENT_SORTER_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, 't')
    } catch (err) {
        throw `Error pausing event sorter (chainId=${chainId}): ${err}`
    }
}

export async function unpauseEventSorter(chainId: string) {
    const key = [keys.PAUSE_EVENT_SORTER_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, 'f')
    } catch (err) {
        throw `Error pausing event sorter (chainId=${chainId}): ${err}`
    }
}

export async function isEventGeneratorPaused(chainId: string): Promise<boolean> {
    const key = [keys.PAUSE_EVENT_GENERATOR_PREFIX, chainId].join('-')
    try {
        return (await redis?.get(key)) === 't'
    } catch (err) {
        throw `Error getting event generator pause status (chainId=${chainId}): ${err}`
    }
}

export async function pauseEventGenerator(chainId: string) {
    const key = [keys.PAUSE_EVENT_GENERATOR_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, 't')
    } catch (err) {
        throw `Error pausing event generator (chainId=${chainId}): ${err}`
    }
}

export async function unpauseEventGenerator(chainId: string) {
    const key = [keys.PAUSE_EVENT_GENERATOR_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, 'f')
    } catch (err) {
        throw `Error pausing event generator (chainId=${chainId}): ${err}`
    }
}

export async function getFailingNamespaces(chainId: string): Promise<string[]> {
    const key = [keys.FAILING_NAMESPACES, chainId].join('-')
    try {
        return (await redis?.sMembers(key)) || []
    } catch (err) {
        throw `Error getting failing namespaces (chainId=${chainId}): ${err}`
    }
}

export async function markNamespaceAsFailing(chainId: string, nsp: string) {
    logger.warn(`Marking namespace "${nsp}" as failing.`)
    const key = [keys.FAILING_NAMESPACES, chainId].join('-')
    try {
        await redis?.sAdd(key, nsp)
    } catch (err) {
        throw `Error setting namespace ${nsp} to failing (chainId=${chainId}): ${err}`
    }
}

export async function unmarkNamespaceAsFailing(chainId: string, nsp: string) {
    const key = [keys.FAILING_NAMESPACES, chainId].join('-')
    try {
        await redis?.sRem(key, nsp)
    } catch (err) {
        throw `Error removing namespace ${nsp} as failing (chainId=${chainId}): ${err}`
    }
}

export async function cacheLatestBlockAndTransactions(
    block: StringKeyMap,
    transactions: StringKeyMap[],
    chainId: string
): Promise<boolean> {
    const latestBlocksKey = [keys.LATEST_BLOCKS, chainId].join('-')
    const latestTransactionsKey = [keys.LATEST_TRANSACTIONS, chainId].join('-')
    const transactionHashesForBlockHashKey = [keys.TRANSACTION_HASHES_FOR_BLOCK_HASH, chainId].join(
        '-'
    )
    const latestBlockNumbersKey = [keys.LATEST_BLOCK_NUMBERS, chainId].join('-')

    // Cache the latest block.
    try {
        await redis?.hSet(latestBlocksKey, [block.hash, JSON.stringify(block)])
    } catch (err) {
        logger.error(`Error caching latest block (hash=${block.hash}, chainId=${chainId}): ${err}`)
        return false
    }

    // Cache the latest transactions.
    const latestTxs = {}
    const txHashes = []
    for (const tx of transactions) {
        latestTxs[tx.hash] = JSON.stringify(tx)
        txHashes.push(tx.hash)
    }
    if (transactions.length) {
        try {
            await redis?.hSet(latestTransactionsKey, latestTxs)
        } catch (err) {
            logger.error(
                `Error caching latest transactions for block (hash=${block.hash}, chainId=${chainId}): ${err}`
            )
            return false
        }
        try {
            await redis?.hSet(transactionHashesForBlockHashKey, [
                block.hash,
                JSON.stringify(txHashes),
            ])
        } catch (err) {
            logger.error(
                `Error caching block transaction hashes for block (hash=${block.hash}, chainId=${chainId}): ${err}`
            )
            return false
        }
    }

    // Register the latest block's number as having been cached.
    try {
        await redis?.zAdd(latestBlockNumbersKey, {
            score: Number(block.number),
            value: block.hash,
        })
    } catch (err) {
        logger.error(
            `Error adding latest block number to sorted set ${block.number} (chainId=${chainId}): ${err}`
        )
        return false
    }

    // Get all cached latest block hashes, sorted by block number (score).
    let latestBlockHashes = []
    try {
        latestBlockHashes = await redis?.zRange(latestBlockNumbersKey, 0, -1, { REV: true })
    } catch (err) {
        logger.error(`Error getting lastest block hashes from cache (chainId=${chainId}): ${err}`)
        return false
    }

    // Trim all cached data that's not for the latest 10 blocks.
    const blockHashesToRemoveDataFor = latestBlockHashes.slice(10)
    if (!blockHashesToRemoveDataFor.length) return

    // Remove old cached blocks.
    try {
        await redis?.hDel(latestBlocksKey, blockHashesToRemoveDataFor)
    } catch (err) {
        logger.error(
            `Error deleting cached blocks with hashes ${blockHashesToRemoveDataFor.join(
                ', '
            )} (chainId=${chainId}): ${err}`
        )
        return false
    }

    // Remove old cached transactions.
    let txHashesToRemove = []
    try {
        txHashesToRemove = (
            await redis?.hmGet(transactionHashesForBlockHashKey, blockHashesToRemoveDataFor)
        )
            .filter((v) => !!v)
            .map((v) => JSON.parse(v))
            .flat()
    } catch (err) {
        logger.error(
            `Error getting cached transaction hashes for block hashes ${blockHashesToRemoveDataFor.join(
                ', '
            )} (chainId=${chainId}): ${err}`
        )
    }
    try {
        txHashesToRemove.length && (await redis?.hDel(latestTransactionsKey, txHashesToRemove))
    } catch (err) {
        logger.error(
            `Error deleting cached transactions for block hashes ${blockHashesToRemoveDataFor.join(
                ', '
            )} (chainId=${chainId}): ${err}`
        )
        return false
    }
    try {
        await redis?.hDel(transactionHashesForBlockHashKey, blockHashesToRemoveDataFor)
    } catch (err) {
        logger.error(
            `Error deleting cached transaction hashes for block hashes ${blockHashesToRemoveDataFor.join(
                ', '
            )} (chainId=${chainId}): ${err}`
        )
        return false
    }

    // Unregister old block numbers as cached.
    try {
        await redis?.zRem(latestBlockNumbersKey, blockHashesToRemoveDataFor)
    } catch (err) {
        logger.error(
            `Error deleting cached block hashes from sorted set ${blockHashesToRemoveDataFor.join(
                ', '
            )} (chainId=${chainId}): ${err}`
        )
        return false
    }

    return true
}

export async function getCachedBlockByHash(
    hash: string,
    chainId: string
): Promise<StringKeyMap | null> {
    try {
        const results = (await redis?.hmGet([keys.LATEST_BLOCKS, chainId].join('-'), hash)).filter(
            (v) => !!v
        )
        return results.length ? JSON.parse(results[0]) : null
    } catch (err) {
        throw `Error getting cached block (hash=${hash}, chainId=${chainId}): ${err}`
    }
}

export async function getCachedTransactionByHash(
    hash: string,
    chainId: string
): Promise<StringKeyMap | null> {
    try {
        const results = (
            await redis?.hmGet([keys.LATEST_TRANSACTIONS, chainId].join('-'), hash)
        ).filter((v) => !!v)
        return results.length ? JSON.parse(results[0]) : null
    } catch (err) {
        throw `Error getting cached transaction (hash=${hash}, chainId=${chainId}): ${err}`
    }
}

export async function getCachedLiveObjectTablesByChainId(
    chainId: string
): Promise<string[] | null> {
    try {
        return (await redis?.sMembers([keys.LIVE_OBJECT_TABLES, chainId].join(':'))) || []
    } catch (err) {
        logger.error(`Error getting cached live object tables for chainId ${chainId}: ${err}`)
        return null
    }
}

export async function registerLiveObjectTablesForChainId(
    chainId: string,
    liveObjectTables: string[]
) {
    try {
        return await redis?.sAdd([keys.LIVE_OBJECT_TABLES, chainId].join(':'), liveObjectTables)
    } catch (err) {
        logger.error(`Error setting cached live object tables for chainId ${chainId}: ${err}`)
    }
}

export async function getProcessNewHeads(chainId: string) {
    const key = [keys.PROCESS_NEW_HEADS_PREFIX, chainId].join('-')
    try {
        return await redis?.get(key)
    } catch (err) {
        throw `Error getting process-new-heads (chainId=${chainId}): ${err}`
    }
}

export async function setProcessNewHeads(chainId: string, doProcess: boolean) {
    const key = [keys.PROCESS_NEW_HEADS_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, doProcess ? 1 : 0)
    } catch (err) {
        throw `Error setting process-new-heads (chainId=${chainId}) to ${doProcess}): ${err}`
    }
}

export async function shouldProcessNewHeads(chainId: string): Promise<boolean> {
    const key = [keys.PROCESS_NEW_HEADS_PREFIX, chainId].join('-')
    try {
        const value = await redis?.get(key)
        return value === null || Number(value) === 1
    } catch (err) {
        throw `Error getting process-new-heads (chainId=${chainId}): ${err}`
    }
}

export async function getProcessIndexJobs(chainId: string) {
    const key = [keys.PROCESS_INDEX_JOBS_PREFIX, chainId].join('-')
    try {
        return await redis?.get(key)
    } catch (err) {
        throw `Error getting process-index-jobs (chainId=${chainId}): ${err}`
    }
}

export async function setProcessIndexJobs(chainId: string, doProcess: boolean) {
    const key = [keys.PROCESS_INDEX_JOBS_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, doProcess ? 1 : 0)
    } catch (err) {
        throw `Error setting process-index-jobs (chainId=${chainId}) to ${doProcess}): ${err}`
    }
}

export async function shouldProcessIndexJobs(chainId: string): Promise<boolean> {
    const key = [keys.PROCESS_INDEX_JOBS_PREFIX, chainId].join('-')
    try {
        const value = await redis?.get(key)
        return value === null || Number(value) === 1
    } catch (err) {
        throw `Error getting process-index-jobs (chainId=${chainId}): ${err}`
    }
}

export async function getProcessEventSorterJobs(chainId: string) {
    const key = [keys.PROCESS_EVENT_SORTER_JOBS_PREFIX, chainId].join('-')
    try {
        return await redis?.get(key)
    } catch (err) {
        throw `Error getting process-event-sorter-jobs (chainId=${chainId}): ${err}`
    }
}

export async function setProcessEventSorterJobs(chainId: string, doProcess: boolean) {
    const key = [keys.PROCESS_EVENT_SORTER_JOBS_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, doProcess ? 1 : 0)
    } catch (err) {
        throw `Error setting process-event-sorter-jobs (chainId=${chainId}) to ${doProcess}): ${err}`
    }
}

export async function shouldProcessEventSorterJobs(chainId: string): Promise<boolean> {
    const key = [keys.PROCESS_EVENT_SORTER_JOBS_PREFIX, chainId].join('-')
    try {
        const value = await redis?.get(key)
        return value === null || Number(value) === 1
    } catch (err) {
        throw `Error getting process-event-sorter-jobs (chainId=${chainId}): ${err}`
    }
}

export async function getProcessEventGenJobs(chainId: string) {
    const key = [keys.PROCESS_EVENT_GEN_JOBS_PREFIX, chainId].join('-')
    try {
        return await redis?.get(key)
    } catch (err) {
        throw `Error getting process-event-gen-jobs (chainId=${chainId}): ${err}`
    }
}

export async function setProcessEventGenJobs(chainId: string, doProcess: boolean) {
    const key = [keys.PROCESS_EVENT_GEN_JOBS_PREFIX, chainId].join('-')
    try {
        await redis?.set(key, doProcess ? 1 : 0)
    } catch (err) {
        throw `Error setting process-event-gen-jobs (chainId=${chainId}) to ${doProcess}): ${err}`
    }
}

export async function shouldProcessEventGenJobs(chainId: string): Promise<boolean> {
    const key = [keys.PROCESS_EVENT_GEN_JOBS_PREFIX, chainId].join('-')
    try {
        const value = await redis?.get(key)
        return value === null || Number(value) === 1
    } catch (err) {
        throw `Error getting process-event-gen-jobs (chainId=${chainId}): ${err}`
    }
}

const getProcessJobsMap = {
    [keys.PROCESS_NEW_HEADS_PREFIX]: getProcessNewHeads,
    [keys.PROCESS_INDEX_JOBS_PREFIX]: getProcessIndexJobs,
    [keys.PROCESS_EVENT_SORTER_JOBS_PREFIX]: getProcessEventSorterJobs,
    [keys.PROCESS_EVENT_GEN_JOBS_PREFIX]: getProcessEventGenJobs,
}

const setProcessJobsMap = {
    [keys.PROCESS_NEW_HEADS_PREFIX]: setProcessNewHeads,
    [keys.PROCESS_INDEX_JOBS_PREFIX]: setProcessIndexJobs,
    [keys.PROCESS_EVENT_SORTER_JOBS_PREFIX]: setProcessEventSorterJobs,
    [keys.PROCESS_EVENT_GEN_JOBS_PREFIX]: setProcessEventGenJobs,
}

export async function getProcessJobs(chainId: string, key: string) {
    const f = getProcessJobsMap[key]
    if (!f) {
        logger.error(`Unknown process jobs function for key: ${key}`)
        return 'unknown'
    }
    return await f(chainId)
}

export async function setProcessJobs(chainId: string, key: string, doProcess: boolean) {
    const f = setProcessJobsMap[key]
    if (!f) {
        logger.error(`Unknown process jobs function for key: ${key}`)
        return false
    }
    await f(chainId, doProcess)
    return true
}

export async function setGeneratedEventsCursor(chainId: string, blockNumber: number) {
    try {
        await redis?.hSet(keys.GENERATED_EVENTS_CURSOR, [chainId, blockNumber.toString()])
    } catch (err) {
        logger.error(
            `Error setting generated events cursor for chain ${chainId} to ${blockNumber}: ${err}`
        )
    }
}

export async function getGeneratedEventsCursors(): Promise<StringKeyMap> {
    try {
        return (await redis?.hGetAll(keys.GENERATED_EVENTS_CURSOR)) || {}
    } catch (err) {
        logger.error(`Error getting generated events cursors: ${err}`)
        return {}
    }
}

export async function saveAdditionalContractsToGenerateInputsFor(
    newContractRegistrations: StringKeyMap[],
    blockNumbers: number[],
    chainId: string
): Promise<boolean> {
    if (!newContractRegistrations?.length) return true

    const key = [config.ADDITIONAL_CONTRACTS_TO_GENERATE_INPUTS_FOR_PREFIX, chainId].join('-')
    try {
        const existing = (
            (await redis?.hmGet(
                key,
                blockNumbers.map((n) => n.toString())
            )) || []
        ).map((result) => {
            return result ? JSON.parse(result) : null
        })

        const data = {}
        for (let i = 0; i < blockNumbers.length; i++) {
            const blockNumber = blockNumbers[i]
            const existingRegistrations = existing[i] || []
            const allRegistrations = [...existingRegistrations, ...newContractRegistrations]
            const registrationsMap = {}
            for (const { group, addresses } of allRegistrations) {
                registrationsMap[group] = registrationsMap[group] || []
                registrationsMap[group].push(...addresses)
            }
            const uniqueRegistrations = []
            for (const group in registrationsMap) {
                uniqueRegistrations.push({
                    group,
                    addresses: unique(registrationsMap[group]),
                })
            }
            data[blockNumber.toString()] = JSON.stringify(uniqueRegistrations)
        }

        await redis?.hSet(key, data)
    } catch (err) {
        logger.error(
            `Error saving additional contracts to generate inputs for (chainId=${chainId}, blockNumbers=${blockNumbers.join(
                ','
            )}): ${err}`
        )
        return false
    }
    return true
}

export async function getAdditionalContractsToGenerateInputsFor(
    chainId: string,
    blockNumber: number
): Promise<StringKeyMap[] | null> {
    const key = [config.ADDITIONAL_CONTRACTS_TO_GENERATE_INPUTS_FOR_PREFIX, chainId].join('-')
    try {
        const results = (await redis?.hmGet(key, blockNumber.toString())) || []
        return (results?.length ? JSON.parse(results[0]) : []) as StringKeyMap[]
    } catch (err) {
        logger.error(
            `Error getting additional contracts to generate inputs for (chainId=${chainId}, blockNumber=${blockNumber}): ${err}`
        )
        return null
    }
}

export async function publishForcedRollback(
    chainId: string,
    blockNumber: number,
    blockHash: string | null,
    unixTimestamp: number
) {
    try {
        await redis?.publish(
            [keys.FORCED_ROLLBACK, chainId].join('-'),
            JSON.stringify({
                blockNumber: blockNumber === null ? null : Number(blockNumber),
                blockHash: blockHash,
                unixTimestamp,
            })
        )
    } catch (err) {
        throw `Error publishing forced rollback event (chainId=${chainId}, blockNumber=${blockNumber}, blockHash=${blockHash}): ${err}`
    }
}

export async function setEventStartBlocks(data: StringKeyMap): Promise<boolean> {
    if (!Object.keys(data).length) return true
    try {
        const stringified = {}
        for (const event in data) {
            stringified[event] = JSON.stringify(data[event] || {})
        }
        await redis?.hSet(keys.EVENT_START_BLOCKS, stringified)
    } catch (err) {
        logger.error(`Error saving event start blocks: ${err}.`, data)
        return false
    }
    return true
}

export async function getEventStartBlocks(
    eventNamespaceVersions: string[]
): Promise<StringKeyMap | null> {
    if (!eventNamespaceVersions?.length) return {}
    try {
        const results = (await redis?.hmGet(keys.EVENT_START_BLOCKS, eventNamespaceVersions)) || []
        const startBlocksByEvent = {}
        for (let i = 0; i < eventNamespaceVersions.length; i++) {
            const eventNamespaceVersion = eventNamespaceVersions[i]
            const data = results[i]
            if (!data) continue
            startBlocksByEvent[eventNamespaceVersion] = JSON.parse(data)
        }
        return startBlocksByEvent
    } catch (err) {
        logger.error(`Error getting start blocks for ${eventNamespaceVersions.join(', ')}: ${err}.`)
        return null
    }
}
