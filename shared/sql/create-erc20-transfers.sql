create schema if not exists tokens;
create table if not exists tokens.erc20_transfers (
    id serial primary key,
    transaction_hash character varying(70) not null,
    log_index bigint not null, 
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_decimals bigint,
    from_address character varying(50) not null,
    to_address character varying(50) not null,
    is_mint boolean not null,
    value character varying not null,
    value_usd numeric,
    value_eth numeric,
    value_matic numeric,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_erc20_transfers_primary_unique_idx" ON tokens.erc20_transfers(transaction_hash, log_index, chain_id);