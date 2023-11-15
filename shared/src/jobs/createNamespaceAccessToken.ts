import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { createNamespaceAccessToken } from '../lib/core/db/services/namespaceAccessTokenService'

async function perform(namespaceId: number, scopes: string) {
    await CoreDB.initialize()
    logger.info(`Creating namespace access token...`)

    const scopesArr = scopes
        .split(',')
        .map((s) => s.trim())
        .filter((s) => !!s)
    const nspAccessToken = await createNamespaceAccessToken(namespaceId, scopesArr)
    logger.info('Success. namespace_access_token.id = ', nspAccessToken.id)

    exit(0)
}

export default perform
