import algoliasearch from 'algoliasearch'
import { capitalizeFirstLetter, logger } from '../../../../shared'
import chalk from 'chalk'
import { NamespaceModel } from '../../resources/algolia/namespaceModel'
import { namespaceSearchInstances } from '../../resources/algolia'

async function indexNamespaceData() {
    const client = algoliasearch(process.env.ALGOLIA_APPLICATION_ID, process.env.ALGOLIA_ADMIN_API_KEY)
    const nspName = process.env.ALGOLIA_NAMESPACE
    const index = client.initIndex(nspName)

    try {
        const namespace = await new NamespaceModel().getNamespace(nspName)
        if (!namespace) {
            logger.info(`No ${capitalizeFirstLetter(nspName)} data found.`)
            return
        }
        
        const algoliaRecord = {...namespace}
        const resources = namespaceSearchInstances

        await Promise.all(resources.map(async (resource) => {
            const data = await resource.getData(nspName)
            if (!data) {
                logger.info(`No ${resource.resourceName} data found.`)
                return
            }
            algoliaRecord[resource.nspSearchProperty] = data
        }))

        namespace
            ? logger.info(chalk.cyanBright(`Retrieving data for ${capitalizeFirstLetter(nspName)}...`)) 
            : logger.info(chalk.cyanBright(`No ${capitalizeFirstLetter(nspName)} data available.`))
            await index.saveObject({
                ...algoliaRecord,
                objectID: namespace.id,
            })
            logger.info(chalk.greenBright('Data saved.'))
    } catch (err) {
        logger.error(`Error saving ${capitalizeFirstLetter(nspName)} data to Aloglia: ${err.message}`)
    }
}

export default indexNamespaceData