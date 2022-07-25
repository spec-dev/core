import { MigrationInterface, QueryRunner } from 'typeorm'

export class addPublishedEventsTable1658773500868 implements MigrationInterface {
    name = 'addPublishedEventsTable1658773500868'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "instances"."published_events" ("id" character varying(30) NOT NULL, "channel" character varying NOT NULL, "data" json NOT NULL, "timestamp" integer NOT NULL, CONSTRAINT "PK_513ed483ffe68abc338566e27a6" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_1f77df6b94a0c0eafab9af3c99" ON "instances"."published_events" ("channel") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_df43d799965cdb0981df8123f2" ON "instances"."published_events" ("channel", "timestamp") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_df43d799965cdb0981df8123f2"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_1f77df6b94a0c0eafab9af3c99"`)
        await queryRunner.query(`DROP TABLE "instances"."published_events"`)
    }
}
