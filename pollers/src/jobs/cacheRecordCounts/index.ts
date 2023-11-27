import {
    ChainTables,
    logger,
    StringKeyMap,
    updateRecordCountsCache,
    updateNamespaceRecordCountsCache,
    camelizeKeys,
    chainSpecificSchemas,
} from '../../../../shared'
import config from '../../config'
import createSubscriber from 'pg-listen'

const chainSchemas = new Set(Object.values(chainSpecificSchemas))

let started = false

async function cacheRecordCounts() {
    if (started) return
    started = true

    logger.info('Starting record counts change listener...')

    const pgListener = createSubscriber({
        host: config.SHARED_TABLES_DB_HOST,
        port: config.SHARED_TABLES_DB_PORT,
        user: config.SHARED_TABLES_DB_USERNAME,
        password: config.SHARED_TABLES_DB_PASSWORD,
        database: config.SHARED_TABLES_DB_NAME,
    })

    pgListener.notifications.on(
        config.RECORD_COUNT_CHANGED_PG_CHANNEL, 
        event => onRecordCountChanged(event),
    )

    try {
        await pgListener.connect()
        await pgListener.listenTo(config.RECORD_COUNT_CHANGED_PG_CHANNEL)
    } catch (err) {
        throw `Error listening to record count changed channel: ${err}`
    }

    const recordCounts = await getAllRecordCounts()
    logger.info(`Caching initial batch of ${recordCounts.length} record counts...`)

    await cacheNewRecordCounts(recordCounts)
    await calculateAndCacheAggregateNamespaceRecordCounts(recordCounts)

    logger.info(`Listening for record count changes...`)
}

async function onRecordCountChanged(event) {
    let record = event.data
    if (!record) throw `Malformed event: ${event}`

    // Cache record count change.
    record = camelizeKeys(record)
    await cacheNewRecordCounts([record])

    // Recalculate the record counts for the namespace.
    const nsp = parseCustomerNspFromTablePath(record.tablePath)
    const recordCounts = await getRecordCountsForNamespace(nsp)
    await calculateAndCacheAggregateNamespaceRecordCounts(recordCounts)
}

async function getAllRecordCounts(): Promise<StringKeyMap[]> {
    return camelizeKeys(await ChainTables.query(null, 'select table_path, value, updated_at from record_counts')) as StringKeyMap[]
}

async function getRecordCountsForNamespace(nsp: string): Promise<StringKeyMap[]> {
    return camelizeKeys(await ChainTables.query(null,
        'select table_path, value, updated_at from record_counts where table_path like $1 or table_path like $2',
        [`${nsp}.%`, `%.${nsp}_%`]
    )) as StringKeyMap[]
}

async function cacheNewRecordCounts(recordCounts: StringKeyMap[]) {
    const cacheUpdates = {}
    for (const { tablePath, value, updatedAt } of recordCounts) {
        cacheUpdates[tablePath] = JSON.stringify({
            count: value.toString(),
            updatedAt,
        })
    }
    if (!Object.keys(cacheUpdates).length) return
    await updateRecordCountsCache(cacheUpdates)
}

async function calculateAndCacheAggregateNamespaceRecordCounts(recordCounts: StringKeyMap[]) {
    const namespaceCounts = {}
    for (const { tablePath, value, updatedAt } of recordCounts) {
        const nsp = parseCustomerNspFromTablePath(tablePath)
        if (!namespaceCounts.hasOwnProperty(nsp)) {
            namespaceCounts[nsp] = {
                count: 0,
                updatedAt,
            }
        }
        namespaceCounts[nsp].count += value
        if (new Date(updatedAt) > new Date(namespaceCounts[nsp].updatedAt)) {
            namespaceCounts[nsp].updatedAt = updatedAt
        }    
    }
    const cacheUpdates = {}
    for (const nsp in namespaceCounts) {
        const { count, updatedAt } = namespaceCounts[nsp]
        cacheUpdates[nsp] = JSON.stringify({
            count: count.toString(),
            updatedAt,
        })
    }
    if (!Object.keys(cacheUpdates).length) return
    await updateNamespaceRecordCountsCache(cacheUpdates)
}

// HACK/TODO: Will hit errors here if a nsp has an underscore in it....
function parseCustomerNspFromTablePath(tablePath: string): string {
    const [schema, table] = tablePath.split('.')
    return schema === 'spec' || chainSchemas.has(schema) ? table.split('_')[0] : schema
} 

export default cacheRecordCounts