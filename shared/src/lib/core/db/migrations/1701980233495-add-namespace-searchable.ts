import { MigrationInterface, QueryRunner } from 'typeorm'

export class addNamespaceSearchable1701980233495 implements MigrationInterface {
    name = 'addNamespaceSearchable1701980233495'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "searchable" boolean`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "searchable"`)
    }
}
