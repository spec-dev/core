import { StringKeyMap } from "../../../shared"

export async function getOpsMigration(
    schemaName: string,
    tableName: string
): Promise<{ error: Error | null, opsMigration: StringKeyMap }> {
    const opsMigration = [{
        'sql': `create table if not exists ${schemaName}.${tableName}_ops(` +
                    'id serial primary key' +
                    'pk_names text not null,' +
                    'pk_values text not null,' +
                    '"before" json,' +
                    '"after" json,' +
                    'block_number bigint not null,' +
                    'chain_id varchar not null,' +
                    'ts timestamp with time zone not null default (now() at time zone \'utc\')' +
                ')'
        ,
        'bindings': []
    },
    {
        'sql': `create index idx_${schemaName}_${tableName}_ops_pk on ${schemaName}.${tableName}_ops(pk_values)`,
        'bindings': []
    },
    {
        'sql': `create index idx_${schemaName}_${tableName}_ops_where on ${schemaName}.${tableName}_ops(block_number, chain_id)`,
        'bindings': []
    },
    {
        'sql': `create index idx_${schemaName}_${tableName}_ops_order on ${schemaName}.${tableName}_ops(pk_values, block_number, ts)`,
        'bindings': []
    }]
    return { error: null, opsMigration }
}
