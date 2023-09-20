import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import paths from './lib/paths'
import errors from './lib/errors'
import { parseCallPayload, parseMetadataPayload, parseERC20TokenMetadataPayload } from './lib/payload'
import { authRequest } from './lib/auth'
import { specEnvs, logger, resolveMetadata } from '../../shared'
import { callContract } from './services/callContract'
import { getERC20TokenMetadata } from './services/getERC20TokenMetadata'

// Create Express app.
const app = express()
app.use(express.json({ limit: '50mb' }))
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

// Health check route.
app.get(paths.HEALTH_CHECK, (_, res) => res.sendStatus(200))

/**
 * Call a smart contract method.
 */
app.post(paths.CALL, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        const [code, message] = [codes.UNAUTHORIZED, errors.UNAUTHORIZED]
        return res.status(code).json({ error: { message, code } })
    }

    // Parse and validate payload.
    const { payload, isValid, error } = parseCallPayload(req.body)
    if (!isValid) {
        const [code, message] = [codes.BAD_REQUEST, error || errors.INVALID_PAYLOAD]
        return res.status(code).json({ error: { message, code } })
    }
    
    // Proxy call to/from smart contract.
    const { chainId, contractAddress, abiItem, inputs } = payload
    const resp = await callContract(chainId, contractAddress, abiItem, inputs)
    const code = resp.error?.code === codes.INTERNAL_SERVER_ERROR ? resp.error.code : codes.SUCCESS
    return res.status(code).json(resp)
})

/**
 * Resolve off-chain metadata.
 */
app.post(paths.METADATA, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        const [code, message] = [codes.UNAUTHORIZED, errors.UNAUTHORIZED]
        return res.status(code).json({ error: { message, code } })
    }

    // Parse and validate payload.
    const { payload, isValid, error } = parseMetadataPayload(req.body)
    if (!isValid) {
        const [code, message] = [codes.BAD_REQUEST, error || errors.INVALID_PAYLOAD]
        return res.status(code).json({ error: { message, code } })
    }
    
    // Proxy call to/from metadata gateway.
    const { protocolId, pointer } = payload
    const resp = await resolveMetadata(protocolId, pointer)
    const code = resp.error?.code === codes.INTERNAL_SERVER_ERROR ? resp.error.code : codes.SUCCESS
    return res.status(code).json(resp)
})

/**
 * Get ERC-20 token metadata.
 */
 app.post(paths.ERC20_TOKEN_METADATA, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        const [code, message] = [codes.UNAUTHORIZED, errors.UNAUTHORIZED]
        return res.status(code).json({ error: { message, code } })
    }

    // Parse and validate payload.
    const { payload, isValid, error } = parseERC20TokenMetadataPayload(req.body)
    if (!isValid) {
        const [code, message] = [codes.BAD_REQUEST, error || errors.INVALID_PAYLOAD]
        return res.status(code).json({ error: { message, code } })
    }
    
    // Proxy calls to/from smart contract.
    const { chainId, tokenAddress } = payload
    const resp = await getERC20TokenMetadata(chainId, tokenAddress)
    return res.status(codes.SUCCESS).json(resp)
})

;(async () => {
    app.listen(config.PORT, () => (
        logger.info(`Listening on port ${config.PORT}...`)
    ))
})()