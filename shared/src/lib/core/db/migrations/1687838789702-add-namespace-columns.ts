import { MigrationInterface, QueryRunner } from 'typeorm'

export class addNamespaceColumns1687838789702 implements MigrationInterface {
    name = 'addNamespaceColumns1687838789702'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "display_name" character varying`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "desc" character varying`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "short_desc" character varying`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "website_url" character varying`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "twitter_url" character varying`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "verified" boolean`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "joined_at" TIMESTAMP WITH TIME ZONE`)
        await queryRunner.query(`ALTER TABLE "namespaces" ADD "blurhash" character varying`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "blurhash"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "joined_at"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "verified"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "twitter_url"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "website_url"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "short_desc"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "desc"`)
        await queryRunner.query(`ALTER TABLE "namespaces" DROP COLUMN "display_name"`)
    }
}
