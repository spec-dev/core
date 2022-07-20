import { MigrationInterface, QueryRunner } from 'typeorm'

export class createEventGeneratorTable1658285708985 implements MigrationInterface {
    name = 'createEventGeneratorTable1658285708985'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "event_generators" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "parent_id" bigint NOT NULL, "discriminator" character varying NOT NULL, "name" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35dfc8bcdce96e615d8b9c3c262" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b588579173e2990337a6525833" ON "event_generators" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_cf44727338b1a3509e41fa680c" ON "event_generators" ("parent_id", "discriminator") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_cf44727338b1a3509e41fa680c"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_b588579173e2990337a6525833"`)
        await queryRunner.query(`DROP TABLE "event_generators"`)
    }
}
