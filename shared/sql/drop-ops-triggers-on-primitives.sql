-- tokens.erc20_tokens
DROP TRIGGER tokens_erc20_tokens_insert_ops ON tokens.erc20_tokens;
DROP TRIGGER tokens_erc20_tokens_update_ops ON tokens.erc20_tokens;

-- tokens.erc20s
DROP TRIGGER tokens_erc20s_insert_ops ON tokens.erc20s;
DROP TRIGGER tokens_erc20s_update_ops ON tokens.erc20s;

-- tokens.nft_collections
DROP TRIGGER tokens_nft_collections_insert_ops ON tokens.nft_collections;
DROP TRIGGER tokens_nft_collections_update_ops ON tokens.nft_collections;

-- tokens.nfts
DROP TRIGGER tokens_nfts_insert_ops ON tokens.nfts;
DROP TRIGGER tokens_nfts_update_ops ON tokens.nfts;

-- ethereum.latest_interactions
DROP TRIGGER ethereum_latest_interactions_insert_ops ON ethereum.latest_interactions;
DROP TRIGGER ethereum_latest_interactions_update_ops ON ethereum.latest_interactions;