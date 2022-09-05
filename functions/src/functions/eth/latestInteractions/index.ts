import { streamQuery, ethereum } from '@spec.dev/table-client'
import { EthLatestInteractionType } from '@spec.types/spec'
import { groupInputKeys } from '../../shared/args'

export type Input = {
    from?: string
    to?: string
    interactionType?: EthLatestInteractionType
}

async function latestInteractions(input: Input | Input[], res: Response) {
    // Group input keys into arrays.
    const { from, to, interactionType } = groupInputKeys(input)

    // Query ethereum.latest_interactions for all records "WHERE IN" the given input args.
    let query = ethereum.latestInteractions()
    from && query.whereIn('from', from)
    to && query.whereIn('to', to)
    interactionType && query.whereIn('interaction_type', interactionType)

    // Stream the query results in batches.
    streamQuery(query, res)
}

export default latestInteractions