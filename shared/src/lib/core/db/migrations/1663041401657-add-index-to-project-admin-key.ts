import { MigrationInterface, QueryRunner } from "typeorm";

export class addIndexToProjectAdminKey1663041401657 implements MigrationInterface {
    name = 'addIndexToProjectAdminKey1663041401657'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_36a39a258d08125fa2ccd3d23f" ON "projects" ("admin_key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_36a39a258d08125fa2ccd3d23f"`);
    }

}
