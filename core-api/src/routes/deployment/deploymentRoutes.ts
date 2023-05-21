import { app } from '../express'
import paths from '../../utils/paths'
import { parseNewDeploymentPayload } from './deploymentPayloads'
import { logger, getProject, deploymentFailed } from '../../../../shared/dist/main'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { TOML_MIME_TYPE } from '../../utils/file'
import { UploadedFile } from 'express-fileupload'
import deployConfig from '../../services/deployConfig'

/**
 * Create a new deployment for a project.
 */
app.post(paths.NEW_DEPLOYMENT, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseNewDeploymentPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get uploaded config file.
    const configFile = (req.files || [])[0] as UploadedFile
    if (!configFile) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.NO_FILE_PROVIDED })
    }
    if (configFile.mimetype !== TOML_MIME_TYPE) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_FILE_TYPE })
    }

    // Find project by uid that current user has access to.
    const project = await getProject({
        relations: {
            namespace: true,
            projectRoles: {
                namespaceUser: true,
            },
        },
        where: { uid: payload.projectId },
    })
    if (!project || !project.projectRoles.find((pr) => pr.namespaceUser.userId === user.id)) {
        logger.error('No project exists for uid that user has access to:', payload.projectId)
        return res.status(codes.NOT_FOUND).json({ error: errors.NOT_FOUND })
    }

    // Ensure a Spec instance is live for this project.
    if (!project.adminChannel) {
        logger.error(`No Spec instance exists for project (uid=${payload.projectId}) yet.`)
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.NO_SPEC_INSTANCE })
    }

    // Create and perform deployment.
    const [deployment, err] = await deployConfig(project, configFile)
    if (err) {
        logger.error(`Project deployment error (uid=${payload.projectId}): ${err}`)
        deployment && deploymentFailed(deployment.id)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err })
    }

    // Return new deployment version.
    return res.status(codes.SUCCESS).json({ version: deployment.version })
})
