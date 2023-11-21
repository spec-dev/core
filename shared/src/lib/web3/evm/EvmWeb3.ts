import Web3 from 'web3'
import logger from '../../logger'
import config from '../../config'
import { StringKeyMap } from '../../types'
import { sleep } from '../../utils/time'
import { numberToHex, toChunks } from '../../utils/formatters'
import { EvmBlock } from '../../shared-tables/db/entities/EvmBlock'
import { EvmTransaction } from '../../shared-tables/db/entities/EvmTransaction'
import { EvmLog } from '../../shared-tables/db/entities/EvmLog'
import { EvmTrace } from '../../shared-tables/db/entities/EvmTrace'
import { isNumber } from '../../utils/validators'
import {
    EvmWeb3Options,
    ExternalEvmBlock,
    ExternalEvmReceipt,
    ExternalEvmLog,
    ExternalEvmParityTrace,
    ExternalEvmDebugTrace,
} from './types'
import {
    externalToInternalBlock,
    externalToInternalLog,
    externalToInternalParityTraces,
    externalToInternalDebugTraces,
} from './transforms'
import chainIds from '../../utils/chainIds'
import fetch from 'cross-fetch'

export const blockTags = {
    LATEST: 'latest',
    EARLIEST: 'earliest',
    PENDING: 'pending',
    SAFE: 'safe',
    FINALIZED: 'finalized',
}

class EvmWeb3 {
    url: string

    web3: Web3

    canGetBlockReceipts: boolean

    canGetParityTraces: boolean

    supportsFinalizedTag: boolean

    confirmationsUntilFinalized: number | null

    finalityScanInterval: number | null

    finalityScanOffsetLeft: number | null

    finalityScanOffsetRight: number | null

    isRangeMode: boolean

    ignoreLogsOnErrorCodes: number[] = [-32600, -32000]

    httpRequestTimeout: number = 10000

    hittingGatewayErrors: boolean = false

    wsRpcTimeout: number | null

    get isWebsockets(): boolean {
        return this.url.startsWith('ws://') || this.url.startsWith('wss://')
    }

    get isQN(): boolean {
        return this.url.includes('quiknode')
    }

    get isAlchemy(): boolean {
        return this.url.includes('alchemy')
    }

    constructor(url: string, options?: EvmWeb3Options) {
        options = options || {}
        this.url = url
        this.wsRpcTimeout = options.wsRpcTimeout || null
        this.web3 = this.isWebsockets ? this._newWebsocketConnection() : this._newHttpConnection()
        this.canGetBlockReceipts = options.canGetBlockReceipts || false
        this.canGetParityTraces = options.canGetParityTraces || false
        this.supportsFinalizedTag = options.supportsFinalizedTag !== false
        this.confirmationsUntilFinalized = options.confirmationsUntilFinalized || null
        this.finalityScanInterval = options.finalityScanInterval || null
        this.finalityScanOffsetLeft = options.finalityScanOffsetLeft || null
        this.finalityScanOffsetRight = options.finalityScanOffsetRight || null
        this.isRangeMode = options.isRangeMode || false
    }

    // == Block & Transactions ==============

    async getBlock(
        blockHash?: string,
        blockNumber?: number,
        chainId?: string,
        withTxs: boolean = true
    ): Promise<{
        block: EvmBlock
        transactions: EvmTransaction[]
        unixTimestamp: number
    }> {
        if (!blockHash && !isNumber(blockNumber)) {
            throw `[${chainId}] Block hash or number required`
        }

        const blockId = blockHash || blockNumber
        let externalBlock = null
        let numAttempts = 0
        try {
            while (externalBlock === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                externalBlock = await this._getBlock(blockId, chainId, withTxs)
                if (externalBlock === null) {
                    await sleep(
                        config.EXPO_BACKOFF_FACTOR ** numAttempts * config.EXPO_BACKOFF_DELAY
                    )
                }
                numAttempts += 1
            }
        } catch (err) {
            throw `[${chainId}] Error fetching block ${blockId}: ${err}`
        }

        if (externalBlock === null) {
            throw `[${chainId}] Out of attempts - No block found for ${blockId}.`
        }

        this.isRangeMode ||
            logger.info(`[${chainId}:${blockNumber || blockHash}] Got block with txs.`)

        return externalToInternalBlock(externalBlock)
    }

    async blockHashForNumber(blockNumber: number): Promise<string> {
        const { block } = await this.getBlock(null, blockNumber, null, false)
        return block.hash
    }

