import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    camelizeKeys,
    toChunks,
    Erc20Balance,
    In,
    sleep,
} from '../../../shared'
import { Pool } from 'pg'
import { exit } from 'process'
import { getERC20TokenBalance } from '../services/contractServices'
import short from 'short-uuid'

class AssignErc20BalancesWorker {

    from: number 

    to: number | null

    groupSize: number

    offset: number

    chainId: string

    updates: StringKeyMap[] = []

    deletes: number[] = []

    pool: Pool

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.offset = from
        this.groupSize = groupSize || 1
        this.chainId = config.CHAIN_ID
        this.pool = new Pool({
            host : config.SHARED_TABLES_DB_HOST,
            port : config.SHARED_TABLES_DB_PORT,
            user : config.SHARED_TABLES_DB_USERNAME,
            password : config.SHARED_TABLES_DB_PASSWORD,
            database : config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async run() {
        while (true) {
            const cont = await this._indexGroup()
            if (!cont) break
            this.offset = this.offset + this.groupSize
        }

        if (this.updates.length) {
            logger.info(`Setting ${this.updates.length} balances...`)
            await this._update([...this.updates])
            this.updates = []
        }
    
        if (this.deletes.length) {
            logger.info(`Deleting ${this.deletes.length} zero balances...`)
            await this._delete([...this.deletes])
            this.deletes = []
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(): Promise<boolean> {
        logger.info(`Offset ${this.offset}...`)

        const emptyBalances = await this._getEmptyBalances()
        if (!emptyBalances.length) return false
        
        const groups = toChunks(emptyBalances, 30)
        const erc20BalanceValues = []
        try {
            for (const group of groups) {
                erc20BalanceValues.push(...(await Promise.all(group.map(erc20Balance => (
                    getERC20TokenBalance(
                        erc20Balance.tokenAddress,
                        erc20Balance.ownerAddress,
                        erc20Balance.tokenDecimals,
                    )
                )))))
                await sleep(15)
            }    
        } catch (err) {
            throw `Failed to fetch latest batch of ERC-20 balances: ${err}`
        }

        const updates = []
        const deletes = []
        for (let i = 0; i < emptyBalances.length; i++) {
            const { id } = emptyBalances[i]
            const balanceValue = erc20BalanceValues[i]
            if (balanceValue === null || balanceValue === 0 || balanceValue === '0') {
                deletes.push(id)
            } else {
                updates.push({ id, balance: balanceValue })
            }
        }

        this.updates.push(...updates)
        this.deletes.push(...deletes)

        if (this.updates.length) {
            logger.info(`Setting ${this.updates.length} balances...`)
            await this._update([...this.updates])
            this.updates = []
        }
    
        if (this.deletes.length) {
            logger.info(`Deleting ${this.deletes.length} zero balances...`)
            await this._delete([...this.deletes])
            this.deletes = []
        }

        return true
    }

    async _update(updates: StringKeyMap[]) {
        if (!updates.length) return
        const tempTableName = `erc20_balance_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const { id, balance } of updates) {
            insertPlaceholders.push(`($${i}, $${i + 1})`)
            insertBindings.push(...[id, balance])
            i += 2
        }
        
        let error
        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id integer primary key, balance character varying) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(`INSERT INTO ${tempTableName} (id, balance) VALUES ${insertPlaceholders.join(', ')}`, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_balance SET balance = ${tempTableName}.balance FROM ${tempTableName} WHERE tokens.erc20_balance.id = ${tempTableName}.id and tokens.erc20_balance.balance is null`
            )
            await client.query('COMMIT')
        } catch (err) {
            await client.query('ROLLBACK')
            logger.error(`Error bulk updating ERC-20 Balances`, updates, err)
            error = err
        } finally {
            client.release()
        }
        if (error) throw error
    }

    async _delete(ids: number[]) {
        await SharedTables
            .createQueryBuilder()
            .delete()
            .from(Erc20Balance)
            .where({ id: In(ids) })
            .execute()
    }

    async _getEmptyBalances(): Promise<StringKeyMap[]> {
        const results = (await SharedTables.query(
            `select * from tokens.erc20_balance where chain_id = $1 and balance is null limit 1000`,
            [config.CHAIN_ID]
        ))
        return camelizeKeys(results) as StringKeyMap[]
    }
}

export function getAssignErc20BalancesWorker(): AssignErc20BalancesWorker {
    return new AssignErc20BalancesWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}