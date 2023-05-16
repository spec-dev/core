import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    NftCollection,
    Erc20Token,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    snakeToCamel,
    range,
    indexerRedis,
    sleep,
} from '../../../shared'
import { ident } from 'pg-format'
import chalk from 'chalk'
import { exit } from 'process'
import rpcPool from '../rpcPool'

class ValidateBlocksWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    mismatches: number[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.mismatches = []
    }
 
    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)

            try {
                await this._indexGroup(start, end)
            } catch (err) {
                continue
            } 
            
            this.cursor = this.cursor + this.groupSize
        }

        if (this.mismatches.length) {
            await indexerRedis.sAdd(`redo-${config.CHAIN_ID}`, this.mismatches.map(n => n.toString()))
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        const blockNumberRange = range(start, end)
        const currentHashes = await this._getCurrentBlockHashes(start, end)        
        const actualHashes = await this._getActualBlockHashes(blockNumberRange)

        for (let i = 0; i < currentHashes.length; i++) {
            const [current, actual] = [currentHashes[i], actualHashes[i]]
            if (current !== actual) {
                const blockNumber = blockNumberRange[i] as number
                logger.warn(chalk.yellow(`[${blockNumber}] Block hash mismatch (${current} vs. ${actual})`))
                this.mismatches.push(blockNumber)
            }
        }

        if (this.mismatches.length >= 10000) {
            await indexerRedis.sAdd(`redo-${config.CHAIN_ID}`, this.mismatches.map(n => n.toString()))
            this.mismatches = []
        }
    }

    async _getCurrentBlockHashes(start: number, end: number): Promise<string[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        return (await SharedTables.query(
            `select hash from ${ident(schema)}.blocks where number >= $1 and number <= $2 order by number asc`,
            [start, end]
        )).map(b => b.hash)
    }

    async _getActualBlockHashes(hashes: number[]): Promise<string[]> {
        const numberChunks = toChunks(hashes, 50)
        const rangeHashes = []
        for (const chunk of numberChunks) {
            await sleep(120)
            rangeHashes.push(...(await Promise.all(chunk.map(n => this._hashForNumber(n)))))
        }
        return rangeHashes
    }

    async _hashForNumber(number: number) {
        const block = await rpcPool.getBlock(number, false)
        return block.hash
    }
}

export function getValidateBlocksWorker(): ValidateBlocksWorker {
    return new ValidateBlocksWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}