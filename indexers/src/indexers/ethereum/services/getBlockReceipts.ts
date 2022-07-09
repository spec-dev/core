import { AlchemyWeb3, TransactionReceipt, TransactionReceiptsResponse } from '@alch/alchemy-web3'

async function getBlockReceipts(web3: AlchemyWeb3, blockNumber: number): Promise<TransactionReceipt[]> {
    let resp: TransactionReceiptsResponse
    try {
        resp = await web3.alchemy.getTransactionReceipts({ blockNumber })
    } catch (err) {
        throw `Error fetching receipts for block ${blockNumber}: ${err}`
    }

    if (!resp.receipts) {
        throw `Error fetching receipts for block ${blockNumber}: receipts was null`
    }

    return resp.receipts
}

export default getBlockReceipts