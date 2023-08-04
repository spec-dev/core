import { StringKeyMap, SharedTables } from "../../../shared/dist/main"

const sharedTablesManager = SharedTables.manager

export async function getUserPermissionsMigration(
    schemaName: string
): Promise<{ error: Error | null, userPermissionsMigration: StringKeyMap }> {
    let userPermissionsMigration = []

    try {
        if (!(await doesUserExist(schemaName))) {
            userPermissionsMigration.push({
                sql: `create user ${schemaName}`,
                bindings: []
            })
        }
    } catch (error) {
        return { error, userPermissionsMigration: null }
    }

    userPermissionsMigration = userPermissionsMigration.concat([
    {
        sql: `grant usage on schema ${schemaName} to ${schemaName}`,
        bindings: []
    },
    {
        sql: `grant all privileges on all tables in schema ${schemaName} to ${schemaName}`,
        bindings: []
    },
    {
        sql: `grant all privileges on all sequences in schema ${schemaName} to ${schemaName}`,
        bindings: []
    },
    {
        sql: `grant all privileges on all functions in schema ${schemaName} to ${schemaName}`,
        bindings: []
    },
    {
        sql: `alter default privileges in schema ${schemaName} grant all on tables to ${schemaName}`,
        bindings: []
    },
    {
        sql: `alter default privileges in schema ${schemaName} grant all on sequences to ${schemaName}`,
        bindings: []
    },
    {
        sql: `alter default privileges in schema ${schemaName} grant all on functions to ${schemaName}`,
        bindings: []
    }])

    return { error: null, userPermissionsMigration }
}

async function doesUserExist(userName: string): Promise<boolean> {
    const query = {
        sql: `select count(*) from pg_user where usename = $1`,
        bindings: [userName],
    }

    let rows = []
    try {
        rows = await sharedTablesManager.query(query.sql, query.bindings);
    } catch (err) {
        throw err
    }

    const count = rows ? Number((rows[0] || {}).count || 0) : 0
    return count > 0
}