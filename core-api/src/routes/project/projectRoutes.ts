import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetProjectPayload } from './projectPayloads'
import { logger, getProject, toSlug } from '../../../../shared'
import { codes, errors, authorizeRequest } from '../../utils/requests'

/**
 * Get a project with its API key.
 */
app.get(paths.PROJECT_WITH_KEY, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseGetProjectPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find project by org/slug that current user has access to.
    const project = await getProject({
        relations: {
            org: true,
            projectRoles: {
                orgUser: true,
            },
        },
        where: {
            slug: toSlug(payload.project),
            org: { 
                slug: toSlug(payload.org),
            },
            projectRoles: {
                orgUser: {
                    userId: user.id
                }
            }
        }
    })
    if (!project) {
        logger.error(`No project exists for ${payload.org}/${payload.project} that user has access to.`)
        return res.status(codes.NOT_FOUND).json({ error: 'Project not found.' })
    }

    // Return project member view (includes api key).
    return res.status(codes.SUCCESS).json(project.memberView())
})