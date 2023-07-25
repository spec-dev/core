import { StringKeyMap } from "../types"

export async function paramsToTsvector(query: string, filters: StringKeyMap) {
    if (!query && !filters.chainIds?.length) {
        return [null, null, null]
    }

    // Format params.
    const formatQuery = (query: string, isInclusive: boolean) => {
        const splitQuery = query.split(/\s+/)
        const partialMatchQuery = splitQuery.map((input) => `${input}:*`)
        return isInclusive ? partialMatchQuery.join(' | ') : partialMatchQuery.join(' & ')
    }

    const formatFilters = (filters: [], isInclusive: boolean) => {
        return isInclusive ? filters.join(' | ') : filters.join(' & ')
    }

    const tsvectorQuery = query ? formatQuery(query, false) : null
    console.log(tsvectorQuery)
    const tsvectorChainFilter = filters.chainIds?.length ? formatFilters(filters.chainIds, false) : null
    const tsvectorQueryAndChainFilter = query && filters.chainIds?.length ? tsvectorQuery + ' & ' + tsvectorChainFilter : null

    return [tsvectorQuery, tsvectorChainFilter, tsvectorQueryAndChainFilter]
}