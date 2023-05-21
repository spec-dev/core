import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { ProjectRoleName, ProjectRole } from '../entities/ProjectRole'

const projectRoles = () => CoreDB.getRepository(ProjectRole)

export async function createProjectRole(
    projectId: number,
    namespaceUserId: number,
    role: ProjectRoleName
): Promise<ProjectRole> {
    const projectRole = new ProjectRole()
    projectRole.projectId = projectId
    projectRole.namespaceUserId = namespaceUserId
    projectRole.role = role

    try {
        await projectRoles().save(projectRole)
    } catch (err) {
        logger.error(
            `Error creating ProjectRole(projectId=${projectId}, namespaceUserId=${namespaceUserId}): ${err}`
        )
        return null
    }

    return projectRole
}
