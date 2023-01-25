import { SharedTables } from '../shared-tables/db/dataSource'

export const MAX_TABLE_NAME_LENGTH = 63

export async function doesSharedTableExist(schema: string, table: string): Promise<boolean> {
    const result = await SharedTables.query(
        `select count(*) from pg_tables where schemaname = $1 and tablename = $2`,
        [schema, table]
    )
    const count = result ? Number((result[0] || {}).count || 0) : 0
    return count > 0
}

export async function doesSharedViewExist(schema: string, view: string): Promise<boolean> {
    const result = await SharedTables.query(
        `select count(*) from pg_views where schemaname = $1 and viewname = $2`,
        [schema, view]
    )
    const count = result ? Number((result[0] || {}).count || 0) : 0
    return count > 0
}
