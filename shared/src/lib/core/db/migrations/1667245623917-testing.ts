import { MigrationInterface, QueryRunner } from 'typeorm'

export class testing1667245623917 implements MigrationInterface {
    name = 'testing1667245623917'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4b3877d457294d164194c8df5c"`)
        await queryRunner.query(`ALTER TABLE "contract_instances" DROP CONSTRAINT "unique_cis"`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_1bccddac54ceccfea4de76e9b9" ON "event_versions" ("nsp", "name", "version", "chain_id") `
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00" UNIQUE ("contract_id", "address", "chain_id")`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contract_instances" DROP CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_1bccddac54ceccfea4de76e9b9"`)
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "unique_cis" UNIQUE ("address", "contract_id", "chain_id")`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4b3877d457294d164194c8df5c" ON "event_versions" ("nsp", "name", "version") `
        )
    }
}
