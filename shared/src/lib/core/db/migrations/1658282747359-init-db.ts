import { MigrationInterface, QueryRunner } from 'typeorm'

export class initDb1658282747359 implements MigrationInterface {
    name = 'initDb1658282747359'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "edge_function_versions" ("id" SERIAL NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "edge_function_id" integer NOT NULL, CONSTRAINT "PK_8738e41ffc9d22039b83094c43a" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ff5f0499ee54fc9a68ef4590bf" ON "edge_function_versions" ("nsp", "name", "version") `
        )
        await queryRunner.query(
            `CREATE TABLE "edge_functions" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "desc" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "namespace_id" integer NOT NULL, CONSTRAINT "UQ_58027d7848cad23909dda83ea0b" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_2735f07eea3bd0c3669128e00df" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_5fa1a74e2596ae4f63f7e52c2f" ON "edge_functions" ("name") `
        )
        await queryRunner.query(
            `CREATE TABLE "contract_instances" ("id" SERIAL NOT NULL, "address" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "contract_id" integer NOT NULL, CONSTRAINT "UQ_4cc9da6cff7e1560c8b78e398eb" UNIQUE ("contract_id", "address"), CONSTRAINT "PK_213c6ab4bcd0f91cc31349c677a" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_868a07220ff7f06dbf7b216b64" ON "contract_instances" ("address") `
        )
        await queryRunner.query(
            `CREATE TABLE "contracts" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "desc" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "namespace_id" integer NOT NULL, CONSTRAINT "UQ_2085920d62f41248243d7d12d23" UNIQUE ("namespace_id", "slug"), CONSTRAINT "PK_2c7b8f3a7b1acdd49497d83d0fb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_086b9a632003fd3a31b48b117b" ON "contracts" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_92d1542088774a5957b5164254" ON "contracts" ("slug") `
        )
        await queryRunner.query(
            `CREATE TABLE "namespaces" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35c142e0f0de70165cc1a74b2cb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fdfcfe825c4a1136ae956e01f3" ON "namespaces" ("slug") `
        )
        await queryRunner.query(
            `ALTER TABLE "edge_function_versions" ADD CONSTRAINT "FK_283d34b6a86ba62bddd4a6d06b4" FOREIGN KEY ("edge_function_id") REFERENCES "edge_functions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "edge_functions" ADD CONSTRAINT "FK_c7fa7129d5811f9b52c1f4fa635" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "FK_ce90159872b3e77e5d9b084d9cb" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "contracts" ADD CONSTRAINT "FK_7ca1b7b3d22fb1cd9a0e775e004" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contracts" DROP CONSTRAINT "FK_7ca1b7b3d22fb1cd9a0e775e004"`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" DROP CONSTRAINT "FK_ce90159872b3e77e5d9b084d9cb"`
        )
        await queryRunner.query(
            `ALTER TABLE "edge_functions" DROP CONSTRAINT "FK_c7fa7129d5811f9b52c1f4fa635"`
        )
        await queryRunner.query(
            `ALTER TABLE "edge_function_versions" DROP CONSTRAINT "FK_283d34b6a86ba62bddd4a6d06b4"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_fdfcfe825c4a1136ae956e01f3"`)
        await queryRunner.query(`DROP TABLE "namespaces"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_92d1542088774a5957b5164254"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_086b9a632003fd3a31b48b117b"`)
        await queryRunner.query(`DROP TABLE "contracts"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_868a07220ff7f06dbf7b216b64"`)
        await queryRunner.query(`DROP TABLE "contract_instances"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_5fa1a74e2596ae4f63f7e52c2f"`)
        await queryRunner.query(`DROP TABLE "edge_functions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ff5f0499ee54fc9a68ef4590bf"`)
        await queryRunner.query(`DROP TABLE "edge_function_versions"`)
    }
}
