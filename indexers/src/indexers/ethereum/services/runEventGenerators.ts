import { logger, getContractEventGeneratorData, EthBlock, dateToUnixTimestamp } from 'shared'
import { fetch } from 'cross-fetch'
import { EventOrigin } from '../../../types'

async function runEventGenerators(uniqueContractAddresses: Set<string>, block: EthBlock) {
    const addresses = Array.from(uniqueContractAddresses)
    if (!addresses.length) return

    const {
        instanceEntries,
        contractEventGeneratorEntries,
    } = await getContractEventGeneratorData(addresses)
    
    if (!instanceEntries.length) {
        logger.info(`[${block.chainId}:${block.number}] No verified contracts interacted with this block.`)
        return
    }

    logger.info(
        `[${block.chainId}:${block.number}] Running event generators for 
        ${Object.keys(contractEventGeneratorEntries).length} contract types.`
    )

    // Create event origin object.
    const eventOrigin = {
        chainId: block.chainId,
        blockNumber: block.number,
        blockHash: block.hash,
        blockTimestamp: dateToUnixTimestamp(block.timestamp),
    }

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
                eventOrigin,
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
    eventOrigin: EventOrigin,
): Promise<boolean> {
    const context = {
        uid: eventGeneratorUid,
        origin: eventOrigin,
    }

    let resp: Response
    try {
        resp = await fetch(eventGeneratorUrl, {
            method: 'POST',
            body: JSON.stringify({ args: [instanceAddress, instanceName, context] }),
            headers: { 
                'Content-Type': 'application/json',
            },
            // TODO: Some type of auth header here...
        })
    } catch (err) {
        logger.error(`Event Generator Error -- error during fetch: ${err?.message || err}`)
        return false
    }

    if (resp.status !== 200) {
        logger.error(`Event Generator Error -- response status was ${resp.status}`)
        return false
    }

    let respData: { [key: string]: any } = {}
    try {
        respData = await resp.json()
    } catch (err) {
        logger.error(`Event Generator Error -- failed to parse JSON response data: ${err?.message || err}`)
        return false
    }

    if (respData.error) {
        logger.error(`Event Generator Failed - ${respData.error}`)
        return false
    }

    return true
}

export default runEventGenerators