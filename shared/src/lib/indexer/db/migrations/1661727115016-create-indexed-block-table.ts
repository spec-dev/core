import { MigrationInterface, QueryRunner } from 'typeorm'

export class createIndexedBlockTable1661727115016 implements MigrationInterface {
    name = 'createIndexedBlockTable1661727115016'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "indexed_blocks" ("id" SERIAL NOT NULL, "chain_id" smallint NOT NULL, "number" bigint NOT NULL, "hash" character varying(70), "status" smallint NOT NULL DEFAULT '0', "uncled" boolean NOT NULL DEFAULT false, "failed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4a3d82f93c99e3cab2bcd601b76" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_e50cc6e21d8f363648deca0965" ON "indexed_blocks" ("chain_id") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e50cc6e21d8f363648deca0965"`)
        await queryRunner.query(`DROP TABLE "indexed_blocks"`)
    }
}
