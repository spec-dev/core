import { Log, LogLevel } from '../types'
import { addLog, logger } from '../../../shared'

export function processLog(log: Log) {
    const { message = '', level, timestamp, projectId } = log
    if (!level || !timestamp) return

    // Add log to project's redis stream.
    addLog(projectId, { message, level, timestamp })

    if (level === LogLevel.Error) {
        logger.error(`[${projectId}] Spec Client Error - ${message}`)
    }
}