import { Project } from '../entities/Project'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toSlug } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import uuid4 from 'uuid4'
import { hash, newApiKey } from '../../../utils/auth'

const projects = () => CoreDB.getRepository(Project)

export async function createProject(name: string, orgId: number): Promise<Project> {
    const project = new Project()
    project.uid = uuid4()
    project.orgId = orgId
    project.name = name
    project.slug = toSlug(name)
    project.apiKey = await newApiKey()
    project.adminKey = await newApiKey()

    try {
        await projects().save(project)
    } catch (err) {
        logger.error(`Error creating Project with name ${name}): ${err}`)
        return null
    }

    return project
}

export async function getProject(opts: StringKeyMap = {}): Promise<Project | null> {
    const findOpts: StringKeyMap = { where: opts.where, relations: opts.relations }
    try {
        return await projects().findOne(findOpts)
    } catch (err) {
        logger.error(`Error finding Project ${opts.where}: ${err}`)
        return null
    }
}
