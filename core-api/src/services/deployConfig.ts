import {
    Project,
    Deployment,
    DeploymentStatus,
    createDeployment,
    updateDeploymentStatus,
} from '../../../shared'
import { UploadedFile } from 'express-fileupload'
import { messageSpecInstance } from '../server'
import { uploadConfigFile, generatePresignedUrl } from '../utils/file'

async function deployConfig(
    project: Project,
    configFile: UploadedFile
): Promise<[Deployment | null, string | null]> {
    // Create a new project deployment.
    const deployment = await createDeployment(project.id)
    if (!deployment) {
        return [null, 'Failed to create new deployment.']
    }

    // Upload the config file to S3.
    const fileUrl = await uploadConfigFile(configFile, project.uid, deployment.version)
    if (!fileUrl) {
        return [deployment, 'Config file upload failed.']
    }

    // Generate a pre-signed download url for the config file.
    const downloadUrl = await generatePresignedUrl(fileUrl)
    if (!downloadUrl) {
        return [deployment, 'Failed to generate config file download url.']
    }

    // Mark the deployment as uploaded.
    if (!(await updateDeploymentStatus(deployment.id, DeploymentStatus.Uploaded))) {
        return [deployment, 'Deployment status update (uploaded) failed.']
    }

    // Send the pre-signed download url to the project's live Spec instance.
    if (!(await messageSpecInstance(project.adminChannel, { url: downloadUrl }))) {
        return [deployment, 'Error sending config to Spec instance.']
    }

    // Mark the deployment as deployed.
    if (!(await updateDeploymentStatus(deployment.id, DeploymentStatus.Deployed))) {
        return [deployment, 'Deployment status update (deployed) failed.']
    }

    return [deployment, null]
}

export default deployConfig
