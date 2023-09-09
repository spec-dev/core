import config from '../config'
import { getIndexer } from '../indexers'
import {
    logger,
    NewReportedHead,
    StringKeyMap,
    EvmBlock,
    EvmLog,
    EvmTransaction,
    fullBlockUpsertConfig,
    fullLogUpsertConfig,
    fullTransactionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    formatAbiValueWithType,
    EvmTrace,
    EvmContract,
    toChunks,
    fullTraceUpsertConfig,
    fullContractUpsertConfig,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    snakeToCamel,
    Erc20Token,
    NftCollection,
    fullErc20BalanceUpsertConfig,
    Erc20Balance,
    TokenTransfer,
    fullTokenTransferUpsertConfig,
} from '../../../shared'
import { createWeb3Provider } from '../httpProviderPool'
import { createWsProviderPool } from '../wsProviderPool'
import { exit } from 'process'
import { ident } from 'pg-format'

class SpecificBlocksIndexer {
    
    numbers: number[]

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    constructor(numbers: number[], groupSize?: number, saveBatchMultiple?: number) {
        this.numbers = numbers
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
    }

    async run() {
        createWeb3Provider()
        createWsProviderPool()
        
        const groups = toChunks(this.numbers, this.groupSize)
        for (const group of groups) {
            await this._indexBlockGroup(group)
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
            this.batchResults = []
            try {
                await this._saveBatchResults(batchResults)
            } catch (err) {
                logger.error(`Error saving batch: ${err}`)
                return
            }
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
        let erc20Tokens = [] 
        let erc20Balances = [] 
        let nftCollections = []
        let tokenTransfers = []

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
            erc20Tokens.push(
                ...result.erc20Tokens.map((e) => ({
                    ...e,
                    blockTimestamp: () => result.pgBlockTimestamp,
                    lastUpdated: () => result.pgBlockTimestamp,
                }))
            )
            erc20Balances.push(
                ...result.erc20Balances.map((e) => ({
                    ...e,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            nftCollections.push(
                ...result.nftCollections.map((n) => ({
                    ...n,
                    blockTimestamp: () => result.pgBlockTimestamp,
                    lastUpdated: () => result.pgBlockTimestamp,
                }))
            )
            tokenTransfers.push(
                ...result.tokenTransfers.map((e) => ({
                    ...e,
                    blockTimestamp: () => result.pgBlockTimestamp,
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
        if (!this.upsertConstraints.erc20Token && erc20Tokens.length) {
            this.upsertConstraints.erc20Token = fullErc20TokenUpsertConfig()
        }
        if (!this.upsertConstraints.erc20Balance && erc20Balances.length) {
            this.upsertConstraints.erc20Balance = fullErc20BalanceUpsertConfig()
        }
        if (!this.upsertConstraints.nftCollection && nftCollections.length) {
            this.upsertConstraints.nftCollection = fullNftCollectionUpsertConfig()
        }
        if (!this.upsertConstraints.tokenTransfer && tokenTransfers.length) {
            this.upsertConstraints.tokenTransfer = fullTokenTransferUpsertConfig()
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

        erc20Tokens = this.upsertConstraints.erc20Token
            ? uniqueByKeys(erc20Tokens, this.upsertConstraints.erc20Token[1].map(snakeToCamel))
            : erc20Tokens

        erc20Balances = this.upsertConstraints.erc20Balance
            ? uniqueByKeys(erc20Balances, this.upsertConstraints.erc20Balance[1].map(snakeToCamel))
            : erc20Balances

        nftCollections = this.upsertConstraints.nftCollection
            ? uniqueByKeys(nftCollections, this.upsertConstraints.nftCollection[1].map(snakeToCamel))
            : nftCollections

        tokenTransfers = this.upsertConstraints.tokenTransfer
            ? uniqueByKeys(tokenTransfers, this.upsertConstraints.tokenTransfer[1].map(snakeToCamel))
            : tokenTransfers

        await Promise.all([
            this._upsertBlocks(blocks),
            this._upsertTransactions(transactions),
            this._upsertLogs(logs),
            this._upsertTraces(traces),
            this._upsertContracts(contracts),
            this._upsertErc20Tokens(erc20Tokens),
            this._upsertErc20Balances(erc20Balances),
            this._upsertNftCollections(nftCollections),
            this._upsertTokenTransfers(tokenTransfers),
        ])
    }

    _logEventArgsAsMap(eventArgs: StringKeyMap[]): StringKeyMap {
        const data = {}
        for (const arg of eventArgs) {
            if (arg.name) {
                data[arg.name] = formatAbiValueWithType(arg.value, arg.type)
            }
        }
        return data
    }

    async _upsertBlocks(blocks: StringKeyMap[]) {
        if (!blocks.length) return
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await SharedTables
            .createQueryBuilder()
            .insert()
            .into(EvmBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[]) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(EvmTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[]): Promise<StringKeyMap[]> {
        if (!logs.length) return []
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        return (
            await Promise.all(
                toChunks(logs, this.chunkSize).map((chunk) => {
                    return SharedTables
                        .createQueryBuilder()
                        .insert()
                        .into(EvmLog)
                        .values(chunk)
                        .orUpdate(updateLogCols, conflictLogCols)
                        .returning('*')
                        .execute()
                })
            )
        ).map(result => result.generatedMaps).flat()
    }

    async _upsertTraces(traces: StringKeyMap[]) {
        if (!traces.length) return
        logger.info(`Saving ${traces.length} traces...`)
        const [updateTraceCols, conflictTraceCols] = this.upsertConstraints.trace
        await Promise.all(
            toChunks(traces, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(EvmTrace)
                    .values(chunk)
                    .orUpdate(updateTraceCols, conflictTraceCols)
                    .execute()
            })
        )
    }

    async _upsertContracts(contracts: StringKeyMap[]) {
        if (!contracts.length) return
        logger.info(`Saving ${contracts.length} contracts...`)
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.contract
        await Promise.all(
            toChunks(contracts, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(EvmContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }

    async _upsertErc20Tokens(erc20Tokens: StringKeyMap[]) {
        if (!erc20Tokens.length) return
        logger.info(`Saving ${erc20Tokens.length} erc20_tokens...`)
        await Promise.all(
            toChunks(erc20Tokens, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Token)
                    .values(chunk)
                    .orIgnore()
                    .execute()
            })
        )
    }

    async _upsertErc20Balances(erc20Balances: StringKeyMap[]) {
        if (!erc20Balances.length) return
        logger.info(`Saving ${erc20Balances.length} erc20_balances...`)
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.erc20Balance
        const conflictColStatement = conflictContractCols.map(ident).join(', ')
        const updateColsStatement = updateContractCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."erc20_balance"."block_timestamp" < excluded.block_timestamp and "tokens"."erc20_balance"."balance" != excluded.balance`
        await Promise.all(
            toChunks(erc20Balances, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Balance)
                    .values(chunk)
                    .onConflict(
                        `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                    )
                    .execute()
            })
        )
    }

    async _upsertNftCollections(nftCollections: StringKeyMap[]) {
        if (!nftCollections.length) return
        logger.info(`Saving ${nftCollections.length} nft_collections...`)
        await Promise.all(
            toChunks(nftCollections, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(NftCollection)
                    .values(chunk)
                    .orIgnore()
                    .execute()
            })
        )
    }

    async _upsertTokenTransfers(tokenTransfers: StringKeyMap[]) {
        if (!tokenTransfers.length) return
        const [updateCols, conflictCols] = this.upsertConstraints.tokenTransfer
        await Promise.all(
            toChunks(tokenTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(TokenTransfer)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }
}

export function getSpecificBlocksIndexer(): SpecificBlocksIndexer {
    return new SpecificBlocksIndexer(
        config.SPECIFIC_INDEX_NUMBERS,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}