import { MigrationInterface, QueryRunner } from 'typeorm'

export class createReorgsTable1684015906846 implements MigrationInterface {
    name = 'createReorgsTable1684015906846'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "reorgs" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "chain_id" character varying NOT NULL, "from_number" bigint NOT NULL, "to_number" bigint NOT NULL, "status" character varying NOT NULL DEFAULT 'new', "stats" json, "failed" boolean NOT NULL DEFAULT false, "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4d0193bd9561ff3db34d34de23c" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_abf868039dbfa5d7ed8c090ae5" ON "reorgs" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_967a9e2cd64a0d3555f7058efa" ON "reorgs" ("chain_id") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_0512985dacf3b369bc8b2e4302" ON "reorgs" ("status") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_1eaec3cee2101a81cc608ceb40" ON "reorgs" ("failed") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_82cbc697bf8451cc4ec47cd3de" ON "reorgs" ("chain_id", "from_number") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_82cbc697bf8451cc4ec47cd3de"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_1eaec3cee2101a81cc608ceb40"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_0512985dacf3b369bc8b2e4302"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_967a9e2cd64a0d3555f7058efa"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_abf868039dbfa5d7ed8c090ae5"`)
        await queryRunner.query(`DROP TABLE "reorgs"`)
    }
}
