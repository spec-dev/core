create schema if not exists tokens;
create table if not exists tokens.erc20_balance (
    id serial primary key,
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_decimals bigint,
    owner_address character varying(50) not null,
    balance character varying not null,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_erc20_balance_primary_unique_idx" ON tokens.erc20_balance(token_address, owner_address, chain_id);