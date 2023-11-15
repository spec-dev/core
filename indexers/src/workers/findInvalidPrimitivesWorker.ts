import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    schemaForChainId,
    range,
    indexerRedis,
    unique,
    sleep,
} from '../../../shared'
import { ident } from 'pg-format'
import chalk from 'chalk'
import { exit } from 'process'

class FindInvalidPrimitivesWorker {

    from: number

    to: number | null

    groupSize: number

    cursor: number

    mismatches: Set<string>

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.mismatches = new Set()
    }
 
    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            try {
                await this._indexGroup(start, end)
            } catch (err) {
                logger.error(err)
                await sleep(1000)
                continue
            }
            this.cursor = this.cursor + this.groupSize
        }

        if (this.mismatches.size) {
            await indexerRedis.sAdd(`octip-${config.CHAIN_ID}`, Array.from(this.mismatches))
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        const blockNumberToHash = await this._getCurrentBlockHashesMap(start, end)
        const [
            blockNumbersFromTxs,
            blockNumbersFromTraces,
            blockNumbersFromLogs,
            blockNumbersFromContracts,
        ] = await Promise.all([
            this._getStoredBlockNumberHashGroups('transactions', start, end),
            this._getStoredBlockNumberHashGroups('traces', start, end),
            this._getStoredBlockNumberHashGroups('logs', start, end),
            this._getStoredBlockNumberHashGroups('contracts', start, end),
        ])

        const allBlockNumberHashData = [
            ...blockNumbersFromTxs,
            ...blockNumbersFromTraces,
            ...blockNumbersFromLogs,
            ...blockNumbersFromContracts,
        ]
        if (!allBlockNumberHashData.length) return

        const newInvalidBlockNumbers = new Set<string>()
        const locations = {}
        for (const { blockNumber, blockHash, table } of allBlockNumberHashData) {
            const bn = blockNumber.toString()
            const actualHash = blockNumberToHash[bn]
            if (blockHash !== actualHash) {
                locations[bn] = locations[bn] || {}
                locations[bn].tables = locations[bn].tables || new Set()
                locations[bn].tables.add(table)
                newInvalidBlockNumbers.add(bn)
            }
        }

        Array.from(newInvalidBlockNumbers).forEach(bn => {
            logger.info(chalk.yellow(`Mismatch detected in block ${bn}`))
            logger.info(`    - ${Array.from(locations[bn].tables).join(', ')}`)
            this.mismatches.add(bn)
        })

        if (this.mismatches.size) {
            await indexerRedis.sAdd(`octip-${config.CHAIN_ID}`, Array.from(this.mismatches))
            this.mismatches = new Set()
        }
    }

    async _getStoredBlockNumberHashGroups(table: string, start: number, end: number) {
        return ((await SharedTables.query(
            `select distinct(block_number, block_hash) from ${ident(schemaForChainId[config.CHAIN_ID])}.${table} where block_number >= $1 and block_number <= $2`,
            [start, end]
        )) || []).map(r => {
            const group = r.row || ''
            const split = group.split(',')
            if (split.length !== 2) return null
            let [number, hash] = split
            number = parseInt(number.slice(1))
            hash = hash.slice(0, hash.length - 1)
            if (Number.isNaN(number)) return null
            return {
                table,
                blockNumber: number,
                blockHash: hash,
            }
        })
    }

    async _getCurrentBlockHashesMap(start: number, end: number): Promise<StringKeyMap> {
        const m = {}
        ;(await SharedTables.query(
            `select number, hash from ${ident(schemaForChainId[config.CHAIN_ID])}.blocks where number >= $1 and number <= $2 order by number asc`,
            [start, end]
        )).forEach(block => {
            m[block.number.toString()] = block.hash
        })
        return m
    }
}

export function getFindInvalidPrimitivesWorker(): FindInvalidPrimitivesWorker {
    return new FindInvalidPrimitivesWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}