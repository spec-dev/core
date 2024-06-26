-- ETHEREUM --------

CREATE OR REPLACE FUNCTION new_ethereum_block_sub() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    payload TEXT;
BEGIN
    rec := NEW;
    payload := '{"number":"' || rec.number || '"}';
    PERFORM pg_notify('new_block_chain_1', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_ethereum_block AFTER INSERT ON ethereum.blocks 
FOR EACH ROW EXECUTE PROCEDURE new_ethereum_block_sub();

-- GOERLI --------

CREATE OR REPLACE FUNCTION new_goerli_block_sub() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    payload TEXT;
BEGIN
    rec := NEW;
    payload := '{"number":"' || rec.number || '"}';
    PERFORM pg_notify('new_block_chain_5', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_goerli_block AFTER INSERT ON goerli.blocks 
FOR EACH ROW EXECUTE PROCEDURE new_goerli_block_sub();

-- POLYGON --------

CREATE OR REPLACE FUNCTION new_polygon_block_sub() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    payload TEXT;
BEGIN
    rec := NEW;
    payload := '{"number":"' || rec.number || '"}';
    PERFORM pg_notify('new_block_chain_137', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_polygon_block AFTER INSERT ON polygon.blocks 
FOR EACH ROW EXECUTE PROCEDURE new_polygon_block_sub();

-- MUMBAI --------

CREATE OR REPLACE FUNCTION new_mumbai_block_sub() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    payload TEXT;
BEGIN
    rec := NEW;
    payload := '{"number":"' || rec.number || '"}';
    PERFORM pg_notify('new_block_chain_80001', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_mumbai_block AFTER INSERT ON mumbai.blocks 
FOR EACH ROW EXECUTE PROCEDURE new_mumbai_block_sub();

-- BASE --------

CREATE OR REPLACE FUNCTION new_base_block_sub() RETURNS trigger AS $$
DECLARE
    rec RECORD;
    payload TEXT;
BEGIN
    rec := NEW;
    payload := '{"number":"' || rec.number || '"}';
    PERFORM pg_notify('new_block_chain_8453', payload);
    RETURN rec;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_base_block AFTER INSERT ON base.blocks 
FOR EACH ROW EXECUTE PROCEDURE new_base_block_sub();