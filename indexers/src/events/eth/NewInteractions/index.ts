import { EthLatestInteraction } from '../../../../../shared'
import { EthLatestInteraction as Diff } from '@spec.types/spec'

function NewInteractions(latestInteractions: EthLatestInteraction[]): Diff[] {
    return latestInteractions.map((li) => ({
        ...li,
        blockNumber: Number(li.blockNumber),
        timestamp: li.timestamp.toISOString(),
    }))
}

export default NewInteractions
