import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    snakeToCamel,
    randomIntegerInRange,
    sleep,
    fullErc20BalanceUpsertConfig,
    Erc20Balance,
    formatAbiValueWithType,
    Abi,
    NULL_ADDRESS,
    TRANSFER_TOPIC,
    WETH_DEPOSIT_TOPIC,
    unique,
    WETH_WITHDRAWAL_TOPIC,
    In,
    specialErc20BalanceAffectingAbis,
    TRANSFER_EVENT_NAME,
    Erc20Token,
    mapByKey,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'
import { decodeTransferEvent } from '../services/extractTransfersFromLogs'
import Web3 from 'web3'
import LRU from 'lru-cache'

const erc20TokensRepo = () => SharedTables.getRepository(Erc20Token)

const web3 = new Web3()

class SeedErc20BalancesWithOwnersWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    chainId: string

    tokenOwners: StringKeyMap = {}

    erc20Balances: Erc20Balance[] = []

    block: StringKeyMap | null = null

    cachedTokens: LRU<string, StringKeyMap> = new LRU({
        max: 30000,
    })

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.chainId = config.CHAIN_ID
    }

    async run() {
        logger.info(`Starting seed erc20 balances worker...`)

        await this._getBlock()
        if (!this.block) throw 'No block set'

        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (Object.keys(this.tokenOwners).length) {
            const balances = Object.values(this.tokenOwners) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number): Promise<boolean> {
        logger.info(`Indexing ${start} --> ${end}...`)

        // Get potential erc20 transfer logs for this block range.
        const logs = this._decodeLogsIfNeeded(await this._getTransferLogsForBlockRange(start, end))
        logger.info(`    ${logs.length} logs`)
        if (!logs.length) return

        // Get all unique contract addresses across logs.
        const contractAddresses = unique(logs.map(log => log.address))
        logger.info(`    ${contractAddresses.length} contract addresses`)

        // Find ERC-20 tokens for contract addresses.
        const erc20TokensByAddress = await this._getErc20TokensForAddresses(contractAddresses)
        if (!Object.keys(erc20TokensByAddress).length) return

        // Create unique owner/token pairs with empty balances.
        for (const log of logs) {
            const token = erc20TokensByAddress[log.address]
            if (!token) continue
            log.eventArgs = log.eventArgs || []
            if (log.topic0 === TRANSFER_TOPIC) {
                const fromAddress = (log.eventArgs[0]?.value || NULL_ADDRESS).toLowerCase()
                const toAddress = (log.eventArgs[1]?.value || NULL_ADDRESS).toLowerCase()
                this.tokenOwners[[token.address, fromAddress].join(':')] = this._formatEmptyBalance(fromAddress, token)
                this.tokenOwners[[token.address, toAddress].join(':')] = this._formatEmptyBalance(toAddress, token)
            } else if ([WETH_DEPOSIT_TOPIC, WETH_WITHDRAWAL_TOPIC].includes(log.topic0)) {
                const ownerAddress = (log.eventArgs[0]?.value || NULL_ADDRESS).toLowerCase()
                this.tokenOwners[[token.address, ownerAddress].join(':')] = this._formatEmptyBalance(ownerAddress, token)
            }
        }

        logger.info(`    Count: ${Object.keys(this.tokenOwners).length}`)

        // Upsert empty balances.
        if (Object.keys(this.tokenOwners).length > 4000) {
            const balances = Object.values(this.tokenOwners) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
            this.tokenOwners = {}
        }
    }

    async _upsertErc20Balances(erc20Balances: Erc20Balance[], attempt: number = 1) {
        if (!erc20Balances.length) return
        const [_, conflictCols] = fullErc20BalanceUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        erc20Balances = uniqueByKeys(erc20Balances, conflictCols.map(snakeToCamel)) as Erc20Balance[]
        try {
            await SharedTables
                .createQueryBuilder()
                .insert()
                .into(Erc20Balance)
                .values(erc20Balances)
                .onConflict(`(${conflictColStatement}) DO NOTHING`)
                .execute()
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
                await sleep(randomIntegerInRange(50, 500))
                return await this._upsertErc20Balances(erc20Balances, attempt + 1)
            } else {
                throw err
            }
        }
    }

    async _getTransferLogsForBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const tablePath = [ident(schema), ident('logs')].join('.')
        const results = await SharedTables.query(
            `select * from ${tablePath} where block_number >= $1 and block_number <= $2 and topic0 in ($3, $4, $5)`,
            [start, end, TRANSFER_TOPIC, WETH_DEPOSIT_TOPIC, WETH_WITHDRAWAL_TOPIC]
        )

        const logs = camelizeKeys(results || []) as StringKeyMap[]
        if (!logs.length) {
            logger.warn(`No transfer logs this range...`)
            return []
        }

        const uniqueTxHashes = unique(logs.map(log => log.transactionHash))
        const placeholders = []
        let i = 1
        for (const _ of uniqueTxHashes) {
            placeholders.push(`$${i}`)
            i++
        }
        
        const successfulTxHashes = new Set((await SharedTables.query(
            `select hash from ${ident(schema)}.${ident('transactions')} where hash in (${placeholders.join(', ')}) and status != $${i}`,
            [...uniqueTxHashes, 0]
        )).map(tx => tx.hash))

        return logs.filter(log => log.address && successfulTxHashes.has(log.transactionHash))
    }

    async _getErc20TokensForAddresses(addresses: string[]) {
        const tokens = []
        const remainingAddresses = []
        let i = 0
        for (const address of addresses) {
            const cachedToken = this.cachedTokens.get(address)
            if (cachedToken) {
                i++
                tokens.push(cachedToken)
            } else {
                remainingAddresses.push(address)
            }
        }

        i && logger.info(`    ${i} cached tokens`)

        if (remainingAddresses.length) {
            const persistedTokens = (await erc20TokensRepo().find({
                select: { address: true, name: true, symbol: true, decimals: true },
                where: { address: In(remainingAddresses), chainId: this.chainId },
            })) || []

            persistedTokens.length && logger.info(`    ${persistedTokens.length} persisted tokens`)

            persistedTokens.forEach(token => {
                this.cachedTokens.set(token.address, token)
                tokens.push(token)
            })    
        }

        return mapByKey(tokens, 'address')
    }

    _formatEmptyBalance(ownerAddress: string, token: StringKeyMap): StringKeyMap {
        return {
            tokenAddress: token.address,
            tokenName: token.name,
            tokenSymbol: token.symbol,
            tokenDecimals: token.decimals,
            ownerAddress,
            balance: null,
            blockHash: this.block.hash,
            blockNumber: this.block.number,
            blockTimestamp: new Date(this.block.timestamp).toISOString(),
            chainId: this.chainId,
        }
    }

    _decodeLogsIfNeeded(logs: StringKeyMap[]): StringKeyMap[] {
        const decoded = []
        for (let log of logs) {
            if (log.eventName && log.eventArgs) {
                decoded.push(log)
                continue
            }
            try {
                if (log.topic0 === TRANSFER_TOPIC) {
                    const eventArgs = decodeTransferEvent(log, true)
                    if (!eventArgs) continue
                    log.eventName = TRANSFER_EVENT_NAME
                    log.eventArgs = eventArgs
                    decoded.push(log)
                    continue
                }
            
                if (!([WETH_DEPOSIT_TOPIC, WETH_WITHDRAWAL_TOPIC].includes(log.topic0))) {
                    continue
                }
    
                const abiItem = specialErc20BalanceAffectingAbis[log.topic0]
                if (!abiItem) continue
    
                log = this._decodeLog(log, [abiItem])
                if (!log.eventName || !log.eventArgs) continue
                decoded.push(log)
            } catch (err) {
                continue
            }
        }
        return decoded
    }

    _decodeLog(log: StringKeyMap, abi: Abi): StringKeyMap {
        const abiItem = abi.find(item => item.signature === log.topic0)
        if (!abiItem) return log

        const argNames = []
        const argTypes = []
        for (const input of abiItem.inputs || []) {
            input.name && argNames.push(input.name)
            argTypes.push(input.type)
        }
        if (argNames.length !== argTypes.length) {
            return log
        }

        const topics = []
        abiItem.anonymous && topics.push(log.topic0)
        log.topic1 && topics.push(log.topic1)
        log.topic2 && topics.push(log.topic2)
        log.topic3 && topics.push(log.topic3)

        const decodedArgs = web3.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
        const numArgs = parseInt(decodedArgs.__length__)

        const argValues = []
        for (let i = 0; i < numArgs; i++) {
            const stringIndex = i.toString()
            if (!decodedArgs.hasOwnProperty(stringIndex)) continue
            argValues.push(decodedArgs[stringIndex])
        }
        if (argValues.length !== argTypes.length) return log

        const eventArgs = []
        for (let j = 0; j < argValues.length; j++) {
            eventArgs.push({
                name: argNames[j],
                type: argTypes[j],
                value: formatAbiValueWithType(argValues[j], argTypes[j]),
            })
        }

        log.eventName = abiItem.name
        log.eventArgs = eventArgs

        return log
    }

    async _getBlock() {
        const blockNumberCeiling = parseInt((((await SharedTables.query(
            `select is_enabled_above from op_tracking where table_path = $1 and chain_id = $2`, 
            ['tokens.erc20_balance', this.chainId]
        )) || [])[0] || {}).is_enabled_above)
        if (isNaN(blockNumberCeiling)) return

        const schema = schemaForChainId[config.CHAIN_ID]
        const tablePath = [ident(schema), ident('blocks')].join('.')
        this.block = (await SharedTables.query(
            `select hash, number, timestamp from ${tablePath} where number = $1`, 
            [blockNumberCeiling - 1],
        ))[0]
    }
}

export function getSeedErc20BalancesWithOwnersWorker(): SeedErc20BalancesWithOwnersWorker {
    return new SeedErc20BalancesWithOwnersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}