export async function formatParamsToTsvector (query: string, filter: string) {

    // Check for null params.
    if (!query && !filter) {
        return [null, null, null]
    }

    // Format params.
    const formatParam = (param, type) => {
        const splitParam = param.split(' ')
        const partialMatchParam = type === 'query' ? splitParam.map((input) => `${input}:*`) : splitParam
        const tsvectorParam = partialMatchParam.join(' & ')
        return tsvectorParam
    }

    const tsvectorQuery = query ? formatParam(query, 'query') : null
    const tsvectorFilter = filter ? formatParam(filter, 'filter') : null
    const tsvectorQueryAndFilter = query && filter ? tsvectorQuery + ' & ' + tsvectorFilter : null

    return [tsvectorQuery, tsvectorFilter, tsvectorQueryAndFilter]
}