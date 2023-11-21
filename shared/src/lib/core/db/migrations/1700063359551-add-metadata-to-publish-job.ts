import { MigrationInterface, QueryRunner } from 'typeorm'

export class addMetadataToPublishJob1700063359551 implements MigrationInterface {
    name = 'addMetadataToPublishJob1700063359551'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "publish_and_deploy_live_object_version_jobs" ADD "metadata" json`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "publish_and_deploy_live_object_version_jobs" DROP COLUMN "metadata"`
        )
    }
}
