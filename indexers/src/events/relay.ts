
import { SpecEvent } from '@spec.types/spec'
import { StringKeyMap, logger } from 'shared'

export async function emit(event: SpecEvent<StringKeyMap>, channel: string) {
    logger.info(`Emitting ${event.name} to ${channel} channel...`)
}