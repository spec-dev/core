CREATE SCHEMA IF NOT EXISTS "sepolia";

-- sepolia.blocks
CREATE TABLE "sepolia"."blocks" (
    "hash" character varying(70) NOT NULL, 
    "number" bigint NOT NULL,
    "parent_hash" character varying(70),
    "nonce" character varying NOT NULL, 
    "sha3_uncles" character varying, 
    "logs_bloom" character varying, 
    "transactions_root" character varying, 
    "state_root" character varying,
    "receipts_root" character varying,
    "miner" character varying(50), 
    "difficulty" character varying, 
    "total_difficulty" character varying,
    "size" bigint, 
    "extra_data" character varying, 
    "gas_limit" character varying,
    "gas_used" character varying, 
    "base_fee_per_gas" character varying, 
    "transaction_count" integer NOT NULL, 
    "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT "PK_00d4f3eb491f00ae5bece2a559e" PRIMARY KEY ("hash")
);
CREATE UNIQUE INDEX "idx_sepolia_blocks_by_number" ON "sepolia"."blocks" ("number");
CREATE INDEX "idx_sepolia_blocks_by_timestamp" ON "sepolia"."blocks" ("timestamp");

-- sepolia.transactions
CREATE TABLE "sepolia"."transactions" (
    "hash" character varying(70) NOT NULL, 
    "nonce" bigint NOT NULL, 
    "transaction_index" integer NOT NULL, 
    "from" character varying(50), 
    "to" character varying(50), 
    "contract_address" character varying(50), 
    "value" character varying, 
    "input" character varying, 
    "function_name" character varying, 
    "function_args" json, 
    "transaction_type" smallint, 
    "status" smallint,
    "root" character varying,
    "gas" character varying,
    "gas_price" character varying,
    "max_fee_per_gas" character varying, 
    "max_priority_fee_per_gas" character varying,
    "gas_used" character varying,
    "cumulative_gas_used" character varying,
    "effective_gas_price" character varying,
    "block_hash" character varying(70) NOT NULL,
    "block_number" bigint NOT NULL,
    "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
    "chain_id" character varying NOT NULL DEFAULT '11155111',
    CONSTRAINT "PK_6f30cde2f4cf5a630e053758400" PRIMARY KEY ("hash")
);
CREATE INDEX "idx_sepolia_transactions_block_timestamp" ON "sepolia"."transactions" ("block_timestamp");
CREATE INDEX "idx_sepolia_transactions_block_number" ON "sepolia"."transactions" ("block_number");
CREATE INDEX "idx_sepolia_tx_to_sorted" ON "sepolia"."transactions" ("to", "block_number");
CREATE INDEX "idx_sepolia_transactions_to" ON "sepolia"."transactions" ("to");
CREATE INDEX "idx_sepolia_transactions_from" ON "sepolia"."transactions" ("from");

-- sepolia.logs
CREATE TABLE "sepolia"."logs" (
    "log_index" bigint NOT NULL, 
    "transaction_hash" character varying(70) NOT NULL, 
    "transaction_index" integer NOT NULL, 
    "address" character varying(50), 
    "data" character varying,
    "topic0" character varying,
    "topic1" character varying,
    "topic2" character varying,
    "topic3" character varying,
    "event_name" character varying, 
    "event_args" json, 
    "block_hash" character varying(70) NOT NULL, 
    "block_number" bigint NOT NULL, 
    "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT "PK_d0c26ca198324a31f47ccf3825b" PRIMARY KEY ("log_index", "transaction_hash")
);
CREATE INDEX "idx_sepolia_logs_by_block_number" ON "sepolia"."logs"("block_number");
CREATE INDEX "idx_sepolia_logs_address_block_number" ON "sepolia"."logs"("address", "block_number");
CREATE INDEX "idx_sepolia_logs_address_event_name" ON "sepolia"."logs"("address", "event_name");
CREATE INDEX "idx_sepolia_logs_event_name" ON "sepolia"."logs"("event_name");
CREATE INDEX "idx_sepolia_logs_order" ON "sepolia"."logs"("block_number", "log_index");
CREATE INDEX "idx_sepolia_logs_view_order" ON "sepolia"."logs"("address", "event_name", "block_number", "log_index");
CREATE INDEX "idx_sepolia_indexer_order" ON "sepolia"."logs"("address", "event_name", "block_timestamp");
CREATE INDEX "idx_sepolia_indexer_order_topic" ON "sepolia"."logs"("address", "topic0", "block_timestamp");
CREATE INDEX "idx_sepolia_logs_address_topic" ON "sepolia"."logs"("address", "topic0");
CREATE INDEX "idx_sepolia_logs_view_order_topic" ON "sepolia"."logs"("address", "topic0", "block_number", "log_index");

-- Bear reader permissions.
create user bear;
grant usage on schema sepolia to bear;
grant select on all tables in schema sepolia to bear;
grant select on all sequences in schema sepolia to bear;
grant execute on all functions in schema sepolia to bear;
alter default privileges in schema sepolia grant select on tables to bear;
alter default privileges in schema sepolia grant select on sequences to bear;
alter default privileges in schema sepolia grant execute on functions to bear;
