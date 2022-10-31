import { MigrationInterface, QueryRunner } from 'typeorm'

export class addAnotherIndexToEventVersions1667245831770 implements MigrationInterface {
    name = 'addAnotherIndexToEventVersions1667245831770'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract_instances" DROP CONSTRAINT "unique_cis"`)
        await queryRunner.query(
            `CREATE INDEX "IDX_8506390885e553327ed94f3717" ON "event_versions" ("nsp", "name", "chain_id") `
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00" UNIQUE ("contract_id", "address", "chain_id")`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contract_instances" DROP CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_8506390885e553327ed94f3717"`)
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "unique_cis" UNIQUE ("address", "contract_id", "chain_id")`
        )
    }
}
