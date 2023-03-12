import { MigrationInterface, QueryRunner } from 'typeorm'

export class addChainIdNumberIndex1661890160095 implements MigrationInterface {
    name = 'addChainIdNumberIndex1661890160095'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_74ce352943bc1c6fb0ced2e330" ON "indexed_blocks" ("chain_id", "number")`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_74ce352943bc1c6fb0ced2e330"`)
    }
}
