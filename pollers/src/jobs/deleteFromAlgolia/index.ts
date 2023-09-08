import algoliasearch from 'algoliasearch'
import { logger } from '../../../../shared/dist/main'
import { resourceInstances } from '../../resources/algolia'
import chalk from 'chalk'

async function deleteFromAlgolia() {
    const client = algoliasearch(process.env.ALGOLIA_APPLICATION_ID, process.env.ALGOLIA_ADMIN_API_KEY)
    const resources = resourceInstances
    const idsToDelete = {
        namespace: [],
        contract: [],
        event: [],
        liveObject: []
    }

    resources.forEach(async (resource) => {
        const ids = idsToDelete[resource.resourceName] || []
        if (!ids.length) {
            logger.info(`No ${resource.resourceName} data to delete.`)
            return
        }

        const indexName = resource.indexName
        const index = client.initIndex(indexName)
        
        try {
            logger.info(chalk.cyanBright(`Deleting ${ids.length} ${resource.resourceName}s from Algolia...`)) 
            index.deleteObjects(ids)
        } catch (err) {
            logger.error(`Error deleting ${resource.resourceName} data from Aloglia: ${err}`)
        }
    })
}

export default deleteFromAlgolia