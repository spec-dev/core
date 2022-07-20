import { Namespace } from '../entities/Namespace'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toSlug } from '../../../utils/formatters'

const namespaces = () => CoreDB.getRepository(Namespace)

export async function createNamespace(name: string): Promise<Namespace> {
    const nsp = new Namespace()
    nsp.name = name
    nsp.slug = toSlug(name)

    try {
        await namespaces().save(nsp)
    } catch (err) {
        logger.error(`Error creating Namespace(name=${name}): ${err}`)
        throw err
    }

    return nsp
}

export async function getNamespace(slug: string): Promise<Namespace | null> {
    try {
        return await namespaces().findOneBy({ slug })
    } catch (err) {
        logger.error(`Error while querying for Namespace by slug ${slug}: ${err}`)
        return null
    }
}
