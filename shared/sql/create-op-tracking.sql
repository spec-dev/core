create table op_tracking (
    id serial primary key,
    table_path varchar not null,
    chain_id varchar not null,
    is_enabled boolean not null
);
create unique index unique_op_tracking_entry on op_tracking (table_path, chain_id); 