CREATE OR REPLACE FUNCTION track_spec_table_ops_cs() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    rec_before JSON;
    rec_after JSON;
    block_number BIGINT;
    block_number_floor BIGINT;
    pk_names_array TEXT[] := ARRAY[]::TEXT[];
    pk_names TEXT := '';
    pk_values_array TEXT[] := ARRAY[]::TEXT[];
    pk_values TEXT := '';
    ops_table_name TEXT;
    pk_column_name TEXT;
    pk_column_value TEXT;
    insert_stmt TEXT;
    table_path TEXT;
BEGIN
    -- Current table this trigger is actually on.
    table_path := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;

    -- Get before/after record snapshots and block_number/chain_id.
    CASE TG_OP
    WHEN 'INSERT' THEN
        rec := NEW;
        rec_before := NULL;
        rec_after := row_to_json(NEW);
        block_number := NEW.block_number;
    WHEN 'UPDATE' THEN
        rec := NEW;
        rec_before := row_to_json(OLD);
        rec_after := row_to_json(NEW);
        block_number := NEW.block_number;
    WHEN 'DELETE' THEN
        rec := OLD;
        rec_before := row_to_json(OLD);
        rec_after := NULL;
        block_number := OLD.block_number;
    END CASE;

    -- Ensure op-tracking is allowed for this block number.
    EXECUTE format('SELECT is_enabled_above from op_tracking where table_path = $1')
        INTO block_number_floor
        USING table_path;
    IF (block_number_floor IS NULL OR block_number < block_number_floor) THEN
        RETURN rec;
    END IF;

    -- Curate a comma-delimited string of primary key values for the record.
    FOREACH pk_column_name IN ARRAY TG_ARGV LOOP
        EXECUTE format('SELECT ($1.%I)::TEXT', pk_column_name)
        INTO pk_column_value
        USING rec;
        pk_names_array := array_append(pk_names_array, pk_column_name::TEXT);
        pk_values_array := array_append(pk_values_array, pk_column_value::TEXT);
    END LOOP;
    pk_names := array_to_string(pk_names_array, ',');
    pk_values := array_to_string(pk_values_array, ',');

    -- Table's associated "ops" table.
    ops_table_name := TG_TABLE_NAME || '_ops';

    -- Build and perform the ops table insert.
    insert_stmt := format(
        'INSERT INTO %I.%I ("pk_names", "pk_values", "before", "after", "block_number") VALUES ($1, $2, $3, $4, $5)', 
        TG_TABLE_SCHEMA,
        ops_table_name
    );
    EXECUTE insert_stmt USING pk_names, pk_values, rec_before, rec_after, block_number;
    RETURN rec;
END;
$$ LANGUAGE plpgsql;