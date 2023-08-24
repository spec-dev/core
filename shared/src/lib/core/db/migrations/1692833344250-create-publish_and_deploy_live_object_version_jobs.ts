import { MigrationInterface, QueryRunner } from 'typeorm'

export class createPublishAndDeployLiveObjectVersionJobs1692833344250
    implements MigrationInterface
{
    name = 'createPublishAndDeployLiveObjectVersionJobs1692833344250'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "publish_and_deploy_live_object_version_jobs" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "folder" character varying NOT NULL, "version" character varying NOT NULL, "status" character varying NOT NULL, "cursor" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "failed" boolean NOT NULL DEFAULT false, "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_892e765f9e2b3422f8d6374a286" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_802614d9e23f3e9e4b41d35e3a" ON "publish_and_deploy_live_object_version_jobs" ("uid") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "publish_and_deploy_live_object_version_jobs"`)
    }
}
