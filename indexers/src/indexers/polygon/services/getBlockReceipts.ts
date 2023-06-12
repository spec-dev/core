import { ExternalPolygonReceipt } from '../types'
import { logger, sleep, StringKeyMap } from '../../../../../shared'
import config from '../../../config'
import fetch from 'cross-fetch'

async function getBlockReceipts(
    hexBlockNumber: string,
    blockNumber: number,
    chainId: string
): Promise<ExternalPolygonReceipt[]> {
    let receipts = null
    let numAttempts = 0
    try {
        while (receipts === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            receipts = await fetchReceipts(hexBlockNumber, blockNumber, chainId)
            if (receipts === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching receipts for block ${blockNumber}: ${err}`
    }
    receipts = receipts || []

    if (!receipts.length) {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] No receipts this block.`)
    } else {
        config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got receipts with logs.`)
    }

    return receipts
}

async function fetchReceipts(
    hexBlockNumber: string,
    blockNumber: number,
    chainId: string,
): Promise<ExternalPolygonReceipt[] | null> {
    const isAlchemy = config.RPC_REST_URL.includes('alchemy')
    const method = isAlchemy ? 'alchemy_getTransactionReceipts' : 'eth_getBlockReceipts'
    const params = isAlchemy ? [{ blockNumber: hexBlockNumber }] : [hexBlockNumber]

    let resp, error
    try {
        resp = await fetch(config.RPC_REST_URL, {
            method: 'POST',
            body: JSON.stringify({
                method,
                params,
                id: 1,
                jsonrpc: '2.0',
            }),
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (err) {
        error = err
    }

    if (error) {
        logger.error(`[${chainId}:${blockNumber}] Error fetching reciepts: ${error}. Will retry`)
        return null
    }

    let data: StringKeyMap = {}
    try {
        data = await resp.json()
    } catch (err) {
        config.IS_RANGE_MODE ||
            logger.error(
                `Error parsing json response while fetching receipts for block ${blockNumber}: ${err}`
            )
        data = {}
    }

    if (data?.error) {
        [-32600, 32000].includes(data.error?.code) || logger.error(
            `[${chainId}:${blockNumber}] Error fetching reciepts: ${data.error?.code} - ${data.error?.message}. Will retry`
        )
        return null
    }
    if (!data?.result) return null

    return isAlchemy ? data.result.receipts : data.result
}

export default getBlockReceipts