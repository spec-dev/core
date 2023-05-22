-- tokens.erc20_tokens
create table tokens.erc20_tokens_ops (
    id serial primary key,
    pk_names text not null,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);
create index idx_tokens_erc20_tokens_ops_pk on tokens.erc20_tokens_ops(pk_values);
create index idx_tokens_erc20_tokens_ops_where on tokens.erc20_tokens_ops(block_number, chain_id);
create index idx_tokens_erc20_tokens_ops_order on tokens.erc20_tokens_ops(pk_values, block_number, ts);

-- tokens.erc20_balance
create table tokens.erc20_balance_ops (
    id serial primary key,
    pk_names text not null,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);
create index idx_tokens_erc20_balance_ops_pk on tokens.erc20_balance_ops(pk_values);
create index idx_tokens_erc20_balance_ops_where on tokens.erc20_balance_ops(block_number, chain_id);
create index idx_tokens_erc20_balance_ops_order on tokens.erc20_balance_ops(pk_values, block_number, ts);

-- tokens.nft_collections
create table tokens.nft_collections_ops (
    id serial primary key,
    pk_names text not null,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);
create index idx_tokens_nft_collections_ops_pk on tokens.nft_collections_ops(pk_values);
create index idx_tokens_nft_collections_ops_where on tokens.nft_collections_ops(block_number, chain_id);
create index idx_tokens_nft_collections_ops_order on tokens.nft_collections_ops(pk_values, block_number, ts);

-- tokens.nft_balance
create table tokens.nft_balance_ops (
    id serial primary key,
    pk_names text not null,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);
create index idx_tokens_nft_balance_ops_pk on tokens.nft_balance_ops(pk_values);
create index idx_tokens_nft_balance_ops_where on tokens.nft_balance_ops(block_number, chain_id);
create index idx_tokens_nft_balance_ops_order on tokens.nft_balance_ops(pk_values, block_number, ts);