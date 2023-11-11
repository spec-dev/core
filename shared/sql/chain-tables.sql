CREATE SCHEMA IF NOT EXISTS "base";

-- base.blocks
CREATE TABLE "base"."blocks" (
    "hash" character varying(70) NOT NULL, 
    "number" bigint NOT NULL,
    "parent_hash" character varying(70),
    "nonce" character varying(20) NOT NULL, 
    "sha3_uncles" character varying(70), 
    "logs_bloom" character varying, 
    "transactions_root" character varying(70), 
    "state_root" character varying(70), 
    "receipts_root" character varying(70), 
    "miner" character varying(50), 
    "difficulty" character varying, 
    "total_difficulty" character varying,
    "size" bigint, 
    "extra_data" character varying, 
    "gas_limit" character varying(70), 
    "gas_used" character varying(70), 
    "base_fee_per_gas" character varying(70), 
    "transaction_count" integer NOT NULL, 
    "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT "PK_00d4f3eb491f00ae5bece2a559e" PRIMARY KEY ("hash")
);
CREATE UNIQUE INDEX "idx_base_blocks_by_number" ON "base"."blocks" ("number");
CREATE INDEX "idx_base_blocks_by_timestamp" ON "base"."blocks" ("timestamp");

-- base.transactions
CREATE TABLE "base"."transactions" (
    "hash" character varying(70) NOT NULL, 
    "nonce" bigint NOT NULL, 
    "transaction_index" integer NOT NULL, 
    "from" character varying(50), 
    "to" character varying(50), 
    "contract_address" character varying(50), 
    "value" character varying(70), 
    "input" character varying, 
    "function_name" character varying, 
    "function_args" json, 
    "transaction_type" smallint, 
    "status" smallint,
    "root" character varying(70),
    "gas" character varying(70), 
    "gas_price" character varying(70), 
    "max_fee_per_gas" character varying(70), 
    "max_priority_fee_per_gas" character varying(70),
    "gas_used" character varying(70),
    "cumulative_gas_used" character varying(70),
    "effective_gas_price" character varying(70),
    "block_hash" character varying(70) NOT NULL,
    "block_number" bigint NOT NULL,
    "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "PK_6f30cde2f4cf5a630e053758400" PRIMARY KEY ("hash")
);
CREATE INDEX "idx_base_transactions_block_timestamp" ON "base"."transactions" ("block_timestamp");
CREATE INDEX "idx_base_transactions_block_number" ON "base"."transactions" ("block_number");
CREATE INDEX "idx_base_tx_to_sorted" ON "base"."transactions" ("to", "block_number");
CREATE INDEX "idx_base_transactions_to" ON "base"."transactions" ("to");
CREATE INDEX "idx_base_transactions_from" ON "base"."transactions" ("from");

-- base.logs
CREATE TABLE "base"."logs" (
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
CREATE INDEX "idx_base_logs_by_block_number" ON "base"."logs"("block_number");
CREATE INDEX "idx_base_logs_address_block_number" ON "base"."logs"("address", "block_number");
CREATE INDEX "idx_base_logs_address_event_name" ON "base"."logs"("address", "event_name");
CREATE INDEX "idx_base_logs_event_name" ON "base"."logs"("event_name");
CREATE INDEX "idx_base_logs_order" ON "base"."logs"("block_number", "log_index");
CREATE INDEX "idx_base_logs_view_order" ON "base"."logs"("address", "event_name", "block_number", "log_index");
CREATE INDEX "idx_base_indexer_order" ON "base"."logs"("address", "event_name", "block_timestamp");
CREATE INDEX "idx_base_indexer_order_topic" ON "base"."logs"("address", "topic0", "block_timestamp");
CREATE INDEX "idx_base_logs_address_topic" ON "base"."logs"("address", "topic0");
CREATE INDEX "idx_base_logs_view_order_topic" ON "base"."logs"("address", "topic0", "block_number", "log_index");

-- Bear reader permissions.
create user bear;
grant usage on schema base to bear;
grant select on all tables in schema base to bear;
grant select on all sequences in schema base to bear;
grant execute on all functions in schema base to bear;
alter default privileges in schema base grant select on tables to bear;
alter default privileges in schema base grant select on sequences to bear;
alter default privileges in schema base grant execute on functions to bear;
