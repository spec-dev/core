import { EventVersion } from '../../shared'

export interface InputEventDataEntry {
    eventVersion: EventVersion,
    addresses: string[]
}