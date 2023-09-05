import { AbiItemType, CoreDB, camelizeKeys, getContractGroupAbi, logger } from '../../../shared'
import { StringKeyMap } from '../types'

export async function searchEventVersions(name: string): Promise<StringKeyMap> {
    let results
    let uniqueContractGroupsSet = new Set()
    let contractGroupAbisMap = {}

    // Query database.
    try {
        results = await CoreDB.query(
            `SELECT DISTINCT ON (search_id)
                name,
                version,
                search_id,
                contract_group
            FROM
                (SELECT 
                    nsp, 
                    name,
                    version, 
                    CASE
                        WHEN nsp LIKE '%.%'
                            THEN CONCAT(ARRAY_TO_STRING((STRING_TO_ARRAY(nsp, '.'))[3:4], '.'), '.', name, '@', version)
                        ELSE CONCAT(nsp, '.', name, '@', version)
                    END as search_id,
                    CASE
                        WHEN nsp LIKE '%.%'
                            THEN ARRAY_TO_STRING((STRING_TO_ARRAY(nsp, '.'))[3:4], '.')
                        ELSE nsp
                    END as contract_group
                FROM event_versions
                WHERE 
                CASE 
                    WHEN $1::text IS NOT NULL 
                        THEN (nsp || '.' || name) ILIKE CONCAT('%.contracts.', $1, '%')
                    ELSE TRUE
                END) AS uev
            LIMIT 5;`, [name]
        )
    } catch (err) {
        logger.error(`Error searching event versions: ${err}`)
        return { error: err?.message || err }
    }

    // Camelize result keys.
    results = camelizeKeys(results)

    // Store unique contract groups.
    results.forEach(result => uniqueContractGroupsSet.add(result.contractGroup))
    const uniqueContractGroups = Array.from(uniqueContractGroupsSet) as string[]

    // Retrieve and store redis abi data for each contract group.
    const abis = await Promise.all(
        uniqueContractGroups.map((group: string) => getContractGroupAbi(group))
    )

    for (let i = 0; i < uniqueContractGroups.length; i++) {
        const group = uniqueContractGroups[i]
        const abi = abis[i]
        contractGroupAbisMap[group] = abi
    }

    // Format results for CLI.
    function formatForCLI(result) {
        let finalResult = {
            searchId: result.searchId,
            addressProperties: []
        }

        const abi = contractGroupAbisMap[result.contractGroup]
        if (!abi?.length) return finalResult

        const event = abi.find(item => (
            item.type === AbiItemType.Event &&
            item.name === result.name &&
            item.signature === result.version
        ))
        if (!event) return finalResult

        const addressProperties = event.inputs
            .filter(input => input.type === 'address')
            .map(input => input.name)
        if (!addressProperties.length) return finalResult
        
        return {...finalResult, addressProperties}
    }

    return { data: results.map(formatForCLI) }
}