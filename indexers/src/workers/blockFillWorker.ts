import config from '../config'
import {
    logger,
    StringKeyMap,
    EvmBlock,
    SharedTables,
    toChunks,
    schemaForChainId,
    sleep,
} from '../../../shared'
import { exit } from 'process'
import { createWsProviderPool, getWsProviderPool } from '../wsProviderPool'
import chalk from 'chalk'

class BlockFillWorker {

    from: number

    to: number | null

    groupSize: number

    cursor: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        createWsProviderPool(true, 0)
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            logger.info(`${start} -> ${end}`)
            await this._fillRange(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        logger.info('DONE')
        exit()
    }

    async _fillRange(start: number, end: number) {
        const missing = (await SharedTables.query(
            `SELECT s.id AS missing FROM generate_series(${start}, ${end}) s(id) WHERE NOT EXISTS (SELECT 1 FROM ${schemaForChainId[config.CHAIN_ID]}.blocks WHERE number = s.id)`
        )).map(r => parseInt(r.missing))
        if (!missing.length) return

        // Resolve blocks in range in batches and save them.
        const blocks = await this._getBlocks(missing)
        if (blocks.length !== missing.length) throw `Wasnt able to get all blocks missing in (${start}, ${end})`
        await this._saveBlocks(blocks)
    }

    async _getBlocks(numbers: number[]) {
        const chunks = toChunks(numbers, 40)
        const blocks = []
        for (const chunk of chunks) {
            await sleep(120)
            blocks.push(...(await Promise.all(chunk.map(n => this._blockForNumber(n)))))
        }
        return blocks
    }

    async _blockForNumber(number: number) {
        const { block } = await getWsProviderPool().getBlock(null, number, false)
        return block
    }

    async _saveBlocks(blocks: StringKeyMap[]) {
        logger.info(chalk.cyanBright(`Filling ${blocks.length} missing blocks...`))

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(EvmBlock)
                .values(blocks)
                .orIgnore()
                .execute()
        })
    }
}

export function getBlockFillWorker(): BlockFillWorker {
    return new BlockFillWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
    )
}