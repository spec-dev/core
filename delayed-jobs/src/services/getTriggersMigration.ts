import { StringKeyMap, identPath } from "../../../shared"
import { ident } from 'pg-format'

export function getTriggersMigration(
    schemaName: string,
    tableName: string,
    pkColumnName: string,
): StringKeyMap[] {
    return [
        {
            sql: `create trigger ${ident(`${schemaName}_${tableName}_insert_ops`)} after insert on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_spec_table_ops('${pkColumnName}')`,
            bindings: []
        },
        {
            sql: `create trigger ${ident(`${schemaName}_${tableName}_update_ops`)} after update on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_spec_table_ops('${pkColumnName}')`,
            bindings: []
        },
        {
            sql: `create trigger ${ident(`${schemaName}_${tableName}_increment_count`)} after insert on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_record_counts()`,
            bindings: []
        },
        {
            sql: `create trigger ${ident(`${schemaName}_${tableName}_decrement_count`)} after delete on ${identPath(`${schemaName}.${tableName}`)} for each row execute procedure track_record_counts()`,
            bindings: []
        },
    ]
}