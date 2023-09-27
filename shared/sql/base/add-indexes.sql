-- base.transactions
CREATE INDEX "idx_base_txs_to_block_number" ON "base"."transactions" ("to", "block_number");
CREATE INDEX "idx_base_txs_from" ON "base"."transactions" ("from");
CREATE INDEX "idx_base_txs_to" ON "base"."transactions" ("to");

-- base.logs
CREATE INDEX "idx_base_logs_address_block_number" on "base"."logs" ("address", "block_number");
CREATE INDEX "idx_base_logs_address_event_name" on "base"."logs" ("address", "event_name");
CREATE INDEX "idx_base_logs_event_name" on "base"."logs" ("event_name");
CREATE INDEX "idx_base_logs_order" on "base"."logs" ("block_number", "log_index");
CREATE INDEX "idx_base_logs_view_order" on "base"."logs" ("address", "event_name", "block_number", "log_index");
CREATE INDEX "idx_base_logs_indexer_order" on "base"."logs" ("address", "event_name", "block_timestamp");
CREATE INDEX "idx_base_logs_indexer_order_topic" on "base"."logs" ("address", "topic0", "block_timestamp");
CREATE INDEX "idx_base_logs_address_topic" on "base"."logs" ("address", "topic0");
CREATE INDEX "idx_base_logs_view_order_topic" on "base"."logs" ("address", "topic0", "block_number", "log_index");

-- base.traces
CREATE INDEX "idx_base_traces_to_block_number" ON "base"."traces" ("to", "block_number");
CREATE INDEX "idx_base_traces_indexer_call_order" ON "base"."traces" ("to", "function_name", "block_timestamp");
CREATE INDEX "idx_base_traces_from" ON "base"."traces" ("from");
CREATE INDEX "idx_base_traces_to" ON "base"."traces" ("to");

-- base.contracts
CREATE INDEX "idx_sorted_base_erc20_contracts" ON "base"."contracts" ("block_number", "is_erc20");
CREATE INDEX "idx_sorted_base_erc721_contracts" ON "base"."contracts" ("block_number", "is_erc721");
CREATE INDEX "idx_sorted_base_erc1155_contracts" ON "base"."contracts" ("block_number", "is_erc1155");
