create schema if not exists tokens;
create table if not exists tokens.erc20_tokens (
    id serial primary key,
    address character varying(50) not null,
    name character varying,
    symbol character varying,
    decimals bigint,
    total_supply character varying,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    last_updated timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_erc20_tokens_primary_unique_idx" ON tokens.erc20_tokens(address, chain_id);