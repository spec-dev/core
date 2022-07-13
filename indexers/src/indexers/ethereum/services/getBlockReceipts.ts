import { AlchemyWeb3, TransactionReceipt, TransactionReceiptsParams, TransactionReceiptsResponse } from '@alch/alchemy-web3'
import { ExternalEthReceipt } from '../types'
import { logger } from 'shared'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 34
}

async function getBlockReceipts(
    web3: AlchemyWeb3,
    params: TransactionReceiptsParams,
    blockNumber: number, 
    chainId: number,
): Promise<ExternalEthReceipt[]> {
    let receipts = null
    let numAttempts = 0

    try {
        while (receipts === null && numAttempts < timing.MAX_ATTEMPTS) {
            receipts = await fetchReceipts(web3, params)
            numAttempts += 1
        }
    } catch (err) {
        throw err
    }

    if (receipts === null) {
        // TODO: Need to re-enqueue block to retry with top priority
        throw `Out of attempts - No receipts found for block ${blockNumber}...`
    } else if (receipts.length === 0) {
        logger.info(`[${chainId}:${blockNumber}] No receipts this block.`)
    } else {
        logger.info(`[${chainId}:${blockNumber}] Got receipts with logs.`)
    }

    return receipts.map(r => (r as unknown as ExternalEthReceipt))
}

async function fetchReceipts(web3: AlchemyWeb3, params: TransactionReceiptsParams): Promise<TransactionReceipt[] | null> {
    return new Promise(async (res, _) => {
        let resp: TransactionReceiptsResponse
        let error
        try {
            resp = await web3.alchemy.getTransactionReceipts(params)
        } catch (err) {
            error = err
        }

        // Retry if empty or still processing.
        if (!resp || (error && error.message && error.message.toLowerCase().includes('being processed'))) {
            setTimeout(() => res(null), timing.NOT_READY_DELAY)
        } else if (error) {
            throw `Error fetching receipts for ${(params as any).blockHash || (params as any).blockNumber}: ${error.message}`
        } 
        else {
            res(resp.receipts || [])
        }
    })
}

export default getBlockReceipts