import { EthLatestInteraction } from '../../../../../shared/src'
import { EthLatestInteraction as Diff } from '@spec.types/spec'

function NewInteractions(latestInteractions: EthLatestInteraction[]): Diff[] {
    return latestInteractions.map(li => ({ 
        ...li, 
        timestamp: li.timestamp.toISOString(),
    }))
}

export default NewInteractions