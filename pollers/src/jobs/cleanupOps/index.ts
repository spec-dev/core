import {
    logger,
    toChunks,
    subtractHours,
    formatPgDateString,
    identPath,
    ChainTables,
} from '../../../../shared'
import config from '../../config'

async function cleanupOps() {
    // Get all op-tracking table paths.
    const tablePaths = await getOpTrackingTables()
    if (!tablePaths) {
        logger.info(`No op_tracking tables found...`)
        return
    }

    // Convert all table paths to their associated ops table.
    const opTablePaths = tablePaths.map(tp => `${tp}_ops`)
    const opTablePathGroups = toChunks(opTablePaths, 30)

    // Delete all ops older than the a certain number of hours.
    const cleanupDateFloor = formatPgDateString(
        subtractHours(new Date(), config.CLEANUP_OPS_OLDER_THAN),
        false,
    )
    logger.info(
        `Deleting ops older than ${cleanupDateFloor} across ${tablePaths.length} ops tables...`
    )

    // Delete all in batches.
    for (const group of opTablePathGroups) {
        await Promise.all(group.map(opTablePath => (
            deleteOpsOlderThan(opTablePath, cleanupDateFloor)
        )))
    }
    logger.info(`Done.`)
}

async function getOpTrackingTables(): Promise<string[]> {
    try {
        return ((await ChainTables.query(null,
            `select distinct(table_path) from op_tracking`
        )) || []).map(r => r.table_path)
    } catch (err) {
        logger.error(`Error querying op_tracking table: ${err}`)
        return []
    }
}

async function deleteOpsOlderThan(opsTablePath: string, timestamp: string) {
    const schema = opsTablePath.split('.')[0]
    try {
        await ChainTables.query(schema,
            `delete from ${identPath(opsTablePath)} where ts < $1`,
            [timestamp]
        )
    } catch (err) {
        logger.error(
            `Failed to delete ops in table ${opsTablePath} older than ${timestamp}: ${err}`
        )
    }
}

export default cleanupOps