    async latestFinalizedBlockNumber(): Promise<number> {
        if (!this.supportsFinalizedTag) {
            throw 'This chain does not support the "finalized" block tag'
        }
        const { block } = await this.getBlock(blockTags.FINALIZED, null, null, false)
        return block.number
    }

    async _getBlock(
        blockNumberOrHash: number | string,
        chainId?: string,
        withTxs: boolean = true
    ): Promise<ExternalEvmBlock | null> {
        let externalBlock: ExternalEvmBlock
        let error
        try {
            externalBlock = (await this.web3.eth.getBlock(
                blockNumberOrHash,
                // @ts-ignore
                withTxs
            )) as unknown as ExternalEvmBlock
        } catch (err) {
            error = err
        }
        if (error) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}]] Error fetching block ${blockNumberOrHash}: ${error}. Retrying...`
                )
            return null
        }

        return externalBlock
    }

    // == Receipts ================

    async getBlockReceipts(
        blockHash?: string,
        blockNumber?: number,
        txHashes?: string[],
        chainId?: string
    ): Promise<ExternalEvmReceipt[]> {
        if (!blockHash && !isNumber(blockNumber)) {
            throw `[${chainId}] Block hash or number required`
        }

        let receipts = null
        let hittingGatewayErrors = false
        let numAttempts = 0
        try {
            while (receipts === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                ;[receipts, hittingGatewayErrors] = await this._getBlockReceipts(
                    blockHash,
                    blockNumber,
                    txHashes,
                    chainId
                )
                if (receipts === null) {
                    await sleep(
                        config.EXPO_BACKOFF_FACTOR ** numAttempts * config.EXPO_BACKOFF_DELAY
                    )
                }
                numAttempts += 1
            }
        } catch (err) {
            throw `[${chainId}] Error fetching receipts for block ${
                blockNumber || blockHash
            }: ${err}`
        }

        if (receipts === null) {
            if (hittingGatewayErrors) {
                this.hittingGatewayErrors = true
            }
            throw `[${chainId}] Out of attempts - No receipts found for ${
                blockNumber || blockHash
            }.`
        } else if (!receipts.length) {
            this.isRangeMode ||
                logger.info(`[${chainId}:${blockNumber || blockHash}] No receipts this block.`)
        } else {
            this.isRangeMode ||
                logger.info(`[${chainId}:${blockNumber || blockHash}] Got receipts with logs.`)
        }

        return receipts
    }

    async _getBlockReceipts(
        blockHash?: string,
        blockNumber?: number,
        txHashes?: string[],
        chainId?: string
    ): Promise<[ExternalEvmReceipt[] | null, boolean]> {
        let method, params
        if (this.isAlchemy) {
            method = 'alchemy_getTransactionReceipts'
            params = blockHash ? [{ blockHash }] : [{ blockNumber: numberToHex(blockNumber) }]
        } else if (this.canGetBlockReceipts) {
            method = 'eth_getBlockReceipts'
            params = [numberToHex(blockNumber)]
        } else if (this.isQN) {
            method = 'qn_getReceipts'
            params = [numberToHex(blockNumber)]
        } else {
            const chunks = toChunks(txHashes, 30)
            const receipts = []
            for (const chunk of chunks) {
                await sleep(80)
                receipts.push(
                    ...(await Promise.all(
                        chunk.map((hash) =>
                            this._getTxReceipt(blockHash, blockNumber, hash, chainId)
                        )
                    ))
                )
            }
            return [receipts.filter((v) => !!v), false]
        }

        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.httpRequestTimeout)
        let resp, error
        try {
            resp = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    method,
                    params,
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
            })
        } catch (err) {
            error = err
        }
        clearTimeout(timer)

        if (error) {
            const message = error.message || error.toString() || ''
            const wasAborted = message.toLowerCase().includes('aborted')
            wasAborted ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error fetching reciepts: ${error}. Will retry.`
                )
            return [null, false]
        }

        if (resp.status === 503) {
            logger.error(
                `[${chainId}:${
                    blockNumber || blockHash
                }] 503 Gateway Error — while fetching block receipts`
            )
            return [null, true]
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error parsing json response while fetching receipts: ${err}`
                )
            return [null, false]
        }

        if (data?.error) {
            this.isRangeMode ||
                this.ignoreLogsOnErrorCodes.includes(data.error?.code) ||
                logger.error(
                    `[${chainId}:${blockNumber || blockHash}] Error fetching reciepts: ${
                        data.error?.code
                    } - ${data.error?.message}. Will retry.`
                )
            return [null, false]
        }
        if (!data?.result || data.result.error) return [null, false]

        return [this.isAlchemy ? data.result.receipts : data.result, false]
    }

    async _getTxReceipt(
        blockHash?: string,
        blockNumber?: number,
        txHash?: string,
        chainId?: string
    ): Promise<[ExternalEvmReceipt | null, boolean]> {
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.httpRequestTimeout)
        let resp, error
        try {
            resp = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    method: 'eth_getTransactionReceipt',
                    params: [txHash],
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
            })
        } catch (err) {
            error = err
        }
        clearTimeout(timer)

        if (error) {
            const message = error.message || error.toString() || ''
            const wasAborted = message.toLowerCase().includes('aborted')
            wasAborted ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error fetching tx reciept: ${error}. Will retry.`
                )
            return null
        }

        if (resp.status === 503) {
            logger.error(
                `[${chainId}:${
                    blockNumber || blockHash
                }] 503 Gateway Error — while fetching tx receipt`
            )
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error parsing json response while fetching tx receipt: ${err}`
                )
            return null
        }

        if (data?.error) {
            this.isRangeMode ||
                this.ignoreLogsOnErrorCodes.includes(data.error?.code) ||
                logger.error(
                    `[${chainId}:${blockNumber || blockHash}] Error fetching tx receipt: ${
                        data.error?.code
                    } - ${data.error?.message}. Will retry.`
                )
            return null
        }
        if (!data?.result || data.result.error) return null

        return data.result
    }

    // == Logs ====================

    async getLogs(blockHash?: string, blockNumber?: number, chainId?: string): Promise<EvmLog[]> {
        if (!blockHash && !isNumber(blockNumber)) {
            throw `[${chainId}] Block hash or number required`
        }
        if (this.isWebsockets) {
            throw `[${chainId}] Can only resolve logs over HTTP at the moment`
        }

        let logs = null
        let hittingGatewayErrors = false
        let numAttempts = 0
        try {
            while (logs === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                ;[logs, hittingGatewayErrors] = await this._getLogs(blockHash, blockNumber, chainId)
                if (logs === null) {
                    await sleep(
                        config.EXPO_BACKOFF_FACTOR ** numAttempts * config.EXPO_BACKOFF_DELAY
                    )
                }
                numAttempts += 1
            }
        } catch (err) {
            throw `[${chainId}] Error fetching logs for block ${blockNumber || blockHash}: ${err}`
        }

        if (logs === null) {
            if (hittingGatewayErrors) {
                this.hittingGatewayErrors = true
            }
            throw `[${chainId}] Out of attempts - No logs found for ${blockNumber || blockHash}.`
        } else if (!logs.length) {
            this.isRangeMode ||
                logger.info(`[${chainId}:${blockNumber || blockHash}] No logs this block.`)
        } else {
            this.isRangeMode || logger.info(`[${chainId}:${blockNumber || blockHash}] Got logs.`)
        }

        return logs.map(externalToInternalLog)
    }

    async _getLogs(
        blockHash?: string,
        blockNumber?: number,
        chainId?: string
    ): Promise<[ExternalEvmLog[] | null, boolean]> {
        let params
        if (blockHash) {
            params = [{ blockHash }]
        } else {
            const hexBlockNumber = numberToHex(blockNumber)
            params = [{ fromBlock: hexBlockNumber, toBlock: hexBlockNumber }]
        }

        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.httpRequestTimeout)
        let resp, error
        try {
            resp = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    method: 'eth_getLogs',
                    params,
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
            })
        } catch (err) {
            error = err
        }
        clearTimeout(timer)

        if (error) {
            const message = error.message || error.toString() || ''
            const wasAborted = message.toLowerCase().includes('aborted')
            wasAborted ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error fetching reciepts: ${error}. Will retry.`
                )
            return [null, false]
        }

        if (resp.status === 503) {
            logger.error(
                `[${chainId}:${blockNumber || blockHash}] 503 Gateway Error — while fetching logs`
            )
            return [null, true]
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}:${
                        blockNumber || blockHash
                    }] Error parsing json response while fetching logs: ${err}`
                )
            return [null, false]
        }

        if (data?.error) {
            this.isRangeMode ||
                this.ignoreLogsOnErrorCodes.includes(data.error?.code) ||
                logger.error(
                    `[${chainId}:${blockNumber || blockHash}] Error fetching logs: ${
                        data.error?.code
                    } - ${data.error?.message}. Will retry.`
                )
            return [null, false]
        }
        if (!data?.result || data.result.error) return [null, false]

        return [data.result, false]
    }

    // == Traces ===================

    async getTraces(
        blockHash?: string,
        blockNumber?: number,
        chainId?: string,
        forceDebug?: boolean
    ): Promise<EvmTrace[]> {
        if (!blockHash && !isNumber(blockNumber)) {
            throw `[${chainId}] Block hash or number required`
        }
        if (this.canGetParityTraces && !isNumber(blockNumber)) {
            throw `[${chainId}] Block number required to fetch parity traces`
        }
        if (!this.canGetParityTraces && !(blockHash && isNumber(blockNumber))) {
            throw `[${chainId}] Both block hash and number required when fetching debug traces`
        }
        if (this.isWebsockets) {
            throw `[${chainId}] Can only resolve traces over HTTP at the moment`
        }

        let externalTraces = null
        let hittingGatewayErrors = false
        let numAttempts = 0
        try {
            while (externalTraces === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                ;[externalTraces, hittingGatewayErrors] =
                    this.canGetParityTraces && !forceDebug
                        ? await this._getParityTraces(blockNumber, chainId)
                        : await this._getDebugTraces(blockHash, blockNumber, chainId)
                if (externalTraces === null) {
                    await sleep(config.EXPO_BACKOFF_FACTOR ** numAttempts * 50)
                }
                numAttempts += 1
            }
        } catch (err) {
            throw `[${chainId}] Error fetching traces for block ${blockNumber || blockHash}: ${err}`
        }

        if (externalTraces === null) {
            if (hittingGatewayErrors) {
                this.hittingGatewayErrors = true
            }
            throw `[${chainId}] Out of attempts - No traces found for block ${
                blockNumber || blockHash
            }...`
        } else if (externalTraces.length === 0) {
            this.isRangeMode ||
                logger.info(`[${chainId}:${blockNumber || blockHash}] No traces this block.`)
        } else {
            this.isRangeMode || logger.info(`[${chainId}:${blockNumber || blockHash}] Got traces.`)
        }

        return this.canGetParityTraces && !forceDebug
            ? externalToInternalParityTraces(externalTraces)
            : externalToInternalDebugTraces(externalTraces, blockNumber, blockHash)
    }

    async _getParityTraces(
        blockNumber: number,
        chainId?: string
    ): Promise<[ExternalEvmParityTrace[] | null, boolean]> {
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.httpRequestTimeout)
        let resp, error
        try {
            resp = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    method: 'trace_block',
                    params: [numberToHex(blockNumber)],
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
            })
        } catch (err) {
            error = err
        }
        clearTimeout(timer)

        if (error) {
            const message = error.message || error.toString() || ''
            const wasAborted = message.toLowerCase().includes('aborted')
            wasAborted ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error fetching traces: ${error}. Will retry.`
                )
            return [null, false]
        }

        if (resp.status === 503) {
            logger.error(`[${chainId}:${blockNumber}] 503 Gateway Error — while fetching traces`)
            return [null, true]
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error parsing json response while fetching traces: ${err}`
                )
            return [null, false]
        }

        if (data?.error) {
            this.isRangeMode ||
                this.ignoreLogsOnErrorCodes.includes(data.error?.code) ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error fetching traces: ${data.error?.code} - ${data.error?.message}. Will retry.`
                )
            return [null, false]
        }
        if (!data?.result || data.result.error) return [null, false]

        return [data.result, false]
    }

    async _getDebugTraces(
        blockHash: string,
        blockNumber: number,
        chainId?: string
    ): Promise<[ExternalEvmDebugTrace[] | null, boolean]> {
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.httpRequestTimeout)
        let resp, error
        try {
            resp = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    method: 'debug_traceBlockByHash',
                    params: [blockHash, { tracer: 'callTracer' }],
                    id: 1,
                    jsonrpc: '2.0',
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
            })
        } catch (err) {
            error = err
        }
        clearTimeout(timer)

        if (error) {
            const message = error.message || error.toString() || ''
            const wasAborted = message.toLowerCase().includes('aborted')
            wasAborted ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error fetching traces: ${error}. Will retry.`
                )
            return [null, false]
        }

        if (resp.status === 503) {
            logger.error(`[${chainId}:${blockNumber}] 503 Gateway Error — while fetching traces`)
            return [null, true]
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            this.isRangeMode ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error parsing json response while fetching traces: ${err}`
                )
            return [null, false]
        }

        if (data?.error) {
            this.isRangeMode ||
                this.ignoreLogsOnErrorCodes.includes(data.error?.code) ||
                logger.error(
                    `[${chainId}:${blockNumber}] Error fetching traces: ${data.error?.code} - ${data.error?.message}. Will retry.`
                )
            return [null, false]
        }
        if (!data?.result || data.result.error) return [null, false]

        return [data.result, false]
    }

    // == Provider-specific ==================

    // == Subscriptions ===================

    subscribeToNewHeads(callback: (error: Error, blockHeader: any) => void) {
        if (!this.isWebsockets) {
            throw 'Websockets required to subscribe to new heads'
        }
        this.web3.eth.subscribe('newBlockHeaders', callback)
    }

    // == Connections ===================

    _newHttpConnection(): Web3 {
        return new Web3(this.url)
    }

    _newWebsocketConnection(): Web3 {
        const options: StringKeyMap = {
            clientConfig: {
                keepalive: true,
                keepaliveInterval: 60000,
            },
            reconnect: {
                auto: true,
                delay: 300,
                maxAttempts: 100,
                onTimeout: true,
            },
        }
        if (this.wsRpcTimeout !== null) {
            options.timeout = this.wsRpcTimeout
        }
        return new Web3(new Web3.providers.WebsocketProvider(this.url, options))
    }
}

