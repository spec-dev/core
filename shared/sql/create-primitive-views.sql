CREATE OR REPLACE VIEW goerli.txs AS
SELECT
    hash,
    nonce,
    transaction_index,
    "from",
    "to",
    contract_address,
    value,
    input,
    function_name,
    function_args,
    transaction_type,
    status,
    root,
    gas,
    gas_price,
    max_fee_per_gas,
    max_priority_fee_per_gas,
    gas_used,
    cumulative_gas_used,
    effective_gas_price,
    block_hash,
    block_number,
    block_timestamp,
    unnest(ARRAY['5'::text]) AS chain_id
FROM goerli.transactions;

CREATE OR REPLACE VIEW ethereum.txs AS
SELECT
    hash,
    nonce,
    transaction_index,
    "from",
    "to",
    contract_address,
    value,
    input,
    function_name,
    function_args,
    transaction_type,
    status,
    root,
    gas,
    gas_price,
    max_fee_per_gas,
    max_priority_fee_per_gas,
    gas_used,
    cumulative_gas_used,
    effective_gas_price,
    block_hash,
    block_number,
    block_timestamp,
    unnest(ARRAY['1'::text]) AS chain_id
FROM ethereum.transactions;

CREATE OR REPLACE VIEW polygon.txs AS
SELECT
    hash,
    nonce,
    transaction_index,
    "from",
    "to",
    contract_address,
    value,
    input,
    function_name,
    function_args,
    transaction_type,
    status,
    root,
    gas,
    gas_price,
    max_fee_per_gas,
    max_priority_fee_per_gas,
    gas_used,
    cumulative_gas_used,
    effective_gas_price,
    block_hash,
    block_number,
    block_timestamp,
    unnest(ARRAY['137'::text]) AS chain_id
FROM polygon.transactions;

CREATE OR REPLACE VIEW tokens.transfers AS
SELECT
    id,
    transaction_hash,
    token_address,
    token_name,
    token_symbol,
    token_decimals,
    from_address,
    to_address,
    is_mint,
    value,
    value_usd,
    value_eth,
    value_matic,
    block_number,
    block_hash,
    block_timestamp
    chain_id,
    transfer_id,
    log_index,
    token_standard,
    token_id,
    CASE
        WHEN is_native is true OR source = 'trace'
            THEN true
        ELSE false
    END as is_native
FROM tokens.token_transfers;