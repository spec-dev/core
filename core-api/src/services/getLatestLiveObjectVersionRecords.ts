import { SharedTables, StringKeyMap, LiveObjectVersion, logger, camelToSnake, identPath, camelizeKeys } from '../../../shared'
import { ident, literal } from 'pg-format'

const limit = 10

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

    const timestampColumn = camelToSnake(primaryTimestampProperty)

    // Get the latest *limited* records.
    let records: StringKeyMap[] = []
    try {
        records = camelizeKeys((await SharedTables.query(
            `select * from ${identPath(table)} order by ${ident(timestampColumn)} desc limit ${literal(limit)}`
        ))) as StringKeyMap[]
    } catch (err) {
        logger.error(`Error getting latest records from ${table}: ${err}`)
        return { error: 'Failed to pull latest records' }
    }

    const uniqueRecordId = (record: StringKeyMap) => {
        return uniqueBy.map(property => record[property]).join(',')
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
    
    return {
        data: { 
            records, 
            cursor: records[0] ? uniqueRecordId(records[0]) : cursor 
        }
    }
}

export default getLatestLiveObjectVersionRecords