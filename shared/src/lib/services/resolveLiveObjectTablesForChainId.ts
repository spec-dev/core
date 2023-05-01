import { CoreDB, LiveObjectVersion } from '../..'
import {
    getCachedLiveObjectTablesByChainId,
    registerLiveObjectTablesForChainId,
} from '../indexer/redis'
import logger from '../logger'
import { chainIdForSchema } from '../utils/chainIds'
import { unique } from '../utils/formatters'

const lovsRepo = () => CoreDB.getRepository(LiveObjectVersion)

async function resolveLiveObjectTablesForChainId(chainId: string): Promise<string[]> {
    const cachedResults = (await getCachedLiveObjectTablesByChainId(chainId)) || []
    if (cachedResults.length) return cachedResults

    let lovConfigs = []
    try {
        lovConfigs = await lovsRepo().find({
            // @ts-ignore
            select: { config: true },
        })
    } catch (err) {
        logger.error(`Failed to fetch configs for live object versions`, err)
        return []
    }

    const liveObjectTables = unique(
        lovConfigs
            .filter((config) => {
                const tablePathComps = config.table?.split('.') || []
                const schema = tablePathComps[0]

                // Exclude any primitive tables or views in those schemas.
                if (!schema || chainIdForSchema.hasOwnProperty(schema)) {
                    return false
                }

                const chains = config.chains || {}
                return chains.hasOwnProperty(chainId)
            })
            .map((config) => config.table)
    )

    if (!liveObjectTables.length) return []

    await registerLiveObjectTablesForChainId(chainId, liveObjectTables)
    return liveObjectTables
}

export default resolveLiveObjectTablesForChainId
