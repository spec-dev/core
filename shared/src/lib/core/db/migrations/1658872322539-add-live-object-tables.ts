import { MigrationInterface, QueryRunner } from 'typeorm'

export class addLiveObjectTables1658872322539 implements MigrationInterface {
    name = 'addLiveObjectTables1658872322539'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "live_event_versions" ("id" SERIAL NOT NULL, "live_object_version_id" integer NOT NULL, "event_version_id" integer NOT NULL, CONSTRAINT "PK_a72474a1f17f1da9d794a3a8cef" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_52e8d7e6cda49620477d47dc8c" ON "live_event_versions" ("live_object_version_id", "event_version_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "live_objects" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying NOT NULL, "namespace_id" integer NOT NULL, CONSTRAINT "UQ_a30592e01f62721e3a376a2fd67" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_e8f8647409f98468ea09cdde1b9" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9d83fbec3921618dfa594ff64c" ON "live_objects" ("uid") `
        )
        await queryRunner.query(
            `CREATE TABLE "live_object_versions" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "live_object_id" integer NOT NULL, CONSTRAINT "PK_0874f0fb77c564707f1040e00f8" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_539c5aa535c72b67d5bff49cb8" ON "live_object_versions" ("uid") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_c5a5c7f2c0e552949988c7787e" ON "live_object_versions" ("nsp", "name", "version") `
        )
        await queryRunner.query(
            `CREATE TABLE "live_edge_function_versions" ("id" SERIAL NOT NULL, "live_object_version_id" integer NOT NULL, "edge_function_version_id" integer NOT NULL, CONSTRAINT "PK_b6dc61aa045c48e8804d3e0f205" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_18cfd12f6d583bb28b0f9239ea" ON "live_edge_function_versions" ("live_object_version_id", "edge_function_version_id") `
        )
        await queryRunner.query(
            `ALTER TABLE "live_event_versions" ADD CONSTRAINT "FK_d3e178fcaab056125963018e6b0" FOREIGN KEY ("live_object_version_id") REFERENCES "live_object_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "live_event_versions" ADD CONSTRAINT "FK_df53ed4159ea6dfc1cf2a6a2642" FOREIGN KEY ("event_version_id") REFERENCES "event_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "live_objects" ADD CONSTRAINT "FK_d5af14c390537677209c01b529d" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "live_object_versions" ADD CONSTRAINT "FK_0401b247cd1624b5349c18fee9a" FOREIGN KEY ("live_object_id") REFERENCES "live_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "live_edge_function_versions" ADD CONSTRAINT "FK_ae6532c259431a93c25c67e533a" FOREIGN KEY ("live_object_version_id") REFERENCES "live_object_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "live_edge_function_versions" ADD CONSTRAINT "FK_ae3243aa615f524928f37cb1247" FOREIGN KEY ("edge_function_version_id") REFERENCES "edge_function_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "live_edge_function_versions" DROP CONSTRAINT "FK_ae3243aa615f524928f37cb1247"`
        )
        await queryRunner.query(
            `ALTER TABLE "live_edge_function_versions" DROP CONSTRAINT "FK_ae6532c259431a93c25c67e533a"`
        )
        await queryRunner.query(
            `ALTER TABLE "live_object_versions" DROP CONSTRAINT "FK_0401b247cd1624b5349c18fee9a"`
        )
        await queryRunner.query(
            `ALTER TABLE "live_objects" DROP CONSTRAINT "FK_d5af14c390537677209c01b529d"`
        )
        await queryRunner.query(
            `ALTER TABLE "live_event_versions" DROP CONSTRAINT "FK_df53ed4159ea6dfc1cf2a6a2642"`
        )
        await queryRunner.query(
            `ALTER TABLE "live_event_versions" DROP CONSTRAINT "FK_d3e178fcaab056125963018e6b0"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_18cfd12f6d583bb28b0f9239ea"`)
        await queryRunner.query(`DROP TABLE "live_edge_function_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_c5a5c7f2c0e552949988c7787e"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_539c5aa535c72b67d5bff49cb8"`)
        await queryRunner.query(`DROP TABLE "live_object_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_9d83fbec3921618dfa594ff64c"`)
        await queryRunner.query(`DROP TABLE "live_objects"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_52e8d7e6cda49620477d47dc8c"`)
        await queryRunner.query(`DROP TABLE "live_event_versions"`)
    }
}
