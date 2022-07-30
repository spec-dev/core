import { MigrationInterface, QueryRunner } from 'typeorm'

export class breakOutPublishedEventIntoMoreCols1659038117238 implements MigrationInterface {
    name = 'breakOutPublishedEventIntoMoreCols1659038117238'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_1f77df6b94a0c0eafab9af3c99"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_f430e05b9942ddf5d33c1cd6ab"`)
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "data"`)
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "channel"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "name" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "origin" json NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "object" json NOT NULL`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_e110ab98956e5e98eacb18dfed" ON "instances"."published_events" ("name") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_9ab9986215f5db458ed1e45e6d" ON "instances"."published_events" ("name", "id") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "instances"."IDX_9ab9986215f5db458ed1e45e6d"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_e110ab98956e5e98eacb18dfed"`)
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "object"`)
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "origin"`)
        await queryRunner.query(`ALTER TABLE "instances"."published_events" DROP COLUMN "name"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "channel" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" ADD "data" json NOT NULL`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_f430e05b9942ddf5d33c1cd6ab" ON "instances"."published_events" ("channel", "id") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_1f77df6b94a0c0eafab9af3c99" ON "instances"."published_events" ("channel") `
        )
    }
}
