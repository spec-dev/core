create schema if not exists tokens;
create table if not exists tokens.token_transfers (
    id serial primary key,
    transfer_id character varying(70) not null,
    transaction_hash character varying(70),
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_decimals bigint,
    from_address character varying(50) not null,
    to_address character varying(50) not null,
    is_mint boolean not null,
    source character varying(20) not null,
    value character varying not null,
    value_usd numeric,
    value_eth numeric,
    value_matic numeric,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "idx_er20_transfers_transfer_id" ON tokens.token_transfers(transfer_id);