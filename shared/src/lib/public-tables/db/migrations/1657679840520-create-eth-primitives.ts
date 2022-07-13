import { MigrationInterface, QueryRunner } from 'typeorm'

export class createEthPrimitives1657679840520 implements MigrationInterface {
    name = 'createEthPrimitives1657679840520'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "ethereum"."blocks" ("chain_id" smallint NOT NULL, "number" bigint NOT NULL, "hash" character varying(70) NOT NULL, "parent_hash" character varying(70), "nonce" character varying(20) NOT NULL, "sha3_uncles" character varying(70), "logs_bloom" character varying, "transactions_root" character varying(70), "state_root" character varying(70), "receipts_root" character varying(70), "miner" character varying(50), "difficulty" character varying, "total_difficulty" character varying, "size" bigint, "extra_data" character varying, "gas_limit" character varying(40), "gas_used" character varying(40), "base_fee_per_gas" character varying(40), "transaction_count" smallint NOT NULL, "timestamp" TIMESTAMP NOT NULL, "uncled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_00d4f3eb491f00ae5bece2a559e" PRIMARY KEY ("hash"))`
        )
        await queryRunner.query(
            `CREATE TABLE "ethereum"."transactions" ("chain_id" smallint NOT NULL, "hash" character varying(70) NOT NULL, "nonce" bigint NOT NULL, "transaction_index" smallint NOT NULL, "from" character varying(50) NOT NULL, "to" character varying(50), "contract_address" character varying(50), "value" character varying(40), "input" character varying, "transaction_type" smallint, "status" smallint, "root" character varying(70), "gas" character varying(40), "gas_price" character varying(40), "max_fee_per_gas" character varying(40), "max_priority_fee_per_gas" character varying(40), "gas_used" character varying(40), "cumulative_gas_used" character varying(40), "effective_gas_price" character varying(40), "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP NOT NULL, "uncled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_6f30cde2f4cf5a630e053758400" PRIMARY KEY ("hash"))`
        )
        await queryRunner.query(
            `CREATE TABLE "ethereum"."logs" ("chain_id" smallint NOT NULL, "log_index" bigint NOT NULL, "transaction_hash" character varying(70) NOT NULL, "transaction_index" smallint NOT NULL, "address" character varying(50), "data" character varying, "topic0" character varying, "topic1" character varying, "topic2" character varying, "topic3" character varying, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP NOT NULL, "uncled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_d0c26ca198324a31f47ccf3825b" PRIMARY KEY ("log_index", "transaction_hash"))`
        )
        await queryRunner.query(
            `CREATE TABLE "ethereum"."traces" ("id" character varying(200) NOT NULL, "chain_id" smallint NOT NULL, "transaction_hash" character varying(70), "transaction_index" smallint, "from" character varying(50), "to" character varying(50), "value" character varying(40), "input" character varying, "output" character varying, "trace_type" character varying(20) NOT NULL, "call_type" character varying(20), "reward_type" character varying(20), "subtraces" bigint, "trace_address" character varying, "trace_index" smallint NOT NULL, "error" character varying, "status" smallint, "gas" character varying(40), "gas_used" character varying(40), "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP NOT NULL, "uncled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_a28bd8d9b09a77802bb18fbc2f5" PRIMARY KEY ("id"))`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "ethereum"."traces"`)
        await queryRunner.query(`DROP TABLE "ethereum"."logs"`)
        await queryRunner.query(`DROP TABLE "ethereum"."transactions"`)
        await queryRunner.query(`DROP TABLE "ethereum"."blocks"`)
    }
}
