import { 
    StringKeyMap, 
    LiveObjectVersion, 
    logger, 
    toNamespacedVersion,
    getLastXEvents,
    ChainTables,
    camelizeKeys,
    identPath,
    camelToSnake,
    schemaForChainId,
    getGeneratedEventsCursors,
    chainIds,
    getCachedRecordCounts,
} from '../../../shared'
import { ident, literal } from 'pg-format'

const LIMIT = 10

async function getLatestLiveObjectVersionRecords(
    liveObjectVersion: LiveObjectVersion,
    cursor?: string | null,
): Promise<StringKeyMap> {
    const config = liveObjectVersion.config
    const { table, primaryTimestampProperty } = config
    let uniqueBy = (config.uniqueBy || [])[0] || []
    if (!table || !primaryTimestampProperty || !uniqueBy.length) {
        logger.error(`Invalid live object version config (uid=${liveObjectVersion.uid})`)
        return { data: { records: [], cursor } }
    }
    uniqueBy = uniqueBy.sort()

    // Get the latest *limited* records.
    let records: StringKeyMap[] = []

    const { nsp, name, version } = liveObjectVersion
    const namespacedVersion = toNamespacedVersion(nsp, name, version)
    const isContractEvent = liveObjectVersion.nsp.includes('.')
    const streamKey = isContractEvent ? namespacedVersion : `${nsp}.${name}Changed@${version}`
    const propertyNames = liveObjectVersion.properties.map(p => p.name)

    const uniqueRecordId = (record: StringKeyMap) => {
        return uniqueBy.map(property => record[property]).join(',')
    }

    try {
        const recordEvents = await getLastXEvents(streamKey, LIMIT)
        if (recordEvents.length) {
            const seen = new Set()
            for (const event of recordEvents) {
                const record = {}
                for (const propertyName of propertyNames) {
                    record[propertyName] = event.data[propertyName]
                }
                const recordId = uniqueRecordId(record)
                if (seen.has(recordId)) continue
                seen.add(recordId)
                records.push(record)
            }
        } else {
            records = isContractEvent 
                ? await getLatestRecordsFromEventLov(liveObjectVersion)
                : await getLatestRecordsFromCustomLov(liveObjectVersion)
        }
    } catch (err) {
        logger.error(`Error getting latest records from ${table}: ${err}`)
        return { error: 'Failed to pull latest records' }
    }

    if (cursor) {
        // AFTER in a chronological sense.
        const recordsAfterCursor = [] 
        for (const record of records) {
            if (uniqueRecordId(record) === cursor) break
            recordsAfterCursor.push(record)
        }
        records = recordsAfterCursor
    }

    if (!isContractEvent) {
        records = records.map(r => {
            const record = { ...r }
            delete record.id
            return record
        })
    }
    
    return {
        data: { 
            records, 
            cursor: records[0] ? uniqueRecordId(records[0]) : cursor 
        }
    }
}   

async function getLatestRecordsFromEventLov(lov: LiveObjectVersion): Promise<StringKeyMap[]> {
    const { table, chains } = lov.config || {}
    const chainIds = Object.keys(chains || {})
    if (!chainIds.length || !table) return []

    const countResp = await getCachedRecordCounts([table])
    const tableCountResp = countResp[table] || {}
    let cachedCount = Number(tableCountResp.count)
    cachedCount = (Number.isNaN(cachedCount) ? 0 : cachedCount) || 0
    if (cachedCount === 0) return []

    const heads = await getGeneratedEventsCursors()
    const recordsByChain = (await Promise.all(chainIds.map(chainId => (
        getLatestEventLovRecordsForChainId(table, chainId, Number(heads[chainId]), cachedCount)
    )))).flat()

    const sorted = recordsByChain.sort((a, b) => (
        (new Date(b.blockTimestamp).getTime() - new Date(a.blockTimestamp).getTime()) ||
        (Number(b.logIndex) - (a.logIndex))
    ))
    return sorted.slice(0, LIMIT)
}

async function getLatestEventLovRecordsForChainId(
    givenViewPath: string, 
    chainId: string, 
    head: number | null,
    recordCount: number,
): Promise<StringKeyMap[]> {
    const schema = schemaForChainId[chainId]
    const viewName = givenViewPath.split('.').pop()
    const viewPath = [schema, viewName].join('.')
    const historicalRange = chainId === chainIds.ARBITRUM ? 10000000 : 1000000
    const minBlock = head ? Math.max(head - historicalRange, 0) : 0
    const minBlockClause = minBlock > 0 ? ` where block_number >= ${literal(minBlock)}` : ''

    if (recordCount < 500) {
        const allChainRecords = camelizeKeys((await ChainTables.query(schema, `select * from ${identPath(viewPath)}`)))
        return allChainRecords
            .sort((a, b) => (Number(b.blockNumber) - Number(a.blockNumber)) || (Number(b.logIndex) - Number(a.logIndex)))
            .slice(0, LIMIT)
    }

    return camelizeKeys((await ChainTables.query(schema,
        `select * from ${identPath(viewPath)}${minBlockClause} order by block_number desc limit ${literal(LIMIT)}`
    ))) as StringKeyMap[]
}

async function getLatestRecordsFromCustomLov(lov: LiveObjectVersion): Promise<StringKeyMap[]> {
    const { table, primaryTimestampProperty } = lov.config
    const schema = table.split('.')[0]
    const timestampColumn = camelToSnake(primaryTimestampProperty)

    const countResp = await getCachedRecordCounts([table])
    const tableCountResp = countResp[table] || {}
    let cachedCount = Number(tableCountResp.count)
    cachedCount = (Number.isNaN(cachedCount) ? 0 : cachedCount) || 0
    if (cachedCount === 0) return []

    return camelizeKeys((await ChainTables.query(schema,
        `select * from ${identPath(table)} order by ${ident(timestampColumn)} desc limit ${literal(LIMIT)}`
    ))) as StringKeyMap[]
}

export default getLatestLiveObjectVersionRecords