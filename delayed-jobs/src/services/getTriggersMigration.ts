import { StringKeyMap, identPath } from "../../../shared"
import { ident } from 'pg-format'

export async function getTriggersMigration(
    schemaName: string,
    tableName: string
): Promise<{ error: Error | null, triggerMigrations: StringKeyMap }> {
    const triggerMigrations = [{
        'sql': `create trigger ${ident(`${schemaName}_${tableName}_insert_ops`)} after insert on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_spec_table_ops('id')`,
        'bindings': []
    }, {
        'sql': `create trigger ${ident(`${schemaName}_${tableName}_update_ops`)} after insert on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_spec_table_ops('id')`,
        'bindings': []
    }]
    return { error: null, triggerMigrations }
}