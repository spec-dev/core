import { MigrationInterface, QueryRunner } from 'typeorm'

export class switchContractInstanceIndexes1667249164917 implements MigrationInterface {
    name = 'switchContractInstanceIndexes1667249164917'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_868a07220ff7f06dbf7b216b64"`)
        await queryRunner.query(`ALTER TABLE "contract_instances" DROP CONSTRAINT "unique_cis"`)
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "is_contract_event"`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_247b14579ee9661318881c1cfe" ON "contract_instances" ("address", "chain_id") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_247b14579ee9661318881c1cfe"`)
        await queryRunner.query(`ALTER TABLE "events" ADD "is_contract_event" boolean NOT NULL`)
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "unique_cis" UNIQUE ("address", "contract_id", "chain_id")`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_868a07220ff7f06dbf7b216b64" ON "contract_instances" ("address") `
        )
    }
}
