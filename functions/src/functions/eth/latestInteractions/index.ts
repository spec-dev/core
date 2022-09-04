import { streamQuery, ethereum } from '@spec.dev/table-client'
import { EthLatestInteractionType } from '@spec.types/spec'
import { withArrayKeys } from '../../shared/args'

export type Input = {
    from?: string | string[]
    to?: string | string[]
    interactionType?: EthLatestInteractionType | EthLatestInteractionType[]
}

async function latestInteractions(input: Input, res: Response): Promise<void> {
    // Convert each input arg into an array (if present and not already an array).
    input = withArrayKeys(input)

    // Query ethereum.latest_interactions for all records "WHERE IN" the given input args.
    let query = ethereum.latestInteractions()
    input.from !== undefined && query.whereIn('from', input.from)
    input.to !== undefined && query.whereIn('to', input.to)
    input.interactionType !== undefined && query.whereIn('interaction_type', input.interactionType)

    // Stream the query results in batches.
    return streamQuery(query, res)
}

export default latestInteractions