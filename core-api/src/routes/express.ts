import express from 'express'
import morgan from 'morgan'
import config from '../config'
import { specEnvs } from '../../../shared'
import paths from '../utils/paths'
import fileUpload from 'express-fileupload'

// Create Express app.
export const app = express()
app.use(fileUpload())
app.use(express.json())
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

// Health check route.
app.get(paths.HEALTH_CHECK, (_, res) => res.sendStatus(200))