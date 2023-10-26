import { Project } from '../entities/Project'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toSlug } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'
import { newApiKey, newJWT, ClaimRole } from '../../../utils/auth'
import randToken from 'rand-token'

const projects = () => CoreDB.getRepository(Project)

export async function createProject(name: string, namespaceId: number): Promise<Project> {
    const project = new Project()
    project.uid = randToken.generate(20, 'abcdefghijklmnopqrstuvwxyz')
    project.namespaceId = namespaceId
    project.name = name
    project.slug = toSlug(name)
    project.apiKey = await newApiKey()
    project.adminKey = await newApiKey()
    project.signedApiKey = newJWT(
        { id: project.uid, role: ClaimRole.EventSubscriber, key: project.apiKey },
        '10y'
    )
    project.signedAdminKey = newJWT(
        { id: project.uid, role: ClaimRole.Admin, key: project.adminKey },
        '10y'
    )

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

export async function getAllUserProjects(userId: number): Promise<Project[] | null> {
    try {
        return await projects().find({
            relations: {
                projectRoles: {
                    namespaceUser: true,
                },
                namespace: true,
            },
            where: {
                projectRoles: {
                    namespaceUser: {
                        userId: userId,
                    },
                },
            },
        })
    } catch (err) {
        logger.error(`Error getting projects for userId ${userId}: ${err}`)
        return null
    }
}
