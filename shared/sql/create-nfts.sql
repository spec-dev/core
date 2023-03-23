create schema if not exists tokens;
create table if not exists tokens.nfts (
    id serial primary key,
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_standard character varying not null,
    token_id character varying not null,
    owner_address character varying(50) not null,
    balance character varying not null,
    title character varying,
    description character varying,
    token_uri character varying,
    image_uri character varying,
    image_format character varying,
    attributes json,
    metadata json,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_nfts_primary_unique_idx" ON tokens.nfts(token_address, token_id, owner_address, chain_id);