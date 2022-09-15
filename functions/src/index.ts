import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import { specEnvs } from './lib/env'
import logger from './lib/logger'
import errors from './lib/errors'
import { parseEdgeFunctionCompsFromUrl, isValidVersionFormat } from './lib/url'
import { getEdgeFunction } from './functions'

// Create Express app.
const app = express()
app.use(express.json())
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

app.post('/:functionPath', async (req, res) => {
    // Parse the edge function components from the url path.
    const { nsp, name, version } = parseEdgeFunctionCompsFromUrl(req.url)
    if (!nsp || !name || (version && !isValidVersionFormat(version))) {
        return res.status(codes.NOT_FOUND).json({ error: errors.FUNCTION_NOT_FOUND })
    }

    // Get the edge function (if exists).
    const func = getEdgeFunction(nsp, name, version)
    if (!func) {
        return res.status(codes.NOT_FOUND).json({ error: errors.FUNCTION_NOT_FOUND })
    }

    // Perform the edge function.
    let output: any
    try {
        output = await func(req.body, res)
    } catch (err) {
        logger.error(err)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err?.message || err })
    }

    // Return a basic JSON response if not streaming the response.
    if (output) {
        return res.status(codes.SUCCESS).json(output)
    }
})

;(async () => {
    app.listen(config.PORT, () => logger.info(`Functions API listening on port ${config.PORT}...`))
})()