export function newEthereumWeb3(
    url: string,
    isRangeMode?: boolean,
    wsRpcTimeout?: number
): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: true,
        canGetParityTraces: true,
        finalityScanOffsetLeft: 400,
        finalityScanOffsetRight: 5,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newPolygonWeb3(url: string, isRangeMode?: boolean, wsRpcTimeout?: number): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: true,
        canGetParityTraces: url.includes('quiknode'),
        supportsFinalizedTag: false,
        confirmationsUntilFinalized: 1800,
        finalityScanOffsetLeft: 300,
        finalityScanOffsetRight: 10,
        finalityScanInterval: 80000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newBaseWeb3(url: string, isRangeMode?: boolean, wsRpcTimeout?: number): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: true,
        finalityScanOffsetLeft: 900,
        finalityScanOffsetRight: 10,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newOptimismWeb3(
    url: string,
    isRangeMode?: boolean,
    wsRpcTimeout?: number
): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: true,
        finalityScanOffsetLeft: 900,
        finalityScanOffsetRight: 10,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newArbitrumWeb3(
    url: string,
    isRangeMode?: boolean,
    wsRpcTimeout?: number
): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: true,
        finalityScanOffsetLeft: 900,
        finalityScanOffsetRight: 10,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newPGNWeb3(url: string, isRangeMode?: boolean, wsRpcTimeout?: number): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: true,
        finalityScanOffsetLeft: 200,
        finalityScanOffsetRight: 10,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newCeloWeb3(url: string, isRangeMode?: boolean, wsRpcTimeout?: number): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: false,
        confirmationsUntilFinalized: 400,
        finalityScanOffsetLeft: 400,
        finalityScanOffsetRight: 7,
        finalityScanInterval: 180000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newLineaWeb3(url: string, isRangeMode?: boolean, wsRpcTimeout?: number): EvmWeb3 {
    return new EvmWeb3(url, {
        canGetBlockReceipts: false,
        canGetParityTraces: false,
        supportsFinalizedTag: false,
        confirmationsUntilFinalized: 300,
        finalityScanOffsetLeft: 50,
        finalityScanOffsetRight: 5,
        finalityScanInterval: 360000,
        isRangeMode,
        wsRpcTimeout,
    })
}

export function newEvmWeb3ForChainId(
    chainId: string,
    url: string,
    isRangeMode?: boolean,
    wsRpcTimeout?: number
): EvmWeb3 {
    switch (chainId) {
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
        case chainIds.SEPOLIA:
            return newEthereumWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return newPolygonWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.BASE:
            return newBaseWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.OPTIMISM:
            return newOptimismWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.ARBITRUM:
            return newArbitrumWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.PGN:
            return newPGNWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.CELO:
            return newCeloWeb3(url, isRangeMode, wsRpcTimeout)
        case chainIds.LINEA:
            return newLineaWeb3(url, isRangeMode, wsRpcTimeout)
        default:
            throw `Invalid chain id: ${chainId}`
    }
}

export default EvmWeb3
