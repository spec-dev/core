create schema if not exists tokens;
create table if not exists tokens.nft_transfers (
    id serial primary key,
    transaction_hash character varying(70) not null,
    log_index bigint not null, 
    transfer_index bigint not null,
    token_address character varying(50) not null,
    token_name character varying,
    token_symbol character varying,
    token_standard character varying not null,
    from_address character varying(50) not null,
    to_address character varying(50) not null,
    is_mint boolean not null,
    token_id character varying not null,
    value character varying not null,
    block_number bigint not null,
    block_hash character varying(70) not null,
    block_timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create unique index "tokens_nft_transfers_primary_unique_idx" ON tokens.nft_transfers(transaction_hash, log_index, transfer_index, chain_id);