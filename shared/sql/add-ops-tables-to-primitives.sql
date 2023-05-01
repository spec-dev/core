-- tokens.erc20_tokens
create table tokens.erc20_tokens_ops (
    id serial primary key,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);

-- tokens.erc20s
create table tokens.erc20s_ops (
    id serial primary key,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);

-- tokens.nft_collections
create table tokens.nft_collections_ops (
    id serial primary key,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);

-- tokens.nfts
create table tokens.nfts_ops (
    id serial primary key,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    chain_id text not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);

-- ethereum.latest_interactions_ops
create table ethereum.latest_interactions_ops (
    id serial primary key,
    pk_values text not null,
    "before" json,
    "after" json,
    block_number bigint not null,
    ts timestamp with time zone not null default(now() at time zone 'utc')
);