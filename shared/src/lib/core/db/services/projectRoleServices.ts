import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { ProjectRoleName, ProjectRole } from '../entities/ProjectRole'

const projectRoles = () => CoreDB.getRepository(ProjectRole)

export async function createProjectRole(
    projectId: number,
    orgUserId: number,
    role: ProjectRoleName
): Promise<ProjectRole> {
    const projectRole = new ProjectRole()
    projectRole.projectId = projectId
    projectRole.orgUserId = orgUserId
    projectRole.role = role

    try {
        await projectRoles().save(projectRole)
    } catch (err) {
        logger.error(
            `Error creating ProjectRole(projectId=${projectId}, orgUserId=${orgUserId}): ${err}`
        )
        return null
    }

    return projectRole
}
