import { StringKeyMap, identPath } from "../../../shared"
import { ident } from 'pg-format'

export function getSchemaOpsMigration(
    schemaName: string,
    tableName: string
): StringKeyMap[] {
    return [{
        'sql': `create table if not exists ${identPath(`${schemaName}.${tableName}_ops`)}(` +
            'id serial primary key, ' +
            'pk_names text not null, ' +
            'pk_values text not null, ' +
            '"before" json, ' +
            '"after" json, ' +
            'block_number bigint not null, ' +
            'chain_id varchar not null, ' +
            'ts timestamp with time zone not null default (now() at time zone \'utc\') ' +
            ')'
        ,
        'bindings': []
    },
    {
        'sql': `create index ${ident(`idx_${schemaName}_${tableName}_ops_pk`)} on ${identPath(`${schemaName}.${tableName}_ops`)}(pk_values)`,
        'bindings': []
    },
    {
        'sql': `create index ${ident(`idx_${schemaName}_${tableName}_ops_where`)} on ${identPath(`${schemaName}.${tableName}_ops`)}(block_number, chain_id)`,
        'bindings': []
    },
    {
        'sql': `create index ${ident(`idx_${schemaName}_${tableName}_ops_order`)} on ${identPath(`${schemaName}.${tableName}_ops`)}(pk_values, block_number, ts)`,
        'bindings': []
    }]
}


// export async function getSchemaOpsMigration(
//     tableName: string
// ): Promise<{ error: Error | null, schemaOpsMigration: StringKeyMap }> {
//     // const tableName = identPath(`${schemaName}.${tableName }_ops`) TODO::

//     const tPath = identPath(tableName)
//     const triggerInsertPath = `${tPath.replace('.', '_')}_insert_ops`
//     const triggerUpdatePath = `${tPath.replace('.', '_')}_update_ops`

//     function createTableName(tableName) {
//         const [schemaName, baseTableName] = tableName.split('.')
    
//         // identPath()

//         return tableName.replace('.', '_')
//     }

//     // const schemaOpsMigration = [{
//     //     'sql': `create table if not exists ${schemaName}.${tableName}_ops(` +
//     //                 'id serial primary key, ' +
//     //                 'pk_names text not null, ' +
//     //                 'pk_values text not null, ' +
//     //                 '"before" json, ' +
//     //                 '"after" json, ' +
//     //                 'block_number bigint not null, ' +
//     //                 'chain_id varchar not null, ' +
//     //                 'ts timestamp with time zone not null default (now() at time zone \'utc\') ' +
//     //             ')'
//     //     ,
//     //     'bindings': []
//     // },
//     // {
//     //     'sql': `create index idx_${schemaName}_${tableName}_ops_pk on ${schemaName}.${tableName}_ops(pk_values)`,
//     //     'bindings': []
//     // },
//     // {
//     //     'sql': `create index idx_${schemaName}_${tableName}_ops_where on ${schemaName}.${tableName}_ops(block_number, chain_id)`,
//     //     'bindings': []
//     // },
//     // {
//     //     'sql': `create index idx_${schemaName}_${tableName}_ops_order on ${schemaName}.${tableName}_ops(pk_values, block_number, ts)`,
//     //     'bindings': []
//     // }]
//     return { error: null, schemaOpsMigration: [] }
// }
