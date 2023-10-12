-- record_counts 
create table record_counts (
    table_path varchar primary key,
    value integer not null default 0,
    paused boolean not null default false,
    updated_at timestamp with time zone not null default(now() at time zone 'utc')
);

-- record_count_deltas
create table record_count_deltas (
    id bigserial primary key,
    table_path varchar,
    value integer not null default 0,
    block_number bigint not null,
    chain_id varchar not null,
    created_at timestamp with time zone not null default(now() at time zone 'utc')
);
create unique index "idx_unique_record_count_delta" on record_count_deltas (table_path, block_number, chain_id);
create index "idx_record_count_deltas_by_block_number_chain_id" on record_count_deltas (block_number, chain_id);
create index "idx_record_count_deltas_by_created_at" on record_count_deltas (created_at);

-- Trigger for non-event Live Objects to auto-track their record counts.
CREATE OR REPLACE FUNCTION track_record_counts() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    table_path TEXT;
BEGIN
    table_path := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;

    CASE TG_OP
    WHEN 'INSERT' THEN
        rec := NEW;
        EXECUTE 'INSERT INTO record_counts (table_path, updated_at) VALUES ($1, $2) ON CONFLICT (table_path) DO UPDATE SET value = record_counts.value + 1, updated_at = excluded.updated_at' USING table_path, rec.block_timestamp;
    WHEN 'DELETE' THEN
        rec := OLD;
        EXECUTE 'INSERT INTO record_counts (table_path, updated_at) VALUES ($1, $2) ON CONFLICT (table_path) DO UPDATE SET value = record_counts.value - 1, updated_at = excluded.updated_at where record_counts.value > 0' USING table_path, now() at time zone 'utc';
    END CASE;

    RETURN rec;
END;
$$ LANGUAGE plpgsql;

-- Trigger for record counts table any time a record count is upserted.
CREATE OR REPLACE FUNCTION track_record_count_changed() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    base_payload TEXT;
    payload TEXT;
BEGIN
    rec := NEW;
    base_payload := ''
        || '{'
        || '"timestamp":"' || CURRENT_TIMESTAMP AT TIME ZONE 'UTC' || '",'
        || '"operation":"' || TG_OP                                || '",';
    payload := base_payload || '"data":' || row_to_json(rec) || '}';
    PERFORM pg_notify('record_count_changed', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "track_record_count_inserts" AFTER INSERT ON record_counts FOR EACH ROW EXECUTE PROCEDURE track_record_count_changed();
CREATE TRIGGER "track_record_count_updates" AFTER UPDATE ON record_counts FOR EACH ROW EXECUTE PROCEDURE track_record_count_changed();