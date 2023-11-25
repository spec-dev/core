import { Namespace } from '../entities/Namespace'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toNamespaceSlug } from '../../../utils/formatters'
import { In, MoreThanOrEqual, Raw } from 'typeorm'
import { chainIdForContractNamespace } from '../../../utils/chainIds'

const namespaces = () => CoreDB.getRepository(Namespace)

export async function createNamespace(name: string): Promise<Namespace | null> {
    const nsp = new Namespace()
    nsp.name = name
    nsp.slug = toNamespaceSlug(name)

    try {
        await namespaces().save(nsp)
    } catch (err) {
        logger.error(`Error creating Namespace(name=${name}): ${err}`)
        return null
    }

    return nsp
}

export async function getNamespace(name: string): Promise<Namespace | null> {
    try {
        return await namespaces().findOneBy({ slug: toNamespaceSlug(name) })
    } catch (err) {
        logger.error(`Error while querying for Namespace by name ${name}: ${err}`)
        return null
    }
}

export async function getNamespaces(
    names: string[],
    timeSynced: string = null
): Promise<Namespace[] | null> {
    if (!names?.length) {
        try {
            return await namespaces().find({
                where: {
                    name: Raw((alias) => `${alias} NOT LIKE '%.%' AND ${alias} != 'test'`),
                    updatedAt: MoreThanOrEqual(new Date(timeSynced)),
                },
                order: { verified: 'ASC', createdAt: 'DESC' },
            })
        } catch (err) {
            logger.error(`Error getting namespaces: ${err}`)
            return null
        }
    }

    try {
        return await namespaces().find({
            where: { slug: In(names.map((n) => toNamespaceSlug(n))) },
        })
    } catch (err) {
        logger.error(`Error getting Namespaces by names ${names.join(', ')}: ${err}`)
        return null
    }
}

export async function getChainIdsForNamespace(nsp: string): Promise<string[]> {
    const numComps = nsp.split('.').length

    // If given a contract namespace, just return the chain referenced by it.
    if (numComps > 1) {
        const chainId = chainIdForContractNamespace(nsp)
        return chainId ? [chainId] : null
    }

    // Get all *distinct* chain ids from the "config.chains{}" json column map
    // of any live_object_versions referencing this nsp.
    try {
        const results =
            (await CoreDB.query(
                `select distinct(json_object_keys(config -> 'chains')::text) as chain_id from live_object_versions where nsp = $1 or nsp ilike $2`,
                [nsp, `%.contracts.${nsp}.%`]
            )) || []

        return results
            .map((r) => parseInt(r.chain_id))
            .sort((a, b) => a - b)
            .map((chainId) => chainId.toString())
    } catch (err) {
        logger.error(`Error deriving chainIds for namespace ${nsp}: ${err}`)
        return []
    }
}

export async function upsertNamespaceWithTx(name: string, tx: any): Promise<Namespace | null> {
    const slug = toNamespaceSlug(name)
    const data = { name, slug }
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(Namespace)
                .values(data)
                .orUpdate(['name'], ['slug'])
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
}
