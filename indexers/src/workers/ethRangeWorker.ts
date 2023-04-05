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

const missing = [
    7784800,
    7784801,
    7784802,
    7784803,
    7784804,
    7784805,
    7784806,
    7784807,
    7784808,
    7784809,
    7784810,
    7784811,
    7784812,
    7784813,
    7784814,
    7784815,
    7784816,
    7784817,
    7784818,
    7784819,
    7784820,
    7784821,
    7784822,
    7784823,
    7784824,
    7784825,
    7784826,
    7784827,
    7784828,
    7784829,
    7784830,
    7784831,
    7784832,
    7784833,
    7784834,
    7784835,
    7784836,
    7784837,
    7784838,
    7784839,
    7784840,
    7784841,
    7784842,
    7784843,
    7784844,
    7784845,
    7784846,
    7784847,
    7784848,
    7784849,
    7784850,
    7784851,
    7784852,
    7784853,
    7784854,
    7784855,
    7784856,
    7784857,
    7784858,
    7784859,
    7784860,
    7784861,
    7784862,
    7784863,
    7784864,
    7784865,
    7784866,
    7784867,
    7784868,
    7784869,
    7784870,
    7784871,
    7784872,
    7784873,
    7784874,
    7784875,
    7784876,
    7784877,
    7784878,
    7784879,
    7784880,
    7784881,
    7784882,
    7784883,
    7784884,
    7784885,
    7784886,
    7784887,
    7784888,
    7784889,
    7921040,
    7921041,
    7921042,
    7921043,
    7921044,
    7921045,
    7921046,
    7921047,
    7921048,
    7921049,
    7921050,
    7921051,
    7921052,
    7921053,
    7921054,
    7921055,
    7921056,
    7921057,
    7921058,
    7921059,
    8650000,
    8650001,
    8650002,
    8650003,
    8650004,
    8650005,
    8650006,
    8650007,
    8650008,
    8650009,
    8650010,
    8650011,
    8650012,
    8650013,
    8650014,
    8650015,
    8650016,
    8650017,
    8650018,
    8650019,
    8650020,
    8650021,
    8650022,
    8650023,
    8650024,
    8650025,
    8650026,
    8650027,
    8650028,
    8650029,
    8650030,
    8650031,
    8650032,
    8650033,
    8650034,
    8650035,
    8650036,
    8650037,
    8650038,
    8650039,
    8650040,
    8650041,
    8650042,
    8650043,
    8650044,
    8650045,
    8650046,
    8650047,
    8650048,
    8650049,
    8650050,
    8650051,
    8650052,
    8650053,
    8650054,
    8650055,
    8650056,
    8650057,
    8650058,
    8650059,
    8650060,
    8650061,
    8650062,
    8650063,
    8650064,
    8650065,
    8650066,
    8650067,
    8650068,
    8650069,
    8650070,
    8650071,
    8650072,
    8650073,
    8650074,
    8650075,
    8650076,
    8650077,
    8650078,
    8650079,
    8650080,
    8650081,
    8650082,
    8650083,
    8650084,
    8650085,
    8650086,
    8650087,
    8650088,
    8650089,
    8650090,
    8650091,
    8650092,
    8650093,
    8650094,
    8650095,
    8650096,
    8650097,
    8650098,
    8650099,
    8650100,
    8650101,
    8650102,
    8650103,
    8650104,
    8650105,
    8650106,
    8650107,
    8650108,
    8650109,
    8650110,
    8650111,
    8650112,
    8650113,
    8650114,
    8650115,
    8650116,
    8650117,
    8650118,
    8650119,
    8650120,
    8650121,
    8650122,
    8650123,
    8650124,
    8650125,
    8650126,
    8650127,
    8650128,
    8650129,
    8650130,
    8650131,
    8650132,
    8650133,
    8650134,
    8650135,
    8650136,
    8650137,
    8650138,
    8650139,
    8650140,
    8650141,
    8650142,
    8650143,
    8650144,
    8650145,
    8650146,
    8650147,
    8650148,
    8650149,
    8650150,
    8650151,
    8650152,
    8650153,
    8650154,
    8650155,
    8650156,
    8650157,
    8650158,
    8650159,
    8650160,
    8650161,
    8650162,
    8650163,
    8650164,
    8650165,
    8650166,
    8650167,
    8650168,
    8650169,
    8650170,
    8650171,
    8650172,
    8650173,
    8650174,
    8650175,
    8650176,
    8650177,
    8650178,
    8650179,
    8650180,
    8650181,
    8650182,
    8650183,
    8650184,
    8650185,
    8650186,
    8650187,
    8650188,
    8650189,
    8650190,
    8650191,
    8650192,
    8650193,
    8650194,
    8650195,
    8650196,
    8650197,
    8650198,
    8650199,
    8650200,
    8650201,
    8650202,
    8650203,
    8650204,
    8650205,
    8650206,
    8650207,
    8650208,
    8650209,
    8650210,
    8650211,
    8650212,
    8650213,
    8650214,
    8650215,
    8650216,
    8650217,
    8650218,
    8650219,
    8650220,
    8650221,
    8650222,
    8650223,
    8650224,
    8650225,
    8650226,
    8650227,
    8650228,
    8650229,
    8650230,
    8650231,
    8650232,
    8650233,
    8650234,
    8650235,
    8650236,
    8650237,
    8650238,
    8650239,
    8650240,
    8650241,
    8650242,
    8650243,
    8650244,
    8650245,
    8650246,
    8650247,
    8650248,
    8650249,
    8650250,
    8650251,
    8650252,
    8650253,
    8650254,
    8650255,
    8650256,
    8650257,
    8650258,
    8650259,
    8650260,
    8650261,
    8650262,
    8650263,
    8650264,
    8650265,
    8650266,
    8650267,
    8650268,
    8650269,
    8650270,
    8650271,
    8650272,
    8650273,
    8650274,
    8650275,
    8650276,
    8650277,
    8650278,
    8650279,
    8650280,
    8650281,
    8650282,
    8650283,
    8650284,
    8650285,
    8650286,
    8650287,
    8650288,
    8650289,
    8650290,
    8650291,
    8650292,
    8650293,
    8650294,
    8650295,
    8650296,
    8650297,
]

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
        // while (this.cursor <= this.to) {
        //     const start = this.cursor
        //     const end = Math.min(this.cursor + this.groupSize - 1, this.to)
        //     const groupBlockNumbers = range(start, end)
        //     await this._indexBlockGroup(groupBlockNumbers)
        //     this.cursor = this.cursor + this.groupSize
        // }
        const groups = toChunks(missing, this.groupSize)
        for (const group of groups) {
            await this._indexBlockGroup(group)
            // this.cursor = this.cursor + this.groupSize
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
