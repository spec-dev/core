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
    36750171,
    38651391,
    38835771,
    38836693,
    38836694,
    38836695,
    38837075,
    38837076,
    38837297,
    38837298,
    38837299,
    38837300,
    38837301,
    38837302,
    38837303,
    38837304,
    38837305,
    38837306,
    38837307,
    38837308,
    38837309,
    38837310,
    38837311,
    38918478,
    38982463,
    39186585,
    39186588,
    39197803,
    39235536,
    39267022,
    39268279,
    39319022,
    39340505,
    39344172,
    39356528,
    39358112,
    39413120,
    39477463,
    39496005,
    39599625,
    39599626,
    39599627,
    39599628,
    39599629,
    39599631,
    39599632,
    39599633,
    39599634,
    39599635,
    39599636,
    39599637,
    39599640,
    39599642,
    39599643,
    39599644,
    39599645,
    39599647,
    39599648,
    39599649,
    39599650,
    39599651,
    39599652,
    39599653,
    39599654,
    39599655,
    39599656,
    39599657,
    39599658,
    39599659,
    39599660,
    39599661,
    39599662,
    39599663,
    39599664,
    39599665,
    39599666,
    39599667,
    39599668,
    39599669,
    39599670,
    39599671,
    39599672,
    39599673,
    39599674,
    39599675,
    39599676,
    39599677,
    39599678,
    39599679,
    39599680,
    39599681,
    39599682,
    39662772,
    39666326,
    39666327,
    39736528,
    39856641,
    39878196,
    39928308,
    39950531,
    40001629,
    40164569,
    40475642,
    40670544,
    40711627,
    40750559,
    41146761,
    41146899,
    41289104,
    41640983,
    41651407,
    42051342,
    42110264,
    42154613,
    42229553,
    42416578,
    42416579,
    42416580,
    42416585,
    42416586,
    42416590,
    42416591,
    42416592,
    42416593,
    42416594,
    42416595,
    42416596,
    42416597,
    42416598,
    42416599,
    42416600,
    42416601,
    42416602,
    42416603,
    42416604,
    42416605,
    42416606,
    42416607,
    42416608,
    42416609,
    42416610,
    42416611,
    42416612,
    42416613,
    42416614,
    42416615,
    42416616,
    42416617,
    42416618,
    42416619,
    42416620,
    42416621,
    42416622,
    42416623,
    42416624,
    42416625,
    42416626,
    42416627,
    42416628,
    42416629,
    42416630,
    42416631,
    42416632,
    42416633,
    42416634,
    42416635,
    42416636,
    42416637,
    42416638,
    42416639,
    42416640,
    42416641,
    42431326,
    42584213,
    42584482,
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