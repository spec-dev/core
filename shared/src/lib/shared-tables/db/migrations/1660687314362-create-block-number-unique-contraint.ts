import { MigrationInterface, QueryRunner } from 'typeorm'

export class createBlockNumberUniqueContraint1660687314362 implements MigrationInterface {
    name = 'createBlockNumberUniqueContraint1660687314362'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_5c0b8f5cedabb33e58a625f8a7"`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_5c0b8f5cedabb33e58a625f8a7" ON "ethereum"."blocks" ("number") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_5c0b8f5cedabb33e58a625f8a7"`)
        await queryRunner.query(
            `CREATE INDEX "IDX_5c0b8f5cedabb33e58a625f8a7" ON "ethereum"."blocks" ("number") `
        )
    }
}
