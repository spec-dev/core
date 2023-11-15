import { StringKeyMap, ChainTables } from "../../../shared/dist/main"
import { ident } from 'pg-format'

export async function getUserPermissionsMigration(
    schemaName: string
): Promise<{ error: Error | null, userPermissionsMigration: StringKeyMap }> {
    let userPermissionsMigration = []

    try {
        if (await doesUserExist(schemaName)) return { error: null, userPermissionsMigration: [] }
    } catch (error) {
        return { error, userPermissionsMigration: null }
    }

    const identSchemaName = ident(schemaName)

    userPermissionsMigration = userPermissionsMigration.concat([
        // NSP SCHEMA
        {
            sql: `create user ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant usage on schema ${identSchemaName} to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all tables in schema ${identSchemaName} to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all sequences in schema ${identSchemaName} to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all functions in schema ${identSchemaName} to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema ${identSchemaName} grant all on tables to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema ${identSchemaName} grant all on sequences to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema ${identSchemaName} grant all on functions to ${identSchemaName}`,
            bindings: []
        },
        // PUBLIC
        {
            sql: `grant usage on schema public to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all tables in schema public to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all sequences in schema public to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `grant all privileges on all functions in schema public to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema public grant all on tables to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema public grant all on sequences to ${identSchemaName}`,
            bindings: []
        },
        {
            sql: `alter default privileges in schema public grant all on functions to ${identSchemaName}`,
            bindings: []
        },
    ])

    return { error: null, userPermissionsMigration }
}

async function doesUserExist(userName: string): Promise<boolean> {
    const query = {
        sql: `select count(*) from pg_user where usename = $1`,
        bindings: [userName],
    }

    let rows = []
    try {
        rows = await ChainTables.query(null, query.sql, query.bindings);
    } catch (err) {
        throw err
    }

    const count = rows ? Number((rows[0] || {}).count || 0) : 0
    return count > 0
}