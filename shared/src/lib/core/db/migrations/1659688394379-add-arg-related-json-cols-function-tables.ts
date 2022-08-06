import { MigrationInterface, QueryRunner } from 'typeorm'

export class addArgRelatedJsonColsFunctionTables1659688394379 implements MigrationInterface {
    name = 'addArgRelatedJsonColsFunctionTables1659688394379'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "live_edge_function_versions" ADD "role" character varying NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" ADD "argsMap" json`)
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" ADD "metadata" json`)
        await queryRunner.query(`ALTER TABLE "edge_function_versions" ADD "args" json`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "edge_function_versions" DROP COLUMN "args"`)
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" DROP COLUMN "metadata"`)
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" DROP COLUMN "argsMap"`)
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" DROP COLUMN "role"`)
    }
}
