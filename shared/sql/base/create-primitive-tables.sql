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
    CONSTRAINT "pk_base_blocks" PRIMARY KEY ("hash")
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
    CONSTRAINT "pk_base_transactions" PRIMARY KEY ("hash")
);
CREATE INDEX "idx_base_txs_by_block_number" ON "base"."transactions" ("block_number");
CREATE INDEX "idx_base_txs_by_block_timestamp" ON "base"."transactions" ("block_timestamp");


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
    CONSTRAINT "pk_base_logs" PRIMARY KEY ("log_index", "transaction_hash")
);
CREATE INDEX "idx_base_logs_by_block_number" ON "base"."logs" ("block_number");


-- base.traces
CREATE TABLE "base"."traces" (
    "id" character varying NOT NULL, 
    "transaction_hash" character varying(70), 
    "transaction_index" integer, 
    "from" character varying(50), 
    "to" character varying(50),
    "value" character varying(70),
    "input" character varying,
    "output" character varying,
    "function_name" character varying,
    "function_args" json,
    "function_outputs" json,
    "trace_type" character varying(20) NOT NULL,
    "call_type" character varying(20),
    "reward_type" character varying(20),
    "subtraces" bigint,
    "trace_address" character varying,
    "trace_index" integer NOT NULL,
    "trace_index_is_per_tx" boolean,
    "error" character varying,
    "status" smallint,
    "gas" character varying(70),
    "gas_used" character varying(70),
    "block_hash" character varying(70) NOT NULL, 
    "block_number" bigint NOT NULL, 
    "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT "pk_base_traces" PRIMARY KEY ("id")
);
CREATE INDEX "idx_base_traces_by_block_number" ON "base"."traces" ("block_number");


-- base.contracts
CREATE TABLE "base"."contracts" (
    "address" character varying(50) NOT NULL, 
    "bytecode" character varying,
    "is_erc20" boolean,
    "is_erc721" boolean,
    "is_erc1155" boolean,
    "block_hash" character varying(70) NOT NULL,
    "block_number" bigint NOT NULL,
    "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_base_contracts" PRIMARY KEY ("address")
);
CREATE INDEX "idx_base_contracts_by_block_number" ON "base"."contracts" ("block_number");
CREATE INDEX "idx_base_contracts_by_block_timestamp" ON "base"."contracts" ("block_timestamp");