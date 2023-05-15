import { IndexerDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'
import { Reorg } from '../entities/Reorg'

const reorgs = () => IndexerDB.getRepository(Reorg)

export async function getReorg(uid: string): Promise<Reorg | null> {
    try {
        return await reorgs().findOneBy({ uid })
    } catch (err) {
        logger.error(`Error finding reorg (uid=${uid}): ${err}`)
        return null
    }
}

export async function createReorg(
    chainId: string,
    from: number,
    to: number,
    uid?: string
): Promise<Reorg | null> {
    const reorg = new Reorg()
    reorg.uid = uid || uuid4()
    reorg.chainId = chainId
    reorg.fromNumber = from
    reorg.toNumber = to

    try {
        await reorgs().save(reorg)
    } catch (err) {
        throw `Error creating Reorg (chainId=${chainId}, fromNumber=${from}, toNumber=${to}): ${err}`
    }

    return reorg
}

export async function updateReorg(id: number, updates: StringKeyMap) {
    if (!Object.keys(updates).length) return
    try {
        await reorgs().createQueryBuilder().update(updates).where({ id }).execute()
    } catch (err) {
        logger.error(
            `Error updating reorg (id=${id}) with updates: ${JSON.stringify(updates)}}: ${err}`
        )
    }
}

export async function failPotentialReorg(uid: string, err: Error) {
    try {
        const error = err.message || err.toString() || ''
        await reorgs()
            .createQueryBuilder()
            .update({
                failed: true,
                error,
            })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(`Failed to mark potential reorg (uid=${uid}) as failed: ${err}`)
    }
}
