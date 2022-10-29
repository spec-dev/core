import { MigrationInterface, QueryRunner } from 'typeorm'

export class addConfigRelatedColsToLov1666749405787 implements MigrationInterface {
    name = 'addConfigRelatedColsToLov1666749405787'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "live_object_versions" ADD "properties" json`)
        await queryRunner.query(`ALTER TABLE "live_object_versions" ADD "example" json`)
        await queryRunner.query(`ALTER TABLE "live_object_versions" ADD "config" json`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "live_object_versions" DROP COLUMN "config"`)
        await queryRunner.query(`ALTER TABLE "live_object_versions" DROP COLUMN "example"`)
        await queryRunner.query(`ALTER TABLE "live_object_versions" DROP COLUMN "properties"`)
    }
}
