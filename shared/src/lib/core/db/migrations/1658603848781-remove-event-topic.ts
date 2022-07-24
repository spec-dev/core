import { MigrationInterface, QueryRunner } from 'typeorm'

export class removeEventTopic1658603848781 implements MigrationInterface {
    name = 'removeEventTopic1658603848781'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "topic"`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ADD "topic" character varying NOT NULL`)
    }
}
