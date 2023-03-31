import config from '../config'
import {
    logger,
    NewReportedHead,
    IndexedBlock,
    StringKeyMap,
    PolygonBlock,
    PolygonLog,
    PolygonTransaction,
    PolygonTrace,
    PolygonContract,
    range,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    fullPolygonTraceUpsertConfig,
    fullPolygonContractUpsertConfig,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    toChunks,
    Erc20Token,
    NftCollection,
    snakeToCamel,
} from '../../../shared'
import { exit } from 'process'
import { getIndexer } from '../indexers'

class PolygonRangeWorker {

    from: number

    to: number | null

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    batchBlockNumbersIndexed: number[] = []

    batchExistingBlocksMap: { [key: number]: IndexedBlock } = {}

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    constructor(from: number, to?: number | null, groupSize?: number, saveBatchMultiple?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const groupBlockNumbers = range(start, end)
            await this._indexBlockGroup(groupBlockNumbers)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.batchResults.length) {
            try {
                await this._saveBatchResults(this.batchResults)
            } catch (err) {
                logger.error(`Error saving batch: ${err}`)
                return
            } 
        }
        logger.info('DONE')
        exit()
    }

    async _indexBlockGroup(blockNumbers: number[]) {
        const indexResultPromises = []
        for (const blockNumber of blockNumbers) {
            indexResultPromises.push(this._indexBlock(blockNumber))
        }

        logger.info(`Indexing ${blockNumbers[0]} --> ${blockNumbers[blockNumbers.length - 1]}...`)

        const indexResults = await Promise.all(indexResultPromises)
        this.batchResults.push(...indexResults)
        this.saveBatchIndex++

        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchResults = [...this.batchResults]
            try {
                await this._saveBatchResults(batchResults)
            } catch (err) {
                logger.error(`Error saving batch: ${err}`)
                return
            }
            this.batchResults = []
        }
    }

    async _indexBlock(blockNumber: number): Promise<StringKeyMap | null> {
        let result
        try {
            result = await getIndexer(this._atNumber(blockNumber)).perform()
        } catch (err) {
            logger.error(`Error indexing block ${blockNumber}:`, err)
            return null
        }
        if (!result) return null

        return result as StringKeyMap
    }

    _atNumber(blockNumber: number): NewReportedHead {
        return {
            id: 0,
            chainId: config.CHAIN_ID,
            blockNumber,
            blockHash: null,
            replace: false,
            force: true,
        }
    }

    async _saveBatches(batchResults: any[]) {
        try {
            await this._saveBatchResults(batchResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
        }
    }

    async _saveBatchResults(results: any[]) {
        let blocks = []
        let transactions = []
        let logs = []
        let traces = []
        let contracts = []
        let erc20Tokens = [] 
        let nftCollections = []

        for (const result of results) {
            if (!result) continue
            blocks.push({ ...result.block, timestamp: () => result.pgBlockTimestamp })
            transactions.push(
                ...result.transactions.map((t) => ({
                    ...t,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            logs.push(
                ...result.logs.map((l) => ({ 
                    ...l, 
                    blockTimestamp: () => result.pgBlockTimestamp 
                }))
            )
            traces.push(
                ...result.traces.map((t) => ({
                    ...t,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            contracts.push(
                ...result.contracts.map((c) => ({
                    ...c,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            erc20Tokens.push(
                ...result.erc20Tokens.map((e) => ({
                    ...e,
                    blockTimestamp: () => result.pgBlockTimestamp,
                    lastUpdated: () => result.pgBlockTimestamp,
                }))
            )
            nftCollections.push(
                ...result.nftCollections.map((n) => ({
                    ...n,
                    blockTimestamp: () => result.pgBlockTimestamp,
                    lastUpdated: () => result.pgBlockTimestamp,
                }))
            )
        }

        if (!this.upsertConstraints.block && blocks.length) {
            this.upsertConstraints.block = fullPolygonBlockUpsertConfig(blocks[0])
        }
        if (!this.upsertConstraints.transaction && transactions.length) {
            this.upsertConstraints.transaction = fullPolygonTransactionUpsertConfig(transactions[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullPolygonLogUpsertConfig(logs[0])
        }
        if (!this.upsertConstraints.trace && traces.length) {
            this.upsertConstraints.trace = fullPolygonTraceUpsertConfig(traces[0])
        }
        if (!this.upsertConstraints.contract && contracts.length) {
            this.upsertConstraints.contract = fullPolygonContractUpsertConfig(contracts[0])
        }
        if (!this.upsertConstraints.erc20Token && erc20Tokens.length) {
            this.upsertConstraints.erc20Token = fullErc20TokenUpsertConfig()
        }
        if (!this.upsertConstraints.nftCollection && nftCollections.length) {
            this.upsertConstraints.nftCollection = fullNftCollectionUpsertConfig()
        }

        blocks = this.upsertConstraints.block
            ? uniqueByKeys(blocks, this.upsertConstraints.block[1])
            : blocks

        transactions = this.upsertConstraints.transaction
            ? uniqueByKeys(transactions, this.upsertConstraints.transaction[1])
            : transactions

        logs = this.upsertConstraints.log 
            ? uniqueByKeys(logs, this.upsertConstraints.log[1].map(snakeToCamel)) : logs

        traces = this.upsertConstraints.trace
            ? uniqueByKeys(traces, this.upsertConstraints.trace[1])
            : traces

        contracts = this.upsertConstraints.contract
            ? uniqueByKeys(contracts, this.upsertConstraints.contract[1])
            : contracts

        erc20Tokens = this.upsertConstraints.erc20Token
            ? uniqueByKeys(erc20Tokens, this.upsertConstraints.erc20Token[1].map(snakeToCamel))
            : erc20Tokens

        nftCollections = this.upsertConstraints.nftCollection
            ? uniqueByKeys(nftCollections, this.upsertConstraints.nftCollection[1].map(snakeToCamel))
            : nftCollections

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertBlocks(blocks, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
                this._upsertTraces(traces, tx),
                this._upsertContracts(contracts, tx),
                this._upsertErc20Tokens(erc20Tokens, tx),
                this._upsertNftCollections(nftCollections, tx),
            ])
        })
    }

    async _upsertBlocks(blocks: StringKeyMap[], tx: any) {
        if (!blocks.length) return
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await tx
            .createQueryBuilder()
            .insert()
            .into(PolygonBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any): Promise<StringKeyMap[]> {
        if (!logs.length) return []
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        return (
            await Promise.all(
                toChunks(logs, this.chunkSize).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(PolygonLog)
                        .values(chunk)
                        .orUpdate(updateLogCols, conflictLogCols)
                        .returning('*')
                        .execute()
                })
            )
        ).map(result => result.generatedMaps).flat()
    }

    async _upsertTraces(traces: StringKeyMap[], tx: any) {
        if (!traces.length) return
        logger.info(`Saving ${traces.length} traces...`)
        const [updateTraceCols, conflictTraceCols] = this.upsertConstraints.trace
        await Promise.all(
            toChunks(traces, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonTrace)
                    .values(chunk)
                    .orUpdate(updateTraceCols, conflictTraceCols)
                    .execute()
            })
        )
    }

    async _upsertContracts(contracts: StringKeyMap[], tx: any) {
        if (!contracts.length) return
        logger.info(`Saving ${contracts.length} contracts...`)
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.contract
        await Promise.all(
            toChunks(contracts, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }

    async _upsertErc20Tokens(erc20Tokens: StringKeyMap[], tx: any) {
        if (!erc20Tokens.length) return
        logger.info(`Saving ${erc20Tokens.length} erc20_tokens...`)
        const [updateCols, conflictCols] = this.upsertConstraints.erc20Token
        await Promise.all(
            toChunks(erc20Tokens, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Token)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }

    async _upsertNftCollections(nftCollections: StringKeyMap[], tx: any) {
        if (!nftCollections.length) return
        logger.info(`Saving ${nftCollections.length} nft_collections...`)
        const [updateCols, conflictCols] = this.upsertConstraints.nftCollection
        await Promise.all(
            toChunks(nftCollections, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(NftCollection)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }
}

export function getPolygonRangeWorker(): PolygonRangeWorker {
    return new PolygonRangeWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}