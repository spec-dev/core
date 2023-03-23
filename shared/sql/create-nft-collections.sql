create schema if not exists tokens;
create table if not exists tokens.nft_collections (
    id serial primary key,
    address character varying(50) not null,
    name character varying,
    symbol character varying,
    standard character varying not null,
    total_supply character varying,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    last_updated timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_nft_collections_primary_unique_idx" ON tokens.nft_collections(address, chain_id);