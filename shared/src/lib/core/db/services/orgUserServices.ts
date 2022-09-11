import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { OrgUserRole, OrgUser } from '../entities/OrgUser'
import uuid4 from 'uuid4'

const orgUsers = () => CoreDB.getRepository(OrgUser)

export async function createOrgUser(
    orgId: number,
    userId: number,
    role: OrgUserRole
): Promise<OrgUser> {
    const orgUser = new OrgUser()
    orgUser.uid = uuid4()
    orgUser.orgId = orgId
    orgUser.userId = userId
    orgUser.role = role

    try {
        await orgUsers().save(orgUser)
    } catch (err) {
        logger.error(`Error creating OrgUser(orgId=${orgId}, userId=${userId}): ${err}`)
        return null
    }

    return orgUser
}
