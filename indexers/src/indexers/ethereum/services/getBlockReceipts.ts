import {
    TransactionReceipt,
    TransactionReceiptsParams,
    TransactionReceiptsResponse,
} from '@alch/alchemy-web3'
import { ExternalEthReceipt } from '../types'
import { logger, sleep } from '../../../../../shared'
import config from '../../../config'

async function getBlockReceipts(
    blockHash: string,
    blockNumber: number,
    chainId: string
): Promise<ExternalEthReceipt[]> {
    let receipts = null
    let numAttempts = 0
    try {
        while (receipts === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            receipts = await fetchReceipts(web3, blockHash, chainId)
            if (receipts === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching receipts ${blockNumber}: ${err}`
    }
    receipts = receipts || []

    if (!receipts.length) {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] No receipts this block.`)
    } else {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got receipts with logs.`)
    }

    return receipts.map((r) => r as unknown as ExternalEthReceipt)
}

async function fetchReceipts(
    blockHash: string,
    chainId: string,
): Promise<TransactionReceipt[] | null> {
    let resp: TransactionReceiptsResponse
    let error
    try {
        resp = await web3.alchemy.getTransactionReceipts(params)
    } catch (err) {
        error = err
    }
    if (!resp) {
        return null
    } else if (error) {
        config.IS_RANGE_MODE || logger.error(
            `[${chainId}:${blockNumber}] Error fetching receipts for ${
                (params as any).blockHash || (params as any).blockNumber
            }: ${error.message}`
        )
        return null
    } else {
        return resp.receipts || []
    }
}

export default getBlockReceipts
