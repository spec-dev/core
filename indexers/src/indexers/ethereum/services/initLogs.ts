import { EthLog } from '../../../../../shared'
import { ExternalEthReceipt, ExternalEthLog } from '../types'
import { externalToInternalLog } from '../transforms/logTransforms'

function initLogs(block: any, receipts: ExternalEthReceipt[]): EthLog[] {
    let logs = []
    for (let receipt of receipts) {
        for (let log of receipt.logs) {
            logs.push(externalToInternalLog(log as ExternalEthLog, block))
        }
    }
    return logs
}

export default initLogs
