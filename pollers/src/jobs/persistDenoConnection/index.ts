import { getCustomLiveObjectVersionUrls, logger, toChunks } from '../../../../shared'
import chalk from 'chalk'
import config from '../../config'

async function persistDenoConnection() {
    const urls = await getCustomLiveObjectVersionUrls()
    if (!urls) {
        logger.error('Error getting custom live object version urls')
        return
    }
    if (urls.length === 0) {
        logger.info(chalk.cyanBright(`No live object versions to pull for.`))
        return
    }

    const batchSize = config.DENO_URL_BATCH_SIZE
    const urlBatches = toChunks(urls, batchSize)
    logger.info(chalk.cyanBright(`Starting Deno connections for ${urls.length} live object versions...`)) 

    const headers = {
        [config.EVENT_GEN_AUTH_HEADER_NAME]: config.EVENT_GENERATORS_JWT,
        'Content-Type': 'application/json',
    }
    for (const batch of urlBatches) {
        let responses
        try {
            responses = await Promise.all(batch.map(url => fetch(url, {
                method: 'POST',
                body: JSON.stringify([]),
                headers,
            })))
        } catch (err) {
            logger.error(`Error starting Deno connection: ${err}`)
            return
        }
        for (let i = 0; i < responses.length; i++) {
            if (responses[i].status !== 200) {
                logger.error(`Deno response failed for url ${urls[i]}`)
            }
        }
    }
    logger.info(chalk.cyanBright(`Success.`)) 
}

export default persistDenoConnection