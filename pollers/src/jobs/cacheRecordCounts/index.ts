import {
    SharedTables,
    logger,
    StringKeyMap,
    updateRecordCountsCache,
    camelizeKeys,
} from '../../../../shared'
import config from '../../config'
import createSubscriber from 'pg-listen'

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
        await this.pgListener.connect()
        await pgListener.listenTo(config.RECORD_COUNT_CHANGED_PG_CHANNEL)
    } catch (err) {
        throw `Error listening to record count changed channel: ${err}`
    }

    // Cache all record counts from the Postgres table.
    const recordCounts = await getAllRecordCounts()
    logger.info(`Caching initial batch of ${recordCounts.length} record counts...`)
    await cacheNewRecordCounts(recordCounts)

    logger.info(`Listening for record count changes...`)
}

async function onRecordCountChanged(event) {
    let record = event.data
    if (!record) throw `Malformed event: ${event}`
    record = camelizeKeys(record)
    await cacheNewRecordCounts([record])
}

async function getAllRecordCounts(): Promise<StringKeyMap[]> {
    return camelizeKeys(await SharedTables.query('select table_path, value from record_counts')) as StringKeyMap[]
}

async function cacheNewRecordCounts(recordCounts: StringKeyMap[]) {
    const cacheUpdates = {}
    for (const { tablePath, value } of recordCounts) {
        cacheUpdates[tablePath] = value.toString()
    }
    await updateRecordCountsCache(cacheUpdates)
}

export default cacheRecordCounts