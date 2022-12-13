import {
    AlchemyWeb3,
    TransactionReceipt,
    TransactionReceiptsParams,
    TransactionReceiptsResponse,
} from '@alch/alchemy-web3'
import { ExternalPolygonReceipt } from '../types'
import { logger, sleep } from '../../../../../shared'
import config from '../../../config'

async function getBlockReceipts(
    web3: AlchemyWeb3,
    params: TransactionReceiptsParams,
    blockNumber: number,
    chainId: string
): Promise<ExternalPolygonReceipt[]> {
    let receipts = null
    let numAttempts = 0
    try {
        while (receipts === null && numAttempts < config.MAX_ATTEMPTS) {
            receipts = await fetchReceipts(web3, params, blockNumber, chainId)
            if (receipts === null) {
                await sleep(config.NOT_READY_DELAY)
            } else if (receipts.length === 0) {
                await sleep(config.NOT_READY_DELAY)

                // Keep trying on empty up to 10 attempts.
                if (numAttempts <= 10) {
                    receipts = null
                }
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

    return receipts.map((r) => r as unknown as ExternalPolygonReceipt)
}

async function fetchReceipts(
    web3: AlchemyWeb3,
    params: TransactionReceiptsParams,
    blockNumber: number,
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
