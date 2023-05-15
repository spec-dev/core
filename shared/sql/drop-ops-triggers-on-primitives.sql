-- tokens.erc20_tokens
DROP TRIGGER tokens_erc20_tokens_insert_ops ON tokens.erc20_tokens;
DROP TRIGGER tokens_erc20_tokens_update_ops ON tokens.erc20_tokens;

-- tokens.erc20_balance
DROP TRIGGER tokens_erc20_balance_insert_ops ON tokens.erc20_balance;
DROP TRIGGER tokens_erc20_balance_update_ops ON tokens.erc20_balance;

-- tokens.nft_collections
DROP TRIGGER tokens_nft_collections_insert_ops ON tokens.nft_collections;
DROP TRIGGER tokens_nft_collections_update_ops ON tokens.nft_collections;

-- tokens.nft_balance
DROP TRIGGER tokens_nft_balance_insert_ops ON tokens.nft_balance;
DROP TRIGGER tokens_nft_balance_update_ops ON tokens.nft_balance;

-- -- ethereum.latest_interactions
-- DROP TRIGGER ethereum_latest_interactions_insert_ops ON ethereum.latest_interactions;
-- DROP TRIGGER ethereum_latest_interactions_update_ops ON ethereum.latest_interactions;