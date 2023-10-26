import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetProjectPayload, parseStreamLogsPayload } from './projectPayloads'
import { logger, getProject, toSlug, toNamespaceSlug, getAllUserProjects } from '../../../../shared'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { streamLogs } from '../../services/streamLogs'

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

    // Find project by namespace/slug that current user has access to.
    const project = await getProject({
        relations: {
            namespace: true,
            projectRoles: {
                namespaceUser: true,
            },
        },
        where: {
            slug: toSlug(payload.project),
            namespace: {
                slug: toNamespaceSlug(payload.namespace),
            },
            projectRoles: {
                namespaceUser: {
                    userId: user.id,
                },
            },
        },
    })
    if (!project) {
        logger.error(
            `No project exists for ${payload.namespace}/${payload.project} that user has access to.`
        )
        return res.status(codes.NOT_FOUND).json({ error: 'Project not found.' })
    }

    // Return project member view (includes api key).
    const data = await project.memberView()
    return res.status(codes.SUCCESS).json(data)
})

/**
 * Stream the logs for a project.
 */
app.get(paths.PROJECT_LOGS, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseStreamLogsPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find project by uid that current user has access to.
    const project = await getProject({
        relations: {
            namespace: true,
            projectRoles: {
                namespaceUser: true,
            },
        },
        where: { uid: payload.id },
    })
    if (!project || !project.projectRoles.find((pr) => pr.namespaceUser.userId === user.id)) {
        logger.error('No project exists for uid that user has access to:', payload.id)
        return res.status(codes.NOT_FOUND).json({ error: errors.NOT_FOUND })
    }

    // Stream logs as a response.
    try {
        await streamLogs(project.uid, payload.tail, payload.env, req, res)
    } catch (error) {
        logger.error(error)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }
})

/**
 * Get all projects for a user.
 */
app.get(paths.USER_PROJECTS, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Find all projects for user by user id.
    const projects = await getAllUserProjects(user.id)
    if (!projects) {
        logger.error(`No projects exist that user ${user.id} has access to.`)
        return res.status(codes.NOT_FOUND).json({ error: 'No projects found.' })
    }

    // Return projects' member view.
    const data = await Promise.all(projects.map(p => p.memberView()))
    return res.status(codes.SUCCESS).json(data)
})