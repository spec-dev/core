import { MigrationInterface, QueryRunner } from 'typeorm'

export class initTables1661730686148 implements MigrationInterface {
    name = 'initTables1661730686148'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "events" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying, "is_contract_event" boolean NOT NULL, "namespace_id" integer NOT NULL, CONSTRAINT "UQ_afd19d59c91fc595fde1c474e6c" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ee00bddeb44e2e199093485bff" ON "events" ("uid") `
        )
        await queryRunner.query(
            `CREATE TABLE "event_versions" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "event_id" integer NOT NULL, CONSTRAINT "PK_39e5d80e8916148e66c80d3bf88" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8703898643c860c0aa469ec2b6" ON "event_versions" ("uid") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_4b3877d457294d164194c8df5c" ON "event_versions" ("nsp", "name", "version") `
        )
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
            `CREATE TABLE "live_edge_function_versions" ("id" SERIAL NOT NULL, "role" character varying NOT NULL, "args" json, "argsMap" json, "metadata" json, "live_object_version_id" integer NOT NULL, "edge_function_version_id" integer NOT NULL, CONSTRAINT "PK_b6dc61aa045c48e8804d3e0f205" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_18cfd12f6d583bb28b0f9239ea" ON "live_edge_function_versions" ("live_object_version_id", "edge_function_version_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "edge_function_versions" ("id" SERIAL NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "url" character varying NOT NULL, "args" json, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "edge_function_id" integer NOT NULL, CONSTRAINT "PK_8738e41ffc9d22039b83094c43a" PRIMARY KEY ("id"))`
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
            `CREATE TABLE "namespaces" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35c142e0f0de70165cc1a74b2cb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fdfcfe825c4a1136ae956e01f3" ON "namespaces" ("slug") `
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
            `CREATE TABLE "event_generators" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "parent_id" bigint NOT NULL, "discriminator" character varying NOT NULL, "name" character varying NOT NULL, "url" character varying NOT NULL, "metadata" json, "event_versions" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35dfc8bcdce96e615d8b9c3c262" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b588579173e2990337a6525833" ON "event_generators" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_cf44727338b1a3509e41fa680c" ON "event_generators" ("parent_id", "discriminator") `
        )
        await queryRunner.query(
            `CREATE TABLE "instances"."published_events" ("id" SERIAL NOT NULL, "uid" character varying(30) NOT NULL, "name" character varying NOT NULL, "origin" json NOT NULL, "data" json NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a6d7739000234e10d5337dbbb06" UNIQUE ("uid"), CONSTRAINT "PK_513ed483ffe68abc338566e27a6" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_a6d7739000234e10d5337dbbb0" ON "instances"."published_events" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_e110ab98956e5e98eacb18dfed" ON "instances"."published_events" ("name") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_9ab9986215f5db458ed1e45e6d" ON "instances"."published_events" ("name", "id") `
        )
        await queryRunner.query(
            `ALTER TABLE "events" ADD CONSTRAINT "FK_803cbdcb617c236ac7c6102af08" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "event_versions" ADD CONSTRAINT "FK_4d384c45e5ae782590d6162df15" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
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
        await queryRunner.query(
            `ALTER TABLE "event_versions" DROP CONSTRAINT "FK_4d384c45e5ae782590d6162df15"`
        )
        await queryRunner.query(
            `ALTER TABLE "events" DROP CONSTRAINT "FK_803cbdcb617c236ac7c6102af08"`
        )
        await queryRunner.query(`DROP INDEX "instances"."IDX_9ab9986215f5db458ed1e45e6d"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_e110ab98956e5e98eacb18dfed"`)
        await queryRunner.query(`DROP INDEX "instances"."IDX_a6d7739000234e10d5337dbbb0"`)
        await queryRunner.query(`DROP TABLE "instances"."published_events"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_cf44727338b1a3509e41fa680c"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_b588579173e2990337a6525833"`)
        await queryRunner.query(`DROP TABLE "event_generators"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_92d1542088774a5957b5164254"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_086b9a632003fd3a31b48b117b"`)
        await queryRunner.query(`DROP TABLE "contracts"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_868a07220ff7f06dbf7b216b64"`)
        await queryRunner.query(`DROP TABLE "contract_instances"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_fdfcfe825c4a1136ae956e01f3"`)
        await queryRunner.query(`DROP TABLE "namespaces"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_5fa1a74e2596ae4f63f7e52c2f"`)
        await queryRunner.query(`DROP TABLE "edge_functions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ff5f0499ee54fc9a68ef4590bf"`)
        await queryRunner.query(`DROP TABLE "edge_function_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_18cfd12f6d583bb28b0f9239ea"`)
        await queryRunner.query(`DROP TABLE "live_edge_function_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_c5a5c7f2c0e552949988c7787e"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_539c5aa535c72b67d5bff49cb8"`)
        await queryRunner.query(`DROP TABLE "live_object_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_9d83fbec3921618dfa594ff64c"`)
        await queryRunner.query(`DROP TABLE "live_objects"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_52e8d7e6cda49620477d47dc8c"`)
        await queryRunner.query(`DROP TABLE "live_event_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_4b3877d457294d164194c8df5c"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_8703898643c860c0aa469ec2b6"`)
        await queryRunner.query(`DROP TABLE "event_versions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ee00bddeb44e2e199093485bff"`)
        await queryRunner.query(`DROP TABLE "events"`)
    }
}
