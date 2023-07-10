import { Namespace } from '../entities/Namespace'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toNamespaceSlug } from '../../../utils/formatters'
import { In } from 'typeorm'

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

export async function getNamespaces(names: string[]): Promise<Namespace[] | null> {
    if (!names?.length) return []
    try {
        return await namespaces().find({
            where: { slug: In(names.map((n) => toNamespaceSlug(n))) },
        })
    } catch (err) {
        logger.error(`Error getting Namespaces by names ${names.join(', ')}: ${err}`)
        return null
    }
}

export async function upsertNamespaceWithTx(
    name: string,
    codeUrl: string,
    tx: any
): Promise<Namespace | null> {
    const slug = toNamespaceSlug(name)
    const data = { name, slug, codeUrl }
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(Namespace)
                .values(data)
                .orUpdate(['code_url'], ['name'])
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
}
