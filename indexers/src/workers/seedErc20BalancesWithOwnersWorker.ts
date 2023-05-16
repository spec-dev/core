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
    chainIds,
    fullErc20BalanceUpsertConfig,
    Erc20Balance,
    identPath,
    range,
    formatAbiValueWithType,
    Abi,
    NULL_ADDRESS,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'
import { decodeTransferEvent } from '../services/extractTransfersFromLogs'
import { 
    TRANSFER_TOPIC,
    WETH_DEPOSIT_TOPIC,
    WETH_WITHDRAWAL_TOPIC,
    specialErc20BalanceAffectingAbis,
    TRANSFER_EVENT_NAME,
} from '../utils/standardAbis'
import Web3 from 'web3'

const web3js = new Web3()

const topics = new Set([
    TRANSFER_TOPIC, 
    WETH_DEPOSIT_TOPIC, 
    WETH_WITHDRAWAL_TOPIC
])

class SeedErc20BalancesWithOwnersWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    chainId: string

    token: StringKeyMap

    ownerAddresses: Set<string> = new Set()

    erc20Balances: Erc20Balance[] = []

    latestBlock: StringKeyMap | null = null

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.chainId = config.CHAIN_ID
        this.token = {
            address: this.chainId === chainIds.ETHEREUM
                ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
                : '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
        }
    }

    async run() {
        await this._loadLatestBlock()
        if (!this.latestBlock) throw 'no latest block found'
        setInterval(() => this._loadLatestBlock(), 10000)

        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.ownerAddresses.size) {
            const balances = this._formatBalances(Array.from(this.ownerAddresses)) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number): Promise<boolean> {
        logger.info(`Indexing ${start} --> ${end}...`)

        const logs = this._decodeLogsIfNeeded(
            await this._getTokenLogsForRange(start, end)
        )
        if (!logs.length) return false
        
        logger.info(`Got ${logs.length} logs`)

        for (const log of logs) {
            log.eventArgs = log.eventArgs || []
            if (log.topic0 === TRANSFER_TOPIC) {
                const fromAddress = log.eventArgs[0]?.value || NULL_ADDRESS
                const toAddress = log.eventArgs[1]?.value || NULL_ADDRESS
                this.ownerAddresses.add(fromAddress.toLowerCase())
                this.ownerAddresses.add(toAddress.toLowerCase())
            } else if ([WETH_DEPOSIT_TOPIC, WETH_WITHDRAWAL_TOPIC].includes(log.topic0)) {
                const ownerAddress = log.eventArgs[0]?.value || NULL_ADDRESS
                this.ownerAddresses.add(ownerAddress.toLowerCase())
            }
        }

        if (this.ownerAddresses.size >= 4000) {
            const balances = this._formatBalances(Array.from(this.ownerAddresses)) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
            this.ownerAddresses = new Set()
        }
        return true
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

    async _getTokenLogsForRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('logs')].join('.')
        const blockNumbers = range(start, end)
        const phs = range(1, blockNumbers.length).map(i => `$${i}`)
        try {
            const results = ((await SharedTables.query(
                `select * from ${table} where block_number in (${phs.join(', ')}) and address = $${blockNumbers.length + 1}`,
                [...blockNumbers, this.token.address]
            )) || []).filter(l => l.topic0 && topics.has(l.topic0))
            return camelizeKeys(results) as StringKeyMap[]
        } catch (err) {
            logger.error(`Error getting logs`, err)
            return []
        }
    }

    _formatBalances(ownerAddresses: string[]): StringKeyMap[] {
        return ownerAddresses.map(ownerAddress => ({
            tokenAddress: this.token.address,
            tokenName: this.token.name,
            tokenSymbol: this.token.symbol,
            tokenDecimals: this.token.decimals,
            ownerAddress,
            balance: null,
            blockHash: this.latestBlock.hash,
            blockNumber: this.latestBlock.number,
            blockTimestamp: new Date(this.latestBlock.timestamp).toISOString(),
            chainId: this.chainId,
        }))
    }

    _decodeLogsIfNeeded(logs: StringKeyMap[]): StringKeyMap[] {
        const decoded = []
        for (let log of logs) {
            if (log.eventName && log.eventArgs) {
                decoded.push(log)
                continue
            }

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

        const decodedArgs = web3js.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
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

    async _loadLatestBlock() {
        const schema = schemaForChainId[config.CHAIN_ID]
        const tablePath = [schema, 'blocks'].join('.')
        let block
        try {
            block = ((await SharedTables.query(
                `select number, hash, timestamp from ${identPath(tablePath)} order by number desc limit 1`, 
            )) || [])[0]
        } catch (err) {
            logger.error(err)
            return
        }
        this.latestBlock = block
    }
}

export function getSeedErc20BalancesWithOwnersWorker(): SeedErc20BalancesWithOwnersWorker {
    return new SeedErc20BalancesWithOwnersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}