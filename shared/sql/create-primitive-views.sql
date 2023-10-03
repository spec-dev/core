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
    transfer_id,
    transaction_hash,
    log_index,
    token_address,
    token_name,
    token_symbol,
    token_decimals,
    token_standard,
    token_id,
    from_address,
    to_address,
    is_mint,
    CASE
        WHEN token_address = '0x0000000000000000000000000000000000000000'
            THEN true
        ELSE false
    END as is_native,
    CASE
        WHEN transaction_hash is null
            THEN true
        ELSE false
    END as is_block_reward,
    value,
    value_usd,
    value_eth,
    value_matic,
    block_number,
    block_hash,
    block_timestamp,
    chain_id
FROM tokens.token_transfers
WHERE token_address = '0x0000000000000000000000000000000000000000' OR log_index is not null;