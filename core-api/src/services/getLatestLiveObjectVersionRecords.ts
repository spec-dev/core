import { SharedTables, StringKeyMap, LiveObjectVersion, logger, camelToSnake, identPath, camelizeKeys, toNamespacedVersion, getLastXEvents } from '../../../shared'
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

    const { nsp, name, version } = liveObjectVersion
    const namespacedVersion = toNamespacedVersion(nsp, name, version)
    const propertyNames = liveObjectVersion.properties.map(p => p.name)

    try {
        const recordEvents = await getLastXEvents(namespacedVersion, limit)
        if (recordEvents.length) {
            for (const event of recordEvents) {
                const record = {}
                for (const propertyName of propertyNames) {
                    record[propertyName] = event.data[propertyName]
                }
                records.push(record)
            }
        } else {
            records = camelizeKeys((await SharedTables.query(
                `select * from ${identPath(table)} order by ${ident(timestampColumn)} desc limit ${literal(limit)}`
            ))) as StringKeyMap[]    
        }
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

    const isContractEvent = liveObjectVersion.nsp.includes('.')
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

export default getLatestLiveObjectVersionRecords