import { MigrationInterface, QueryRunner } from 'typeorm'

export class changePublishedEventsTimestampType1658776833768 implements MigrationInterface {
    name = 'changePublishedEventsTimestampType1658776833768'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_df43d799965cdb0981df8123f2"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" DROP COLUMN "timestamp"`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "timestamp" bigint NOT NULL`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_df43d799965cdb0981df8123f2" ON "instances"."published_events" ("channel", "timestamp") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_df43d799965cdb0981df8123f2"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" DROP COLUMN "timestamp"`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "timestamp" integer NOT NULL`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_df43d799965cdb0981df8123f2" ON "instances"."published_events" ("channel", "timestamp") `
        )
    }
}
