create schema if not exists tokens;
create table if not exists tokens.token_transfers (
    id serial primary key,
    transfer_id character varying(70) not null,
    transaction_hash character varying(70),
    log_index bigint,
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_decimals bigint,
    token_standard character varying,
    token_id character varying,
    from_address character varying(50) not null,
    to_address character varying(50) not null,
    is_mint boolean,
    is_native boolean,
    value character varying,
    value_usd numeric,
    value_eth numeric,
    value_matic numeric,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "idx_token_transfers_transfer_id" on tokens.token_transfers(transfer_id);
create index "idx_token_transfers_by_block" on tokens.token_transfers(block_number, chain_id);
create index "idx_token_transfers_by_timestamp" on tokens.token_transfers(block_timestamp);
create index "idx_token_transfers_by_recipient" on tokens.token_transfers(to_address, chain_id);
create index "idx_token_transfers_by_recipient_time" on tokens.token_transfers(to_address, chain_id, block_timestamp);
create index "idx_token_transfers_by_sender" on tokens.token_transfers(from_address, chain_id);
create index "idx_token_transfers_by_sender_time" on tokens.token_transfers(from_address, chain_id, block_timestamp);
create index "idx_token_transfers_by_token" on tokens.token_transfers(token_address, chain_id);
create index "idx_token_transfers_by_token_time" on tokens.token_transfers(token_address, chain_id, block_timestamp);