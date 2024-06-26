import express from 'express'
import morgan from 'morgan'
import config from '../config'
import { specEnvs } from '../../../shared'
import paths from '../utils/paths'
import fileUpload from 'express-fileupload'
import cors from 'cors'

// Create Express app.
export const app = express()
app.use(fileUpload())
app.use(cors())
app.use(express.json({ limit: '50mb' }))
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

// Health check route.
app.get(paths.HEALTH_CHECK, (_, res) => res.sendStatus(200))
