import { MigrationInterface, QueryRunner } from 'typeorm'

export class createBlockNumberIndexes1660685897561 implements MigrationInterface {
    name = 'createBlockNumberIndexes1660685897561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_5c0b8f5cedabb33e58a625f8a7" ON "ethereum"."blocks" ("number") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_a666b39f9d8f82f7685592c01b" ON "ethereum"."transactions" ("block_number") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_020f800fcd1d0113b05e57b1eb" ON "ethereum"."logs" ("block_number") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_01a2d75ed000c77b8bc748cd2f" ON "ethereum"."traces" ("block_number") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_7232e2ed32794c79d0890145bc" ON "ethereum"."contracts" ("block_number") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_7232e2ed32794c79d0890145bc"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_01a2d75ed000c77b8bc748cd2f"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_020f800fcd1d0113b05e57b1eb"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_a666b39f9d8f82f7685592c01b"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_5c0b8f5cedabb33e58a625f8a7"`)
    }
}
