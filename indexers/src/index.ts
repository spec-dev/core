import config from './config'
import {
    logger,
    indexerRedis,
    IndexerDB,
    SharedTables,
    CoreDB,
    upsertContractCaches,
    initPublishedEvent,
    savePublishedEvents,
    EthBlock,
} from 'shared'
import { getWorker } from './workers'

async function run() {
    // Start all databases.
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
        CoreDB.initialize(),
        indexerRedis.connect(),
    ])

    // const eventOrigin = {
    //     chainId: 1,
    //     blockNumber: 1,
    // }

    // const publishedEvents = [
    //     initPublishedEvent('name', eventOrigin, { key: 1 }),
    // ]

    // const savedEvents = await savePublishedEvents(publishedEvents)

    // console.log(savedEvents[0].timestamp.toISOString())

    // const blocks = () => SharedTables.getRepository(EthBlock)
    // const block = await blocks().findOneBy({ number: 15423965 })
    // // "blockNumber":"15423965","blockTimestamp":"2022-08-28T02:31:37.000Z"

    // console.log(block.timestamp.toISOString())

    // // Make sure verified contracts and instances are cached.
    // await upsertContractCaches()

    // logger.info(
    //     config.IS_RANGE_MODE
    //         ? `Indexing block range ${config.FROM_BLOCK} -> ${config.TO_BLOCK}...`
    //         : `Listening for new block heads...`
    // )

    // // Start dat bish.
    // getWorker().run()
}

run()