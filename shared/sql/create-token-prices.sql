create schema if not exists tokens;
create table if not exists tokens.token_prices (
    id serial primary key,
    token_address character varying not null,
    token_name character varying,
    token_symbol character varying,
    price_usd numeric,
    price_eth numeric,
    price_matic numeric,
    timestamp timestamp with time zone not null,
    chain_id character varying not null
);
create index "idx_timestamped_token_prices" ON tokens.token_prices(token_address, chain_id, timestamp);
create index "idx_token_prices_by_timestamp" ON tokens.token_prices(timestamp);
create index "idx_token_prices_by_symbol" ON tokens.token_prices(token_symbol);