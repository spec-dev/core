import { IndexedBlock, IndexedBlockStatus } from '../entities/IndexedBlock'
import { IndexerDB } from '../dataSource'
import logger from '../../../logger'
import { registerBlockHashAsUncled } from '../../redis'
import { In } from 'typeorm'
import { StringKeyMap } from '../../../types'

const indexedBlocks = () => IndexerDB.getRepository(IndexedBlock)

export async function getlastSeenBlock(chainId: string): Promise<IndexedBlock | null> {
    let block
    try {
        block = await indexedBlocks().findOne({
            order: {
                number: 'DESC',
                createdAt: 'DESC',
            },
            where: { chainId: Number(chainId) },
        })
    } catch (err) {
        logger.error(`Error fetching last seen block for chainId ${chainId}: ${err}`)
        throw err
    }

    return block || null
}

export async function getBlockAtNumber(
    chainId: string,
    number: number
): Promise<IndexedBlock | null> {
    let block
    try {
        block = await indexedBlocks().findOne({
            where: {
                chainId: Number(chainId),
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

export async function getBlocksInNumberRange(
    chainId: string,
    numbers: number[]
): Promise<IndexedBlock[]> {
    let blocks = []
    try {
        blocks = await indexedBlocks().findBy({
            chainId: Number(chainId),
            number: In(numbers),
        })
    } catch (err) {
        logger.error(`Error fetching blocks for chainId ${chainId} in numbers ${numbers}: ${err}`)
        throw err
    }
    return blocks
}

export async function createIndexedBlock(attrs: StringKeyMap): Promise<IndexedBlock> {
    const block = new IndexedBlock()
    for (let key in attrs) {
        block[key] = attrs[key]
    }

    try {
        await indexedBlocks().save(block)
    } catch (err) {
        logger.error(`Error creating indexed block: ${err}`)
        throw err
    }

    return block
}

export async function insertIndexedBlocks(records: StringKeyMap[]): Promise<StringKeyMap[]> {
    try {
        return (
            await indexedBlocks()
                .createQueryBuilder()
                .insert()
                .into(IndexedBlock)
                .values(records)
                .returning('*')
                .execute()
        ).generatedMaps
    } catch (err) {
        logger.error(`Error inserting indexed blocks with attrs ${records}: ${err}`)
        throw err
    }
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
    indexedBlock.hash &&
        (await registerBlockHashAsUncled(indexedBlock.chainId.toString(), indexedBlock.hash))
}

export async function setIndexedBlockStatus(id: number, status: IndexedBlockStatus) {
    try {
        await indexedBlocks().createQueryBuilder().update({ status }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting indexed block (id=${id}) to status ${status}: ${err}`)
    }
}

export async function setIndexedBlockToFailed(id: number) {
    try {
        await indexedBlocks().createQueryBuilder().update({ failed: true }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting indexed block (id=${id}) to failed: ${err}`)
    }
}

export async function setIndexedBlocksToSucceeded(ids: number[]) {
    try {
        await indexedBlocks()
            .createQueryBuilder()
            .update({ status: IndexedBlockStatus.Complete, failed: false })
            .where({ id: In(ids) })
            .execute()
    } catch (err) {
        logger.error(`Error setting indexed blocks (ids=${ids.join(', ')}) to succeeded: ${err}`)
        throw err
    }
}
