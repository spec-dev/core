import { MigrationInterface, QueryRunner } from 'typeorm'

export class addIndexesToFrom1661898151874 implements MigrationInterface {
    name = 'addIndexesToFrom1661898151874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_79051061f6a7553a524383671d" ON "ethereum"."transactions" ("from") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_2fdb5277f14e26e749075fcdd7" ON "ethereum"."transactions" ("to") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_2fdb5277f14e26e749075fcdd7"`)
        await queryRunner.query(`DROP INDEX "ethereum"."IDX_79051061f6a7553a524383671d"`)
    }
}
