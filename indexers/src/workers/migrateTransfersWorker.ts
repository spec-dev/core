import config from '../config'
import {
    logger,
    range,
    SharedTables,
    In,
    Erc20Transfer,
    Erc20TransferSource,
    hashSync
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'

const transfersRepo = () => SharedTables.getRepository(Erc20Transfer)

class MigrateTransfersWorker {
    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    transfersToSave: Erc20Transfer[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.transfersToSave = []

        // Create connection pool.
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
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.transfersToSave.length) {
            await this._updateTransfers(this.transfersToSave)
            this.transfersToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        const transfers = await this._getTransfersForRange(start, end)
        if (!transfers.length) return

        transfers.forEach(transfer => {
            transfer.source = Erc20TransferSource.Log
            transfer.transferId = hashSync([transfer.chainId, transfer.transactionHash, transfer.logIndex].join(':'))
        })

        // Bulk update logs when enough have been decoded.
        this.transfersToSave.push(...transfers)
        if (this.transfersToSave.length >= 4000) {
            const transfersToSave = [...this.transfersToSave]
            await this._updateTransfers(transfersToSave)
            this.transfersToSave = []
        }
    }

    async _updateTransfers(transfers: Erc20Transfer[]) {
        logger.info(`Saving ${transfers.length} updated transfers...`)

        const tempTableName = `transfers_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const transfer of transfers) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
            insertBindings.push(...[transfer.id, transfer.transferId, transfer.source])
            i += 3
        }

        const insertQuery = `INSERT INTO ${tempTableName} (id, transfer_id, source) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id integer not null primary key, transfer_id character varying(70) not null, source character varying(20) not null) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_transfers SET transfer_id = ${tempTableName}.transfer_id, source = ${tempTableName}.source FROM ${tempTableName} WHERE tokens.erc20_transfers.id = ${tempTableName}.id`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error('Error saving updated transfers', e)
        } finally {
            client.release()
        }
    }

    async _getTransfersForRange(start: number, end: number): Promise<Erc20Transfer[]> {
        try {
            return (await transfersRepo().find({
                where: { id: In(range(start, end)) }
            }) || []).filter(t => !t.transferId)
        } catch (err) {
            logger.error(`Error getting transfers: ${err}`)
            return []
        }
    }
}

export function getMigrateTransfersWorker(): MigrateTransfersWorker {
    return new MigrateTransfersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}