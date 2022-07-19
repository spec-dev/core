import { MigrationInterface, QueryRunner } from 'typeorm'

export class initDb1658196787178 implements MigrationInterface {
    name = 'initDb1658196787178'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "edge_function_versions" ("id" SERIAL NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "edgeFunctionId" integer, CONSTRAINT "PK_8738e41ffc9d22039b83094c43a" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ff5f0499ee54fc9a68ef4590bf" ON "edge_function_versions" ("nsp", "name", "version") `
        )
        await queryRunner.query(
            `CREATE TABLE "edge_functions" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "desc" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "namespaceId" integer, CONSTRAINT "UQ_344a4bf08fbf38dac9c5e073d2c" UNIQUE ("namespaceId", "name"), CONSTRAINT "PK_2735f07eea3bd0c3669128e00df" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_5fa1a74e2596ae4f63f7e52c2f" ON "edge_functions" ("name") `
        )
        await queryRunner.query(
            `CREATE TABLE "namespaces" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35c142e0f0de70165cc1a74b2cb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fdfcfe825c4a1136ae956e01f3" ON "namespaces" ("slug") `
        )
        await queryRunner.query(
            `ALTER TABLE "edge_function_versions" ADD CONSTRAINT "FK_539e3a04ca25283ea4280deb657" FOREIGN KEY ("edgeFunctionId") REFERENCES "edge_functions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "edge_functions" ADD CONSTRAINT "FK_1ce8ad5c8f6f6a64277a8feb04f" FOREIGN KEY ("namespaceId") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "edge_functions" DROP CONSTRAINT "FK_1ce8ad5c8f6f6a64277a8feb04f"`
        )
        await queryRunner.query(
            `ALTER TABLE "edge_function_versions" DROP CONSTRAINT "FK_539e3a04ca25283ea4280deb657"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_fdfcfe825c4a1136ae956e01f3"`)
        await queryRunner.query(`DROP TABLE "namespaces"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_5fa1a74e2596ae4f63f7e52c2f"`)
        await queryRunner.query(`DROP TABLE "edge_functions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ff5f0499ee54fc9a68ef4590bf"`)
        await queryRunner.query(`DROP TABLE "edge_function_versions"`)
    }
}
