import { MigrationInterface, QueryRunner } from 'typeorm'

export class addPolygonShit1667165800247 implements MigrationInterface {
    name = 'addPolygonShit1667165800247'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_7232e2ed32794c79d0890145bc"`)
        await queryRunner.query(`DROP INDEX "ethereum"."li_to_idx"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_a666b39f9d8f82f7685592c01b"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_79051061f6a7553a524383671d"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_2fdb5277f14e26e749075fcdd7"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_01a2d75ed000c77b8bc748cd2f"`)
        await queryRunner.query(
            `CREATE TABLE "ethereum"."receipts" ("hash" character varying(70) NOT NULL, "contract_address" character varying(50), "status" smallint, "root" character varying(70), "gas_used" character varying(40), "cumulative_gas_used" character varying(40), "effective_gas_price" character varying(40), CONSTRAINT "PK_84dbe880117e025cb27cdd6cb38" PRIMARY KEY ("hash"))`
        )
        await queryRunner.query(
            `CREATE TABLE "polygon"."blocks" ("hash" character varying(70) NOT NULL, "number" bigint NOT NULL, "parent_hash" character varying(70), "nonce" character varying(20) NOT NULL, "sha3_uncles" character varying(70), "logs_bloom" character varying, "transactions_root" character varying(70), "state_root" character varying(70), "receipts_root" character varying(70), "miner" character varying(50), "difficulty" character varying, "total_difficulty" character varying, "size" bigint, "extra_data" character varying, "gas_limit" character varying(40), "gas_used" character varying(40), "base_fee_per_gas" character varying(40), "transaction_count" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_00d4f3eb491f00ae5bece2a559e" PRIMARY KEY ("hash"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5c0b8f5cedabb33e58a625f8a7" ON "polygon"."blocks" ("number") `
        )
        await queryRunner.query(
            `CREATE TABLE "polygon"."logs" ("log_index" bigint NOT NULL, "transaction_hash" character varying(70) NOT NULL, "transaction_index" integer NOT NULL, "address" character varying(50), "data" character varying, "topic0" character varying, "topic1" character varying, "topic2" character varying, "topic3" character varying, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_d0c26ca198324a31f47ccf3825b" PRIMARY KEY ("log_index", "transaction_hash"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_020f800fcd1d0113b05e57b1eb" ON "polygon"."logs" ("block_number") `
        )
        await queryRunner.query(
            `CREATE TABLE "polygon"."transactions" ("hash" character varying(70) NOT NULL, "nonce" bigint NOT NULL, "transaction_index" integer NOT NULL, "from" character varying(50), "to" character varying(50), "contract_address" character varying(50), "value" character varying(40), "input" character varying, "function_name" character varying, "function_args" json, "transaction_type" smallint, "status" smallint, "gas" character varying(40), "gas_price" character varying(40), "max_fee_per_gas" character varying(40), "max_priority_fee_per_gas" character varying(40), "gas_used" character varying(40), "cumulative_gas_used" character varying(40), "effective_gas_price" character varying(40), "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, "block_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6f30cde2f4cf5a630e053758400" PRIMARY KEY ("hash"))`
        )
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" ADD "function_name" character varying`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."transactions" ADD "function_args" json`)
        await queryRunner.query(`ALTER TABLE "ethereum"."blocks" DROP COLUMN "transaction_count"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."blocks" ADD "transaction_count" integer NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."logs" DROP COLUMN "transaction_index"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."logs" ADD "transaction_index" integer NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" DROP COLUMN "transaction_index"`
        )
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" ADD "transaction_index" integer NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" DROP COLUMN "transaction_index"`)
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" ADD "transaction_index" integer`)
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" DROP COLUMN "trace_index"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."traces" ADD "trace_index" integer NOT NULL`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" DROP COLUMN "trace_index"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."traces" ADD "trace_index" smallint NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" DROP COLUMN "transaction_index"`)
        await queryRunner.query(`ALTER TABLE "ethereum"."traces" ADD "transaction_index" smallint`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" DROP COLUMN "transaction_index"`
        )
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" ADD "transaction_index" smallint NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."logs" DROP COLUMN "transaction_index"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."logs" ADD "transaction_index" smallint NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."blocks" DROP COLUMN "transaction_count"`)
        await queryRunner.query(
            `ALTER TABLE "ethereum"."blocks" ADD "transaction_count" smallint NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "ethereum"."transactions" DROP COLUMN "function_args"`)
        await queryRunner.query(`ALTER TABLE "ethereum"."transactions" DROP COLUMN "function_name"`)
        await queryRunner.query(`DROP TABLE "polygon"."transactions"`)
        await queryRunner.query(`DROP INDEX "polygon"."IDX_020f800fcd1d0113b05e57b1eb"`)
        await queryRunner.query(`DROP TABLE "polygon"."logs"`)
        await queryRunner.query(`DROP INDEX "polygon"."IDX_5c0b8f5cedabb33e58a625f8a7"`)
        await queryRunner.query(`DROP TABLE "polygon"."blocks"`)
        await queryRunner.query(`DROP TABLE "ethereum"."receipts"`)
        await queryRunner.query(
            `CREATE INDEX "IDX_01a2d75ed000c77b8bc748cd2f" ON "ethereum"."traces" ("block_number") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_2fdb5277f14e26e749075fcdd7" ON "ethereum"."transactions" ("to") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_79051061f6a7553a524383671d" ON "ethereum"."transactions" ("from") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_a666b39f9d8f82f7685592c01b" ON "ethereum"."transactions" ("block_number") `
        )
        await queryRunner.query(
            `CREATE INDEX "li_to_idx" ON "ethereum"."latest_interactions" ("to") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_7232e2ed32794c79d0890145bc" ON "ethereum"."contracts" ("block_number") `
        )
    }
}
