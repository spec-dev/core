import { 
    logger, 
    getContractEventGeneratorData, 
    EthBlock, 
    dateToUnixTimestamp, 
    toNamespacedVersion,
    EventGeneratorEntry, 
    ContractInstanceEntry, 
    SpecFunctionResponse, 
    StringKeyMap, 
    EventVersionEntry, 
    currentUnixTs, 
    EventTopic,
} from 'shared'
import { fetch } from 'cross-fetch'
import { EventOrigin } from '../../../types'
import { SpecEvent } from '@spec.types/spec'

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
                args: [
                    contractInstanceEntry.address, 
                    contractInstanceEntry.name, 
                    { uid: eventGeneratorEntry.uid }
                ]
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

    await emitDiffsAsEvents(
        liveObjectDiffs, 
        eventGeneratorEntry.eventVersionEntries, 
        contractInstanceEntry.address,
        eventOrigin,
    )
}

async function emitDiffsAsEvents(
    liveObjectDiffs: StringKeyMap[],
    eventVersionEntries: EventVersionEntry[],
    contractAddress: string,
    eventOrigin: EventOrigin,
) {
    let promises = []
    for (let i = 0; i < eventVersionEntries.length; i++) {
        const eventVersionEntry = eventVersionEntries[i]
        const { nsp, name, version, topic } = eventVersionEntry
        const liveObjectDiff = liveObjectDiffs[i] || null
        if (!liveObjectDiff) continue

        promises.push(emit({
            name: toNamespacedVersion(nsp, name, version),
            origin: {
                ...eventOrigin,
                contractAddress,
                broadcastTimestamp: currentUnixTs(),
            },
            object: liveObjectDiff,
        }, topic))
    }
    await Promise.all(promises)
}

async function emit(event: SpecEvent<StringKeyMap>, topic: EventTopic) {
    console.log(`Emitting ${event.name} to ${topic} topic`)
    console.log(event)
}

export default runEventGenerators