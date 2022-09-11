import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { Org } from '../entities/Org'
import { toSlug } from '../../../utils/formatters'

const orgs = () => CoreDB.getRepository(Org)

export async function createOrg(name: string): Promise<Org> {
    const org = new Org()
    org.uid = uuid4()
    org.name = name
    org.slug = toSlug(name)

    try {
        await orgs().save(org)
    } catch (err) {
        logger.error(`Error creating Org with name ${name}): ${err}`)
        return null
    }

    return org
}
