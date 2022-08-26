import { MigrationInterface, QueryRunner } from 'typeorm'

export class addMetadataToEventGenerator1661293007641 implements MigrationInterface {
    name = 'addMetadataToEventGenerator1661293007641'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" RENAME COLUMN "object" TO "data"`
        )
        await queryRunner.query(`ALTER TABLE "event_generators" ADD "metadata" json`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "event_generators" DROP COLUMN "metadata"`)
        await queryRunner.query(
            `ALTER TABLE "instances"."published_events" RENAME COLUMN "data" TO "object"`
        )
    }
}
