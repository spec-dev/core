import { initPublishedEvent, savePublishedEvents, PublishedEvent, StringKeyMap, logger } from 'shared'
import { SpecEvent } from '@spec.types/spec'

let batch: PublishedEvent[] = []

export function cacheMessage(event: SpecEvent<StringKeyMap>) {
    batch.push(initPublishedEvent(event))
}

export async function saveCachedBatch() {
    if (!batch.length) return
    await savePublishedEvents(batch)
    batch = []
}