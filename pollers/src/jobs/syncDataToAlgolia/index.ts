import algoliasearch from 'algoliasearch'
import { logger } from '../../../../shared'
import { resourceInstances } from '../../resources/algolia'
import chalk from 'chalk'
import config from '../../config'

let timeSynced

async function syncDataToAlgolia() {
    const client = algoliasearch(config.ALGOLIA_APPLICATION_ID, config.ALGOLIA_ADMIN_API_KEY)
    const syncAll = config.ALGOLIA_SYNC_ALL
    const resources = resourceInstances

    resources.map(async (resource) => {
        const data = await resource.getUpdated(timeSynced, syncAll)
        if (!data) {
            logger.info(`No ${resource.resourceName} data found.`)
            return
        }
        
        const indexName = resource.indexName
        const index = client.initIndex(indexName)
        
        try {
            data.length 
                ? logger.info(chalk.cyanBright(`Syncing ${data.length} ${resource.resourceName}s to Algolia...`)) 
                : logger.info(chalk.cyanBright(`No ${resource.resourceName}s to sync.`))
            data.forEach(entry => index.saveObject({...entry, objectID: entry.id}))
            timeSynced = new Date().toISOString()
        } catch (err) {
            logger.error(`Error syncing ${resource.resourceName} data to Aloglia: ${err}`)
        }
    })
}

export default syncDataToAlgolia