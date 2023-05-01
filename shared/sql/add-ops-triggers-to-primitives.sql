-- tokens.erc20_tokens
CREATE TRIGGER tokens_erc20_tokens_insert_ops AFTER INSERT ON tokens.erc20_tokens FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');
CREATE TRIGGER tokens_erc20_tokens_update_ops AFTER UPDATE ON tokens.erc20_tokens FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');

-- tokens.erc20s
CREATE TRIGGER tokens_erc20s_insert_ops AFTER INSERT ON tokens.erc20s FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');
CREATE TRIGGER tokens_erc20s_update_ops AFTER UPDATE ON tokens.erc20s FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');

-- tokens.nft_collections
CREATE TRIGGER tokens_nft_collections_insert_ops AFTER INSERT ON tokens.nft_collections FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');
CREATE TRIGGER tokens_nft_collections_update_ops AFTER UPDATE ON tokens.nft_collections FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');

-- tokens.nfts
CREATE TRIGGER tokens_nfts_insert_ops AFTER INSERT ON tokens.nfts FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');
CREATE TRIGGER tokens_nfts_update_ops AFTER UPDATE ON tokens.nfts FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops('id');

-- ethereum.latest_interactions
CREATE TRIGGER ethereum_latest_interactions_insert_ops AFTER INSERT ON ethereum.latest_interactions FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops_cs('from', 'to');
CREATE TRIGGER ethereum_latest_interactions_update_ops AFTER UPDATE ON ethereum.latest_interactions FOR EACH ROW EXECUTE PROCEDURE track_spec_table_ops_cs('from', 'to');
