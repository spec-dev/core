import { AlchemyWeb3, TransactionReceipt, TransactionReceiptsParams, TransactionReceiptsResponse } from '@alch/alchemy-web3'
import { ExternalEthReceipt } from '../types'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 34
}

async function getBlockReceipts(web3: AlchemyWeb3, params: TransactionReceiptsParams): Promise<ExternalEthReceipt[]> {
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

        if (error && error.message && error.message.toLowerCase().includes('being processed')) {
            console.log('still processing block...')
            setTimeout(() => {
                res(null)
            }, timing.NOT_READY_DELAY)
        } else if (error) {
            throw `Error fetching receipts for ${(params as any).blockHash || (params as any).blockNumber}: ${error.message}`
        } else if (!resp.receipts || !resp.receipts.length) {
            throw `Error fetching receipts for ${(params as any).blockHash || (params as any).blockNumber}: receipts was empty.`
        } else {
            res(resp.receipts)
        }
    })
}

export default getBlockReceipts