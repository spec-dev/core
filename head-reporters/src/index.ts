import config from './config'
import { CoreDB, IndexerDB, indexerRedis, logger, ChainTables, schemaForChainId, identPath } from '../../shared'
import { EvmReporter } from './reporters'
import { BlockHeader } from 'web3-eth'
import { rollbackTable } from './services/rollbackTables'
import { createWsProviderPool } from './wsProviderPool'

async function getBlockTimestamp(blockNumber: number): Promise<string | null> {
    const schema = schemaForChainId[config.CHAIN_ID]
    const tablePath = [schema, 'blocks'].join('.')
    try {
        return (((await ChainTables.query(schema,
            `select timestamp from ${identPath(tablePath)} where number = $1`, 
            [blockNumber]
        )) || [])[0] || {}).timestamp || null
    } catch (err) {
        logger.error(err)
        return null
    }
}

async function listen() {
    await Promise.all([
        CoreDB.initialize(),
        ChainTables.initialize(),
        IndexerDB.initialize(),
        indexerRedis.connect(),
    ])

    createWsProviderPool(true)

    // Rollback a specific table to a specific block number. Useful when a 
    // live object version gets half indexed for particular block and then fails. 
    if (config.ROLLBACK_TABLE && config.ROLLBACK_TARGET !== null) {
        const blockTimestamp = await getBlockTimestamp(config.ROLLBACK_TARGET)
        await rollbackTable(
            config.ROLLBACK_TABLE,
            config.CHAIN_ID,
            config.ROLLBACK_TARGET,
            blockTimestamp,
        )
        return
    }

    const reporter = new EvmReporter()

    // Force-run an uncle that failed after patch fix.
    if (config.FORCE_UNCLE_RANGE.length === 2) {
        const [from, to] = config.FORCE_UNCLE_RANGE
        reporter.currentReorgFloor = from
        reporter.currentReorgCeiling = to
        try {
            logger.info(`Forcing uncle ${from} -> ${to}`)
            await reporter._uncleBlocks(
                { number: from, timestamp: Math.floor(Date.now() / 1000) } as BlockHeader, 
                to,
                1000,
            )
        } catch (err) {
            logger.error(`Forced uncle failed`, err)
        }
    } 
    else {
        reporter.listen()
    }
}

listen()