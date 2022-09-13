import AWS from 'aws-sdk'
import config from '../config'
import { UploadedFile } from 'express-fileupload'
import { logger } from '../../../shared'
import { HttpRequest } from '@aws-sdk/protocol-http'
import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { parseUrl } from '@aws-sdk/url-parser'
import { Hash } from '@aws-sdk/hash-node'

export const TOML_MIME_TYPE = 'application/toml'

const credentials = {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
}

const s3 = new AWS.S3(credentials)

export const configFilePath = (projectUid: string, version: string): string => (
    `${projectUid}/${version}.toml`
)

export async function uploadConfigFile(
    configFile: UploadedFile,
    projectUid: string,
    version: string,
): Promise<string | null> {
    const params = {
        Bucket: config.S3_BUCKET_NAME,
        Key: configFilePath(projectUid, version),
        Body: configFile,
    }

    return new Promise((res, _) => {
        try {
            s3.upload(params, function(err, data) {
                if (err) {
                    logger.error(`Uploading ${params.Key} failed: ${err}`)
                    res(null)
                    return
                }
                res(data.Location)
            })    
        } catch (err) {
            logger.error(`Uploading ${params.Key} failed: ${err}`)
            res(null)
        }
    })
}

export async function generatePresignedUrl(fileUrl: string): Promise<string | null> {
    const presigner = new S3RequestPresigner({
        credentials,
        region: config.S3_REGION,
        sha256: Hash.bind(null, 'sha256'),
    })

    let downloadUrl
    try {
        downloadUrl = await presigner.presign(new HttpRequest(parseUrl(fileUrl)))
    } catch (err) {
        logger.error(`Error generating pre-signed url for ${fileUrl}: ${err}`)
        return null
    }
    return downloadUrl
}