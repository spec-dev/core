--
create table lens.profiles_ops (
    id serial primary key,
    pk_names text not null,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);
create index idx_lens_profiles_ops_pk on lens.profiles_ops(pk_values);
create index idx_lens_profiles_ops_where on lens.profiles_ops(block_number, chain_id);
create index idx_lens_profiles_ops_order on lens.profiles_ops(pk_values, block_number, ts);

--
create trigger lens_profiles_insert_ops after insert on lens.profiles for each row execute procedure track_spec_table_ops('id');
create trigger lens_profiles_update_ops after update on lens.profiles for each row execute procedure track_spec_table_ops('id');
--
insert into op_tracking (table_path, chain_id, is_enabled_above) values ('lens.profiles', '137', 0);