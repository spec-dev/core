import { MigrationInterface, QueryRunner } from 'typeorm'

export class addSignedKeyColsToProject1663032283557 implements MigrationInterface {
    name = 'addSignedKeyColsToProject1663032283557'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "projects" ADD "signed_api_key" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "projects" ADD "signed_admin_key" character varying NOT NULL`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "signed_admin_key"`)
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "signed_api_key"`)
    }
}
