import { MigrationInterface, QueryRunner } from "typeorm";

export class addIndexToProjectApiKey1663033514068 implements MigrationInterface {
    name = 'addIndexToProjectApiKey1663033514068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_688122a0b0c105a34c6ca2886b" ON "projects" ("api_key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_688122a0b0c105a34c6ca2886b"`);
    }

}
