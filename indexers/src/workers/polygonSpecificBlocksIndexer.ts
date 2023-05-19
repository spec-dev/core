import config from '../config'
import { getIndexer } from '../indexers'
import {
    insertIndexedBlocks,
    setIndexedBlocksToSucceeded,
    logger,
    NewReportedHead,
    IndexedBlockStatus,
    IndexedBlock,
    getBlocksInNumberRange,
    range,
    StringKeyMap,
    PolygonBlock,
    PolygonLog,
    PolygonTransaction,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    formatAbiValueWithType,
    PolygonTrace,
    PolygonContract,
    toChunks,
    fullTraceUpsertConfig,
    fullContractUpsertConfig,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    snakeToCamel,
    CoreDB,
    Erc20Token,
    NftCollection,
    ContractInstance,
} from '../../../shared'
import { exit } from 'process'

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

const redo = [
    34889335,
    34889336,
]

class PolygonSpecificNumbersWorker {
    
    numbers: number[]

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    batchBlockNumbersIndexed: number[] = []

    batchExistingBlocksMap: { [key: number]: IndexedBlock } = {}

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    smartWalletInitializerAddresses: string[] = []

    constructor(numbers: number[], groupSize?: number, saveBatchMultiple?: number) {
        this.numbers = numbers
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
    }

    async run() {
        this.smartWalletInitializerAddresses = await this._getIvySmartWalletInitializerAddresses()

        const groups = toChunks(redo, this.groupSize)
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
            this.upsertConstraints.trace = fullTraceUpsertConfig(traces[0])
        }
        if (!this.upsertConstraints.contract && contracts.length) {
            this.upsertConstraints.contract = fullContractUpsertConfig(contracts[0])
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

        erc20Tokens = this.upsertConstraints.erc20Token
            ? uniqueByKeys(erc20Tokens, this.upsertConstraints.erc20Token[1].map(snakeToCamel))
            : erc20Tokens

        nftCollections = this.upsertConstraints.nftCollection
            ? uniqueByKeys(nftCollections, this.upsertConstraints.nftCollection[1].map(snakeToCamel))
            : nftCollections

        await Promise.all([
            this._upsertBlocks(blocks),
            this._upsertTransactions(transactions),
            this._upsertLogs(logs),
            this._upsertTraces(traces),
            this._upsertContracts(contracts),
            this._upsertErc20Tokens(erc20Tokens),
            this._upsertNftCollections(nftCollections),
        ])

        const ivySmartWallets = logs.length ? this._getIvySmartWallets(logs) : []
        ivySmartWallets.length && await this._upsertIvySmartWallets(ivySmartWallets)
    }

    _getIvySmartWallets(logs: StringKeyMap[]): StringKeyMap[] {
        logs = logs.sort((a, b) => 
            (Number(b.blockNumber) - Number(a.blockNumber)) || 
            (b.transactionIndex - a.transactionIndex) || 
            (b.logIndex - a.logIndex)
        )
        const smartWallets = []
        for (const log of logs) {
            if (this.smartWalletInitializerAddresses.includes(log.address) && log.eventName === 'WalletCreated') {
                const eventArgs = log.eventArgs || []
                if (!eventArgs.length) continue
                const data = this._logEventArgsAsMap(eventArgs)
                const contractAddress = data.smartWallet
                const ownerAddress = data.owner
                if (!contractAddress || !ownerAddress) continue           
                
                smartWallets.push({
                    contractAddress,
                    ownerAddress,
                    transactionHash: log.transactionHash,
                    blockNumber: Number(log.blockNumber),
                    blockHash: log.blockHash,
                    blockTimestamp: log.blockTimestamp.toISOString(),
                    chainId: config.CHAIN_ID,
                })
            }
        }
        if (!smartWallets.length) return []

        return uniqueByKeys(smartWallets, ['chainId', 'contractAddress'])
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
            .into(PolygonBlock)
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
                    .into(PolygonTransaction)
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
                        .into(PolygonLog)
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
                    .into(PolygonTrace)
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
                    .into(PolygonContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }

    async _upsertIvySmartWallets(smartWallets: StringKeyMap[]) {
        for (const smartWallet of smartWallets) {
            try {
                await SharedTables.query(`INSERT INTO ivy.smart_wallets (contract_address, owner_address, transaction_hash, block_number, block_hash, block_timestamp, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (contract_address, chain_id) DO UPDATE SET owner_address = EXCLUDED.owner_address, transaction_hash = EXCLUDED.transaction_hash, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
                    [
                        smartWallet.contractAddress,
                        smartWallet.ownerAddress,
                        smartWallet.transactionHash,
                        smartWallet.blockNumber,
                        smartWallet.blockHash,
                        smartWallet.blockTimestamp,
                        smartWallet.chainId,
                    ]
                )
            } catch (err) {
                logger.error('Failed to insert smart wallet', err)
                return
            }
            logger.info('\nADDED SMART WALLET!\n', smartWallet)
        }
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

    async _getIvySmartWalletInitializerAddresses(): Promise<string[]> {
        try {
            return ((await contractInstancesRepo().find({
                select: { address: true },
                where: {
                    name: 'SmartWalletInitializer',
                    chainId: config.CHAIN_ID,
                }
            })) || []).map(ci => ci.address)
        } catch (err) {
            logger.error(`Error getting smart wallet initializer contract addresses: ${err}`)
            return []
        }
    }
}

export function getPolygonSpecificNumbersWorker(): PolygonSpecificNumbersWorker {
    return new PolygonSpecificNumbersWorker(
        config.SPECIFIC_INDEX_NUMBERS,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}