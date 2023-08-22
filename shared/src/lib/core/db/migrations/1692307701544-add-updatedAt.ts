import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUpdatedAt1692307701544 implements MigrationInterface {
    name = 'AddUpdatedAt1692307701544'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "namespaces" ADD "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()`
        )
        await queryRunner.query(
            `ALTER TABLE "contracts" ADD "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()`
        )
        await queryRunner.query(
            `ALTER TABLE "event_versions" ADD "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()`
        )
        await queryRunner.query(
            `ALTER TABLE "live_object_versions" ADD "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "live_object_versions" DROP COLUMN "updated_at"`)
        await queryRunner.query(`ALTER TABLE "event_versions" DROP COLUMN "updated_at"`)
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "updated_at"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "updated_at"`)
    }
}
