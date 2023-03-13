CREATE SCHEMA IF NOT EXISTS "goerli";

-- goerli.blocks
CREATE TABLE "goerli"."blocks" ("hash" character varying(70) NOT NULL, "number" bigint NOT NULL, "parent_hash" character varying(70), "nonce" character varying(20) NOT NULL, "sha3_uncles" character varying(70), "logs_bloom" character varying, "transactions_root" character varying(70), "state_root" character varying(70), "receipts_root" character varying(70), "miner" character varying(50), "difficulty" character varying, "total_difficulty" character varying, "size" bigint, "extra_data" character varying, "gas_limit" character varying(40), "gas_used" character varying(40), "base_fee_per_gas" character varying(40), "transaction_count" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_00d4f3eb491f00ae5bece2a559e" PRIMARY KEY ("hash"));
CREATE UNIQUE INDEX "idx_goerli_blocks_by_number" ON "goerli"."blocks" ("number");

-- goerli.transactions
CREATE TABLE "goerli"."transactions" ("hash" character varying(70) NOT NULL, "nonce" bigint NOT NULL, "transaction_index" integer NOT NULL, "from" character varying(50), "to" character varying(50), "contract_address" character varying(50), "value" character varying(40), "input" character varying, "function_name" character varying, "function_args" json, "transaction_type" smallint, "status" smallint, "root" character varying(70), "gas" character varying(40), "gas_price" character varying(40), "max_fee_per_gas" character varying(40), "max_priority_fee_per_gas" character varying(40), "gas_used" character varying(40), "cumulative_gas_used" character varying(40), "effective_gas_price" character varying(40), "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6f30cde2f4cf5a630e053758400" PRIMARY KEY ("hash"));

-- goerli.logs
CREATE TABLE "goerli"."logs" ("log_index" bigint NOT NULL, "transaction_hash" character varying(70) NOT NULL, "transaction_index" integer NOT NULL, "address" character varying(50), "data" character varying, "topic0" character varying, "topic1" character varying, "topic2" character varying, "topic3" character varying, "event_name" character varying, "event_args" json, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_d0c26ca198324a31f47ccf3825b" PRIMARY KEY ("log_index", "transaction_hash"));

-- goerli.traces
CREATE TABLE "goerli"."traces" ("id" character varying NOT NULL, "transaction_hash" character varying(70), "transaction_index" integer, "from" character varying(50), "to" character varying(50), "value" character varying(40), "input" character varying, "output" character varying, "function_name" character varying, "function_args" json, "function_outputs" json, "trace_type" character varying(20) NOT NULL, "call_type" character varying(20), "reward_type" character varying(20), "subtraces" bigint, "trace_address" character varying, "trace_index" integer NOT NULL, "error" character varying, "status" smallint, "gas" character varying(40), "gas_used" character varying(40), "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_a28bd8d9b09a77802bb18fbc2f5" PRIMARY KEY ("id"));

-- goerli.contracts
CREATE TABLE "goerli"."contracts" ("address" character varying(50) NOT NULL, "bytecode" character varying, "is_erc20" boolean, "is_erc721" boolean, "is_erc1155" boolean, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_71a93ca1569ed761dced911f0a4" PRIMARY KEY ("address"));

-- goerli.latest_interactions
CREATE TABLE "goerli"."latest_interactions" ("from" character varying(50) NOT NULL, "to" character varying(50) NOT NULL, "interaction_type" character varying(20) NOT NULL, "hash" character varying(70) NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, CONSTRAINT "PK_8d6ef51b5f31ad371bf86ce2db4" PRIMARY KEY ("from", "to"));