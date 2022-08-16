import { 
    logger, 
    getContractEventGeneratorData, 
    EthBlock, 
    toNamespacedVersion,
    EventGeneratorEntry,
    ContractInstanceEntry, 
    SpecFunctionResponse, 
    StringKeyMap, 
    EventVersionEntry, 
    PublishedEvent,
    initPublishedEvent,
    savePublishedEvents
} from 'shared'
import { fetch } from 'cross-fetch'
import { EventOrigin } from '../../../types'
import { emit } from '../../../events/relay'
import { SpecEvent, SpecEventOrigin } from '@spec.types/spec'

async function runEventGenerators(uniqueContractAddresses: Set<string>, block: EthBlock, chainId: number) {
    const addresses = Array.from(uniqueContractAddresses)
    if (!addresses.length) return

    const {
        instanceEntries,
        contractEventGeneratorEntries,
    } = await getContractEventGeneratorData(addresses)
    
    if (!instanceEntries.length) {
        logger.info(`[${chainId}:${block.number}] No verified contracts interacted with this block.`)
        return
    }

    logger.info(
        `[${chainId}:${block.number}] Running event generators for 
        ${Object.keys(contractEventGeneratorEntries).length} contract types.`
    )

    // Create event origin object.
    const eventOrigin = {
        chainId: chainId,
        blockNumber: block.number,
    }

    for (let contractInstanceEntry of instanceEntries) {
        const eventGeneratorEntries = contractEventGeneratorEntries[contractInstanceEntry.contractUid] || []

        for (let eventGeneratorEntry of eventGeneratorEntries) {
            performEventGenerator(
                contractInstanceEntry,
                eventGeneratorEntry,
                eventOrigin,
            )
        }
    }
}

async function performEventGenerator(
    contractInstanceEntry: ContractInstanceEntry,
    eventGeneratorEntry: EventGeneratorEntry,
    eventOrigin: EventOrigin,
) {
    let resp: Response
    try {
        resp = await fetch(eventGeneratorEntry.url, {
            method: 'POST',
            body: JSON.stringify({
                contractAddress: contractInstanceEntry.address,
                contractInstanceName: contractInstanceEntry.name,
                context: { uid: eventGeneratorEntry.uid },
            }),
            headers: { 
                'Content-Type': 'application/json',
                // TODO: Some type of auth header here...
            },
        })
    } catch (err) {
        logger.error(`Event Generator Error -- error during fetch: ${err?.message || err}`)
        return
    }

    if (resp.status !== 200) {
        logger.error(`Event Generator Error -- response status was ${resp.status}`)
        return
    }

    let respData: SpecFunctionResponse
    try {
        respData = await resp.json()
    } catch (err) {
        logger.error(`Event Generator Error -- failed to parse JSON response data: ${err?.message || err}`)
        return
    }

    if (respData.error) {
        logger.error(`Event Generator Failed - ${respData.error}`)
        return
    }

    const liveObjectDiffs = (respData.data || []) as StringKeyMap[]
    if (!liveObjectDiffs.length) {
        logger.info(`No diffs for ${contractInstanceEntry.name}.`)
        return
    }

    logger.info(`Diffs found for ${contractInstanceEntry.name}.`)

    await publishDiffsAsEvents(
        liveObjectDiffs, 
        eventGeneratorEntry.eventVersionEntries, 
        contractInstanceEntry.address,
        eventOrigin,
    )
}

async function publishDiffsAsEvents(
    liveObjectDiffs: StringKeyMap[],
    eventVersionEntries: EventVersionEntry[],
    contractAddress: string,
    eventOrigin: EventOrigin,
) {
    // Create array of PublishedEvents from SpecEvents of the live object diffs.
    const publishedEvents = liveObjectDiffsToPublishedEvents(
        liveObjectDiffs,
        eventVersionEntries,
        contractAddress,
        eventOrigin,
    )

    // Save list of PublishedEvents to ensure we have ids.
    const saved = await savePublishedEvents(publishedEvents)
    if (!saved) {
        // TODO: Either re-enqueue block or figure out wtf is going on.
        return
    }

    // Publish events.
    publishedEvents.forEach(publishedEvent => {
        const specEvent: SpecEvent<StringKeyMap> = {
            id: publishedEvent.uid,
            nonce: publishedEvent.id,
            name: publishedEvent.name,
            origin: publishedEvent.origin as SpecEventOrigin,
            object: publishedEvent.object,
        }
        emit(specEvent)
    })
}

function liveObjectDiffsToPublishedEvents(
    liveObjectDiffs: StringKeyMap[],
    eventVersionEntries: EventVersionEntry[],
    contractAddress: string,
    eventOrigin: EventOrigin,
): PublishedEvent[] {
    const publishedEvents: PublishedEvent[] = []
    for (let i = 0; i < eventVersionEntries.length; i++) {
        const eventVersionEntry = eventVersionEntries[i]
        const { nsp, name, version } = eventVersionEntry
        const liveObjectDiff = liveObjectDiffs[i] || null
        if (!liveObjectDiff) continue

        publishedEvents.push(initPublishedEvent(
            toNamespacedVersion(nsp, name, version),
            {
                ...eventOrigin,
                contractAddress,
                eventTimestamp: Date.now(),
            },
            liveObjectDiff,
        ))
    }
    return publishedEvents
}


export default runEventGenerators