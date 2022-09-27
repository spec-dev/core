import { Log } from '../types'
import { addLog } from '../../../shared'

export function processLog(log: Log) {
    const { message = '', level, timestamp, projectId } = log
    if (!level || !timestamp) return
    addLog(projectId, { message, level, timestamp })
}