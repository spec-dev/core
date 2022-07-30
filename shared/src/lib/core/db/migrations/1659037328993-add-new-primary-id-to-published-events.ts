import { MigrationInterface, QueryRunner } from 'typeorm'

export class addNewPrimaryIdToPublishedEvents1659037328993 implements MigrationInterface {
    name = 'addNewPrimaryIdToPublishedEvents1659037328993'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_18cfd12f6d583bb28b0f9239ea"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_df43d799965cdb0981df8123f2"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "uid" character varying(30) NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD CONSTRAINT "UQ_a6d7739000234e10d5337dbbb06" UNIQUE ("uid")`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" DROP CONSTRAINT "PK_513ed483ffe68abc338566e27a6"`
        )
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "id"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "id" SERIAL NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD CONSTRAINT "PK_513ed483ffe68abc338566e27a6" PRIMARY KEY ("id")`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_18cfd12f6d583bb28b0f9239ea" ON "live_edge_function_versions" ("live_object_version_id", "edge_function_version_id") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_a6d7739000234e10d5337dbbb0" ON "instances"."published_events" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_f430e05b9942ddf5d33c1cd6ab" ON "instances"."published_events" ("channel", "id") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_f430e05b9942ddf5d33c1cd6ab"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_a6d7739000234e10d5337dbbb0"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_18cfd12f6d583bb28b0f9239ea"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" DROP CONSTRAINT "PK_513ed483ffe68abc338566e27a6"`
        )
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "id"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "id" character varying(30) NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD CONSTRAINT "PK_513ed483ffe68abc338566e27a6" PRIMARY KEY ("id")`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" DROP CONSTRAINT "UQ_a6d7739000234e10d5337dbbb06"`
        )
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "uid"`)
        await queryRunner.query(
            `CREATE INDEX "IDX_df43d799965cdb0981df8123f2" ON "instances"."published_events" ("channel", "timestamp") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_18cfd12f6d583bb28b0f9239ea" ON "live_edge_function_versions" ("live_object_version_id", "edge_function_version_id") `
        )
    }
}
