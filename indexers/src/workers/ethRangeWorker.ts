import config from '../config'
import { getIndexer } from '../indexers'
import {
    logger,
    NewReportedHead,
    IndexedBlock,
    range,
    StringKeyMap,
    EthBlock,
    EthTrace,
    EthContract,
    EthLog,
    EthTransaction,
    fullBlockUpsertConfig,
    fullContractUpsertConfig,
    fullLogUpsertConfig,
    fullTraceUpsertConfig,
    fullTransactionUpsertConfig,
    fullLatestInteractionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    EthLatestInteraction,
    toChunks,
    Erc20Token,
    NftCollection,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    snakeToCamel,
    sleep,
} from '../../../shared'
import { exit } from 'process'

const latestInteractionsRepo = () => SharedTables.getRepository(EthLatestInteraction)

class EthRangeWorker {
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

    async _saveBatchResults(results: any[]) {
        let blocks = []
        let transactions = []
        let logs = []
        let traces = []
        let contracts = []
        let latestInteractions = []
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
                ...result.logs.map((l) => ({ ...l, blockTimestamp: () => result.pgBlockTimestamp }))
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
            latestInteractions.push(
                ...result.latestInteractions.map((c) => ({
                    ...c,
                    timestamp: () => result.pgBlockTimestamp,
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
            this.upsertConstraints.block = fullBlockUpsertConfig(blocks[0])
        }
        if (!this.upsertConstraints.transaction && transactions.length) {
            this.upsertConstraints.transaction = fullTransactionUpsertConfig(transactions[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullLogUpsertConfig(logs[0])
        }
        if (!this.upsertConstraints.trace && traces.length) {
            this.upsertConstraints.trace = fullTraceUpsertConfig(traces[0])
        }
        if (!this.upsertConstraints.contract && contracts.length) {
            this.upsertConstraints.contract = fullContractUpsertConfig(contracts[0])
        }
        if (!this.upsertConstraints.latestInteraction && latestInteractions.length) {
            this.upsertConstraints.latestInteraction = fullLatestInteractionUpsertConfig(
                latestInteractions[0]
            )
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

        logs = this.upsertConstraints.log ? uniqueByKeys(logs, ['logIndex', 'transactionHash']) : logs

        traces = this.upsertConstraints.trace
            ? uniqueByKeys(traces, this.upsertConstraints.trace[1])
            : traces

        contracts = this.upsertConstraints.contract
            ? uniqueByKeys(contracts, this.upsertConstraints.contract[1])
            : contracts

        latestInteractions = latestInteractions.sort((a, b) => b.blockNumber - a.blockNumber)
        latestInteractions = this.upsertConstraints.latestInteraction
            ? uniqueByKeys(latestInteractions, this.upsertConstraints.latestInteraction[1])
            : latestInteractions

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
                this._upsertLatestInteractions(latestInteractions, tx),
                this._upsertErc20Tokens(erc20Tokens, tx),
                this._upsertNftCollections(nftCollections, tx),
            ])
        })
    }

    async _upsertBlocks(blocks: StringKeyMap[], tx: any) {
        if (!blocks.length) return
        logger.info(`Saving ${blocks.length} blocks...`)
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[], tx: any) {
        if (!transactions.length) return
        logger.info(`Saving ${transactions.length} transactions...`)
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any) {
        if (!logs.length) return
        logger.info(`Saving ${logs.length} logs...`)
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        await Promise.all(
            toChunks(logs, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthLog)
                    .values(chunk)
                    .orUpdate(updateLogCols, conflictLogCols)
                    .execute()
            })
        )
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
                    .into(EthTrace)
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
                    .into(EthContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }

    async _upsertLatestInteractions(latestInteractions: StringKeyMap[], tx: any, attempt: number = 1) {
        if (!latestInteractions.length) return
        const chunks = toChunks(latestInteractions, this.chunkSize)
        const [updateCols, conflictCols] = this.upsertConstraints.latestInteraction

        for (const chunk of chunks) {
            const existingLatestInteractions = (await latestInteractionsRepo().find({
                select: { from: true, to: true, blockNumber: true },
                where: chunk.map(li => ({ from: li.from, to: li.to }))
            })) || []
            const latestBlockNumberForGroup = {}
            for (const li of existingLatestInteractions) {
                latestBlockNumberForGroup[[li.from, li.to].join(':')] = li.blockNumber
            }
            const latestInteractionsToUpsert = []
            for (const li of chunk) {
                const lastBlockNumber = existingLatestInteractions[[li.from, li.to].join(':')]
                if (!lastBlockNumber || Number(li.blockNumber) > Number(lastBlockNumber)) {
                    latestInteractionsToUpsert.push(li)
                }
            }
            if (!latestInteractionsToUpsert.length) continue
            logger.info(`Saving ${latestInteractionsToUpsert.length} latest interactions...`)

            try {
                await tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthLatestInteraction)
                    .values(latestInteractionsToUpsert)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            } catch (err) {
                const message = err?.message || err?.toString() || ''
    
                // Wait and try again if deadlocked.
                if (attempt < 3 && message.toLowerCase().includes('deadlock')) {
                    logger.error(`[Attempt ${attempt}] Got deadlock, trying again...`)
                    await sleep(Math.floor(Math.random() * (600 - 400) + 400))
                    await this._upsertLatestInteractions(latestInteractions, tx, attempt + 1)
                }
            }
    
        }
    }

    async _upsertErc20Tokens(erc20Tokens: StringKeyMap[], tx: any) {
        if (!erc20Tokens.length) return
        logger.info(`Saving ${erc20Tokens.length} erc20_tokens...`)
        await Promise.all(
            toChunks(erc20Tokens, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Token)
                    .values(chunk)
                    .orIgnore()
                    .execute()
            })
        )
    }

    async _upsertNftCollections(nftCollections: StringKeyMap[], tx: any) {
        if (!nftCollections.length) return
        logger.info(`Saving ${nftCollections.length} nft_collections...`)
        await Promise.all(
            toChunks(nftCollections, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(NftCollection)
                    .values(chunk)
                    .orIgnore()
                    .execute()
            })
        )
    }
}

export function getEthRangeWorker(): EthRangeWorker {
    return new EthRangeWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}
