import { Project } from '../entities/Project'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'

const projects = () => CoreDB.getRepository(Project)

export async function getProjectByUid(
    uid: string,
    opts: StringKeyMap = {}
): Promise<Project | null> {
    const findOpts: StringKeyMap = { where: { uid }, relations: opts.relations }
    try {
        return await projects().findOne(findOpts)
    } catch (err) {
        logger.error(`Error finding Project by uid ${uid}: ${err}`)
        return null
    }
}
