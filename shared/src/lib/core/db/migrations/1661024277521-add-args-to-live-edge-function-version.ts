import { MigrationInterface, QueryRunner } from "typeorm";

export class addArgsToLiveEdgeFunctionVersion1661024277521 implements MigrationInterface {
    name = 'addArgsToLiveEdgeFunctionVersion1661024277521'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" ADD "args" json`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "live_edge_function_versions" DROP COLUMN "args"`);
    }

}
