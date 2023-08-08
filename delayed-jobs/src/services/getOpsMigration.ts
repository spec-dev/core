import {
    StringKeyMap,
    SharedTables,
    identPath
} from "../../../shared"
const sharedTablesManager = SharedTables.manager

export async function getOpsMigration(
    schemaName: string,
    tableName: string,
    chains: string[]
): Promise<{ error: Error | null, opsMigration: StringKeyMap }> {

    const opsMigration = []

    for (const chainId of chains) {
        const isEnabledAbove = await getIsEnabledAbove(chainId)
        opsMigration.push({
            sql: `insert into op_tracking(table_path, chain_id, is_enabled_above) values($1, $2, $3)`,
            bindings: [identPath(`${schemaName}.${tableName}`),  chainId, isEnabledAbove],
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
        rows = await sharedTablesManager.query(query.sql, query.bindings);
        if (rows.length === 0) {
            throw Error(`No op_tracking entry for chain_id: ${chainId}. If you are running localy, add some fake op_tracking entries to the db.`)
        }
        return rows[0].is_enabled_above
    } catch (err) {
        throw err
    }
}
