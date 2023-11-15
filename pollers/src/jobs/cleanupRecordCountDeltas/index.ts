import {
    logger,
    subtractHours,
    formatPgDateString,
    ChainTables,
} from '../../../../shared'
import config from '../../config'

async function cleanupRecordCountDeltas() {
    const cleanupDateFloor = formatPgDateString(
        subtractHours(new Date(), config.CLEANUP_OPS_OLDER_THAN),
        false,
    )
    logger.info(
        `Deleting record count deltas older than ${cleanupDateFloor}...`
    )

    await deleteRecordCountDeltasOlderThan(cleanupDateFloor)

    logger.info(`Done.`)
}

async function deleteRecordCountDeltasOlderThan(timestamp: string) {
    try {
        await ChainTables.query(null,
            `delete from record_count_deltas where created_at < $1`,
            [timestamp]
        )
    } catch (err) {
        logger.error(
            `Failed to delete record_count_deltas older than ${timestamp}: ${err}`
        )
    }
}

export default cleanupRecordCountDeltas