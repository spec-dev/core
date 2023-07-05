import { StringKeyMap } from "../types"

export async function paramsToTsvector(query: string, filters: StringKeyMap) {
    // Check for null params.
    if (!query && !Object.keys(filters).length) {
        return [null, null, null]
    }

    // Format params.
    const formatQuery = (query: string, isInclusive: boolean) => {
        const splitQuery = query.split(' ')
        const partialMatchQuery = splitQuery.map((input) => `${input}:*`)
        return isInclusive ? partialMatchQuery.join(' | ') : partialMatchQuery.join(' & ')
    }

    const formatFilters = (filters: [], isInclusive: boolean) => {
        return isInclusive ? filters.join(' | ') : filters.join(' & ')
    }

    const tsvectorQuery = query ? formatQuery(query, false) : null
    const tsvectorChainFilter = filters.chainIds ? formatFilters(filters.chainIds, false) : null
    const tsvectorQueryAndChainFilter = query && Object.keys(filters).length ? tsvectorQuery + ' & ' + tsvectorChainFilter : null

    return [tsvectorQuery, tsvectorChainFilter, tsvectorQueryAndChainFilter]
}