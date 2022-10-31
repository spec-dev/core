import { PolygonLog } from '../../../../../shared'
import { ExternalPolygonReceipt, ExternalPolygonLog } from '../types'
import { externalToInternalLog } from '../transforms/logTransforms'

function initLogs(block: any, receipts: ExternalPolygonReceipt[]): PolygonLog[] {
    let logs = []
    for (let receipt of receipts) {
        for (let log of receipt.logs) {
            logs.push(externalToInternalLog(log as ExternalPolygonLog, block))
        }
    }
    return logs
}

export default initLogs
