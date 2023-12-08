import {
    StringKeyMap,
    ChainTables,
} from "../../../shared"

export async function getOpsMigration(
    schemaName: string,
    tableName: string,
    chains: string[]
): Promise<{ error?: Error | null, opsMigration?: StringKeyMap }> {
    const opsMigration = []
    for (const chainId of chains) {
        let isEnabledAbove
        try {
            isEnabledAbove = await getIsEnabledAbove(chainId)
        } catch (err) {
            return { error: err }
        }
        opsMigration.push({
            sql: `insert into op_tracking(table_path, chain_id, is_enabled_above) values ($1, $2, $3) on conflict (table_path, chain_id) do nothing`,
            bindings: [`${schemaName}.${tableName}`, chainId, isEnabledAbove],
        })
    }
    return { error: null, opsMigration }
}

async function getIsEnabledAbove(chainId: string): Promise<boolean> {
    const query = {
        sql: `select is_enabled_above from op_tracking where chain_id = $1 limit 1`,
        bindings: [chainId],
    }

    let rows = []
    try {
        rows = await ChainTables.query(null, query.sql, query.bindings);
        if (rows.length === 0) {
            throw Error(`No op_tracking entry for chain_id: ${chainId}. If you are running localy, add some fake op_tracking entries to the db.`)
        }
        return rows[0].is_enabled_above
    } catch (err) {
        throw 'FUCKKK'
    }
}
