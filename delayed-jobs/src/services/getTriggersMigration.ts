import { StringKeyMap } from "../../../shared"

export async function getTriggersMigration(
    schemaName: string,
    tableName: string
): Promise<{ error: Error | null, triggerMigrations: StringKeyMap }> {
    const triggerMigrations = [{
        'sql': `create trigger ${schemaName}_${tableName}_insert_ops after insert on ${schemaName}.${tableName} for each row execute procedure track_spec_table_ops('id')`,
        'bindings': []
    }, {
        'sql': `create trigger ${schemaName}_${tableName}_update_ops after insert on ${schemaName}.${tableName} for each row execute procedure track_spec_table_ops('id')`,
        'bindings': []
    }]
    return { error: null, triggerMigrations }
}