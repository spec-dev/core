import { app } from '../express'
import paths from '../../utils/paths'
import { parseIdPayload } from './projectPayloads'
import { logger, getProjectByUid } from '../../../../shared'
import { codes, errors, authorizeRequest } from '../../utils/requests'

/**
 * Get a project with its API key.
 */
app.get(paths.PROJECT_WITH_KEY, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseIdPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find a project by uid that the current user has access to.
    const project = await getProjectByUid(payload.id, { 
        relations: {
            org: true,
            projectRoles: {
                orgUser: true,
            },
        }
    })
    if (!project || !project.projectRoles.find(pr => pr.orgUser.userId === user.id)) {
        logger.error('No project exists for uid that user has access to:', payload.id)
        return res.status(codes.NOT_FOUND).json({ error: errors.NOT_FOUND })
    }

    // Return project member view (includes api key).
    return res.status(codes.SUCCESS).json(project.memberView())
})