import { streamQuery, ethereum } from '@spec.dev/table-client'
import { EthLatestInteractionType } from '@spec.types/spec'
import { keysAsNonEmptyArrays, preventEmptyQuery } from '../../shared/args'
import { applyFilter } from '../../shared/filters'
import { Filter } from '../../shared/types'

type Input = {
    from?: string | string[]
    to?: string | string[]
    interactionType?: EthLatestInteractionType | EthLatestInteractionType[]
    timestamp?: string | string[] | Filter<string> | Filter<string>[]
}

async function latestInteractions(input: Input, res: Response) {
    // Parse given input filters and ensure at least one exists.
    const filters = keysAsNonEmptyArrays(input)
    const { from, to, interactionType, timestamp } = filters
    if (preventEmptyQuery(filters, res)) return

    // Start a query against the "ethereum.latest_interactions" table.
    let query = ethereum.latestInteractions()

    // Apply the given filters.
    from && query.whereIn('from', from)
    to && query.whereIn('to', to)
    interactionType && query.whereIn('interaction_type', interactionType)
    timestamp && applyFilter(query, 'timestamp', timestamp)

    // Stream the query response as results become available.
    streamQuery(query, res)
}

export default latestInteractions