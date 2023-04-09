import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    fullErc20TransferUpsertConfig,
    snakeToCamel,
    Erc20Transfer,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'
import initTokenTransfers from '../services/initTokenTransfers'

class SeedNativeTransfersWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    erc20Transfers: Erc20Transfer[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.erc20Transfers = []
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.erc20Transfers.length) {
            logger.info(`Saving ${this.erc20Transfers.length} ERC-20 transfers...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Transfers(this.erc20Transfers, tx)
            })
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        // Get contracts for this block range.
        const erc20Transfers = await this._getTokenTransfersInRange(start, end)
        if (!erc20Transfers.length) return
        
        this.erc20Transfers.push(...erc20Transfers)

        if (this.erc20Transfers.length >= 2000) {
            logger.info(`Saving ${this.erc20Transfers.length} ERC-20 transfers...`)
            const erc20Transfers = [...this.erc20Transfers]
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Transfers(erc20Transfers, tx)
            })
            this.erc20Transfers = []
        }
    }

    async _upsertErc20Transfers(erc20Transfers: Erc20Transfer[], tx: any) {
        const [updateCols, conflictCols] = fullErc20TransferUpsertConfig(erc20Transfers[0])
        erc20Transfers = uniqueByKeys(erc20Transfers, conflictCols.map(snakeToCamel)) as Erc20Transfer[]
        await Promise.all(
            toChunks(erc20Transfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Transfer)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }

    async _getTokenTransfersInRange(start: number, end: number): Promise<Erc20Transfer[]> {
        const transferTraces = await this._getTracesInBlockRange(start, end)
        if (!transferTraces.length) return []
        const [erc20Transfers, _, __] = await initTokenTransfers([], [],
            [],
            transferTraces,
            config.CHAIN_ID,
        )
        return erc20Transfers
    }

    async _getTracesInBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('traces')].join('.')
        const numberClause = 'block_number >= $1 and block_number <= $2'

        try {
            const results = (await SharedTables.query(
                `select * from ${table} where ${numberClause}`,
                [start, end]
            )) || []
            return camelizeKeys(results) as StringKeyMap[]
        } catch (err) {
            logger.error(`Error getting traces:`, err)
            return []
        }
    }
}

export function getSeedNativeTransfersWorker(): SeedNativeTransfersWorker {
    return new SeedNativeTransfersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}