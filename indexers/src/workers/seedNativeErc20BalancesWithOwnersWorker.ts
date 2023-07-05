import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    schemaForChainId,
    toChunks,
    snakeToCamel,
    randomIntegerInRange,
    sleep,
    fullErc20BalanceUpsertConfig,
    Erc20Balance,
    NULL_ADDRESS,
    Erc20Token,
    getNativeTokenForChain,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'

class SeedNativeErc20BalancesWithOwnersWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    chainId: string

    tokenOwners: Set<string>

    erc20Balances: Erc20Balance[] = []

    block: StringKeyMap | null = null

    token: Erc20Token

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.chainId = config.CHAIN_ID
        this.token = getNativeTokenForChain(this.chainId)!
        this.tokenOwners = new Set()
    }

    async run() {
        await this._getBlock()
        if (!this.block) throw 'No block set'
        if (!this.token) throw 'No native token'

        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.tokenOwners.size) {
            const balances = Array.from(this.tokenOwners).map(
                ownerAddress => this._formatEmptyBalance(ownerAddress)
            ) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
            this.tokenOwners = new Set()
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number): Promise<boolean> {
        logger.info(`Indexing ${start} --> ${end}...`)

        // Get value-based transfers for this block range.
        const traces = await this._getTracesWithNativeValueForBlockRange(start, end)
        if (!traces.length) return

        // Create unique owner/token pairs with empty balances.
        for (const trace of traces) {
            if (!trace.value || trace.value === '0') continue
            this.tokenOwners.add((trace.from || NULL_ADDRESS).toLowerCase())
            this.tokenOwners.add((trace.to || NULL_ADDRESS).toLowerCase())
        }

        // Upsert empty balances.
        if (this.tokenOwners.size > 4000) {
            const balances = Array.from(this.tokenOwners).map(
                ownerAddress => this._formatEmptyBalance(ownerAddress)
            ) as Erc20Balance[]
            logger.info(`Saving ${balances.length} balances...`)
            await Promise.all(toChunks(balances, 2000).map(chunk => this._upsertErc20Balances(chunk)))
            this.tokenOwners = new Set()
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

    async _getTracesWithNativeValueForBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        return (await SharedTables.query(
            `select "from", "to", value from ${schema}.traces where block_number >= $1 and block_number <= $2 and status != 0 and value != '0' and value is not null`,
            [start, end]
        )) || []
    }

    _formatEmptyBalance(ownerAddress: string): StringKeyMap {
        return {
            tokenAddress: this.token.address,
            tokenName: this.token.name,
            tokenSymbol: this.token.symbol,
            tokenDecimals: this.token.decimals,
            ownerAddress,
            balance: null,
            blockHash: this.block.hash,
            blockNumber: this.block.number,
            blockTimestamp: new Date(this.block.timestamp).toISOString(),
            chainId: this.chainId,
        }
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

export function getSeedNativeErc20BalancesWithOwnersWorker(): SeedNativeErc20BalancesWithOwnersWorker {
    return new SeedNativeErc20BalancesWithOwnersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}