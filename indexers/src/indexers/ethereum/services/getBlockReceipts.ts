import {
    AlchemyWeb3,
    TransactionReceipt,
    TransactionReceiptsParams,
    TransactionReceiptsResponse,
} from '@alch/alchemy-web3'
import { ExternalEthReceipt } from '../types'
import { logger, sleep } from '../../../../../shared'
import config from '../../../config'

async function getBlockReceipts(
    web3: AlchemyWeb3,
    params: TransactionReceiptsParams,
    blockNumber: number,
    chainId: number
): Promise<ExternalEthReceipt[]> {
    if (config.IS_RANGE_MODE) return []
    let receipts = null
    let numAttempts = 0
    try {
        while (receipts === null && numAttempts < config.MAX_ATTEMPTS) {
            receipts = await fetchReceipts(web3, params)
            if (receipts === null) {
                await sleep(config.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching receipts ${blockNumber}: ${err}`
    }

    if (receipts === null) {
        throw `Out of attempts - No receipts found for block ${blockNumber}.`
    } else if (receipts.length === 0) {
        logger.info(`[${chainId}:${blockNumber}] No receipts this block.`)
    } else {
        logger.info(`[${chainId}:${blockNumber}] Got receipts with logs.`)
    }

    return receipts.map((r) => r as unknown as ExternalEthReceipt)
}

async function fetchReceipts(
    web3: AlchemyWeb3,
    params: TransactionReceiptsParams
): Promise<TransactionReceipt[] | null> {
    let resp: TransactionReceiptsResponse
    let error
    try {
        resp = await web3.alchemy.getTransactionReceipts(params)
    } catch (err) {
        error = err
    }
    if (!resp || error) {
        return null
    } else if (error) { // not used per change in above if statement (hack right now)
        throw `Error fetching receipts for ${
            (params as any).blockHash || (params as any).blockNumber
        }: ${error.message}`
    } else {
        return resp.receipts || []
    }
}

export default getBlockReceipts
