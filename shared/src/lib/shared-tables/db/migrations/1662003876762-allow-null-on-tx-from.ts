import { MigrationInterface, QueryRunner } from 'typeorm'

export class allowNullOnTxFrom1662003876762 implements MigrationInterface {
    name = 'allowNullOnTxFrom1662003876762'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" ALTER COLUMN "from" DROP NOT NULL`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "ethereum"."transactions" ALTER COLUMN "from" SET NOT NULL`
        )
    }
}
