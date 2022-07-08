import { IndexedBlock } from '../entities/IndexedBlock'
import { IndexerDB } from '../data-source'
import logger from '../../../logger'

const indexedBlocks = () => IndexerDB.getRepository(IndexedBlock)

export async function getlastSeenBlock(chainId: number): Promise<IndexedBlock | null> {
    let blocks
    try {
        blocks = await indexedBlocks().find({
            order: {
                blockNumber: 'DESC',
                createdAt: 'DESC',
            },
            where: {
                chainId,
            },
            take: 1,
        })
    } catch (err) {
        logger.error(`Error fetching last seen block for chainId ${chainId}: ${err}`)
        throw err
    }

    return blocks[0] || null
}

export async function getBlockAtNumber(
    chainId: number,
    blockNumber: number
): Promise<IndexedBlock | null> {
    let block
    try {
        block = await indexedBlocks().findOne({
            where: {
                chainId,
                blockNumber: Number(blockNumber),
                uncled: false,
            },
        })
    } catch (err) {
        logger.error(
            `Error fetching non-uncled block for chainId ${chainId} at number ${blockNumber}: ${err}`
        )
        throw err
    }

    return block || null
}

export async function createIndexedBlock(attrs: {
    [key: string]: any
}): Promise<IndexedBlock | null> {
    let block
    try {
        block = new IndexedBlock()
        for (let key in attrs) {
            block[key] = attrs[key]
        }
        await indexedBlocks().save(block)
    } catch (err) {
        logger.error(`Error creating indexed block: ${err}`)
        throw err
    }

    return block || null
}

export async function uncleBlock(id: number) {
    try {
        await indexedBlocks().createQueryBuilder().update({ uncled: true }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error creating indexed block: ${err}`)
        throw err
    }
}
