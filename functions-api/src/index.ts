import httpProxy from 'http-proxy'
import http from 'http'
import config from './config'
import getEdgeFunctionUrl from './services/getEdgeFunctionUrl'
import { methods, errorResp, errorMsg } from './utils/requests'
import { parseEdgeFunctionCompsFromUrl } from './utils/url'
import { isValidVersionFormat } from './utils/version'
import { coreRedis, logger, CoreDB } from 'shared'

// Create proxy server to pipe function calls to Deno.
const proxy = httpProxy.createProxyServer({})

async function proxyToEdgeFunction(req, res) {
    // Parse edge function components from url.
    const { nsp, functionName, version } = parseEdgeFunctionCompsFromUrl(req.url)
    if (!nsp || !functionName) {
        return errorResp(res, errorMsg.FUNCTION_NOT_FOUND)
    }
    if (version && !isValidVersionFormat(version)) {
        return errorResp(res, errorMsg.MALFORMED_VERSION)
    }

    // Get the url of the edge function running on Deno.
    const url = await getEdgeFunctionUrl(nsp, functionName, version)
    if (!url) {
        return errorResp(res, errorMsg.FUNCTION_NOT_FOUND)
    }

    // Proxy request to Deno function.
    proxy.web(req, res, { target: url })
}

// Handle new HTTP requests.
async function onRequest(req, res) {
    switch (req.method) {
        case methods.POST:
            return await proxyToEdgeFunction(req, res)
        default:
            return errorResp(res, errorMsg.FUNCTION_NOT_FOUND)
    }
}

async function listen() {
    await Promise.all([CoreDB.initialize(), coreRedis.connect()])
    const server = http.createServer({}, onRequest)
    console.log(`Listening on ${config.PORT}...`)
    server.listen(config.PORT)
}

listen()
