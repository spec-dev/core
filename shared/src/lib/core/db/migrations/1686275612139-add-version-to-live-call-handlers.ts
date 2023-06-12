import { MigrationInterface, QueryRunner } from 'typeorm'

export class addVersionToLiveCallHandlers1686275612139 implements MigrationInterface {
    name = 'addVersionToLiveCallHandlers1686275612139'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f31bc37a2e72afb4809ddda263"`)
        await queryRunner.query(`ALTER TABLE "live_call_handlers" ADD "version" character varying`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_af12d82a64f4ea372403fa2bb9" ON "live_call_handlers" ("live_object_version_id", "namespace_id", "function_name", "version") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_af12d82a64f4ea372403fa2bb9"`)
        await queryRunner.query(`ALTER TABLE "live_call_handlers" DROP COLUMN "version"`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f31bc37a2e72afb4809ddda263" ON "live_call_handlers" ("function_name", "namespace_id", "live_object_version_id") `
        )
    }
}
