import { execSync } from 'node:child_process'
import { logger, parseUrls } from '../../../shared'

export function deployToDeno(project: string, filePath: string): string | null {
    let out = ''
    try {
        const stdout = execSync(`deployctl deploy --project=${project} ${filePath}`)
        if (!stdout) throw 'No stdout returned from deployctl deploy'
        out = stdout.toString().trim()
    } catch (err) {
        logger.error(`Error deploying ${filePath} to deno (project=${project}): ${err.message || err}`)
        return null
    }
    return parseDeployedFunctionUrlFromStdout(out)
}

function parseDeployedFunctionUrlFromStdout(stdout: string): string | null {
    const foundUrls = parseUrls(stdout)
    if (!foundUrls?.length) return null
    return foundUrls.find(url => url.includes('deno')) || null
}