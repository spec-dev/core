import { IndexedBlock, IndexedBlockStatus } from '../entities/IndexedBlock'
import { IndexerDB } from '../dataSource'
import logger from '../../../logger'
import { registerBlockHashAsUncled } from '../../redis'

const indexedBlocks = () => IndexerDB.getRepository(IndexedBlock)

export async function getlastSeenBlock(chainId: number): Promise<IndexedBlock | null> {
    let blocks
    try {
        blocks = await indexedBlocks().find({
            order: {
                number: 'DESC',
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
    number: number
): Promise<IndexedBlock | null> {
    let block
    try {
        block = await indexedBlocks().findOne({
            where: {
                chainId,
                number,
                uncled: false,
            },
        })
    } catch (err) {
        logger.error(
            `Error fetching non-uncled block for chainId ${chainId} at number ${number}: ${err}`
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

export async function uncleBlock(indexedBlock: IndexedBlock) {
    try {
        await indexedBlocks()
            .createQueryBuilder()
            .update({ uncled: true })
            .where({ id: indexedBlock.id })
            .execute()
    } catch (err) {
        logger.error(`Error marking indexed block (id=${indexedBlock.id}) as uncled: ${err}`)
        throw err
    }

    // Add block hash to uncled redis set.
    indexedBlock.hash && (await registerBlockHashAsUncled(indexedBlock.chainId, indexedBlock.hash))
}

export async function setIndexedBlockStatus(id: number, status: IndexedBlockStatus) {
    try {
        await indexedBlocks().createQueryBuilder().update({ status }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting indexed block (id=${id}) to status ${status}: ${err}`)
        throw err
    }
}

export async function setIndexedBlockToFailed(id: number) {
    try {
        await indexedBlocks().createQueryBuilder().update({ failed: true }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting indexed block (id=${id}) to failed: ${err}`)
        throw err
    }
}
