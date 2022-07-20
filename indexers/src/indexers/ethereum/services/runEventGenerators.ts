import { logger, getContractEventGeneratorData } from 'shared'
import { fetch } from 'cross-fetch'

async function runEventGenerators(uniqueContractAddresses: Set<string>, blockNumber: number, chainId: number) {
    const addresses = Array.from(uniqueContractAddresses)
    const {
        instanceEntries,
        contractEventGeneratorEntries,
    } = await getContractEventGeneratorData(addresses)
    
    if (!instanceEntries.length) {
        logger.info(`[${chainId}:${blockNumber}] No verified contracts interacted with this block.`)
        return
    }

    logger.info(
        `[${chainId}:${blockNumber}] Running event generators for 
        ${Object.keys(contractEventGeneratorEntries).length} contract types.`
    )

    let promises = []
    for (let i = 0; i < instanceEntries.length; i++) {
        const instanceEntry = instanceEntries[i]
        const eventGenerators = contractEventGeneratorEntries[instanceEntry.contractUid] || []

        for (let j = 0; j < eventGenerators.length; j++) {
            const eventGenerator = eventGenerators[j]

            promises.push(performContractEventGenerator(
                instanceEntry.address,
                instanceEntry.name, 
                eventGenerator.uid,
                eventGenerator.url,
            ))
        }
    }

    await Promise.all(promises)
}

async function performContractEventGenerator(
    instanceAddress: string, 
    instanceName: string,
    eventGeneratorUid: string,
    eventGeneratorUrl: string,
) {
    let resp: Response
    try {
        resp = await fetch(eventGeneratorUrl, {
            method: 'POST', 
            body: JSON.stringify({ args: [instanceAddress, instanceName, { uid: eventGeneratorUid }] }),
            headers: { 
                'Content-Type': 'application/json',
            },
            // TODO: Some type of auth header here...
        })
    } catch (err) {
        logger.error(`Event Generator Error -- error during fetch: ${err?.message || err}`)
        return
    }

    if (resp.status !== 200) {
        logger.error(`Event Generator Error -- response status was ${resp.status}`)
        return
    }

    let respData: { [key: string]: any } = {}
    try {
        respData = await resp.json()
    } catch (err) {
        logger.error(`Event Generator Error -- failed to parse JSON response data: ${err?.message || err}`)
        return
    }

    if (respData.error) {
        logger.error(`Event Generator Failed - ${respData.error}`)
    }
}

export default runEventGenerators