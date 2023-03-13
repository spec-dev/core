import { MigrationInterface, QueryRunner } from 'typeorm'

export class initdb1678655262034 implements MigrationInterface {
    name = 'initdb1678655262034'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "events" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying, "is_contract_event" boolean, "namespace_id" integer NOT NULL, CONSTRAINT "UQ_afd19d59c91fc595fde1c474e6c" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`
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
            `CREATE TABLE "live_event_versions" ("id" SERIAL NOT NULL, "live_object_version_id" integer NOT NULL, "event_version_id" integer NOT NULL, "is_input" boolean, CONSTRAINT "PK_a72474a1f17f1da9d794a3a8cef" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_52e8d7e6cda49620477d47dc8c" ON "live_event_versions" ("live_object_version_id", "event_version_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "live_objects" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "display_name" character varying, "desc" character varying NOT NULL, "has_icon" boolean, "namespace_id" integer NOT NULL, CONSTRAINT "UQ_a30592e01f62721e3a376a2fd67" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_e8f8647409f98468ea09cdde1b9" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9d83fbec3921618dfa594ff64c" ON "live_objects" ("uid") `
        )
        await queryRunner.query(
            `CREATE TABLE "live_object_versions" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "nsp" character varying NOT NULL, "name" character varying NOT NULL, "version" character varying NOT NULL, "url" character varying, "status" smallint, "properties" json, "example" json, "config" json, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "live_object_id" integer NOT NULL, CONSTRAINT "PK_0874f0fb77c564707f1040e00f8" PRIMARY KEY ("id"))`
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
            `CREATE TABLE "edge_functions" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "desc" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "namespace_id" integer NOT NULL, CONSTRAINT "UQ_58027d7848cad23909dda83ea0b" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_2735f07eea3bd0c3669128e00df" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_5fa1a74e2596ae4f63f7e52c2f" ON "edge_functions" ("name") `
        )
        await queryRunner.query(
            `CREATE TABLE "namespaces" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "code_url" character varying, "has_icon" boolean, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35c142e0f0de70165cc1a74b2cb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_148ffc0b4a49d22cd26049bfd5" ON "namespaces" ("name") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_fdfcfe825c4a1136ae956e01f3" ON "namespaces" ("slug") `
        )
        await queryRunner.query(
            `CREATE TABLE "contracts" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "namespace_id" integer NOT NULL, CONSTRAINT "UQ_fe471f1eaa382d05a1ae22a7ce2" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_2c7b8f3a7b1acdd49497d83d0fb" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_086b9a632003fd3a31b48b117b" ON "contracts" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_4c5fd33d0a8e1ff7c4886d1655" ON "contracts" ("name") `
        )
        await queryRunner.query(
            `CREATE TABLE "contract_instances" ("id" SERIAL NOT NULL, "address" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying, "chain_id" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "contract_id" integer NOT NULL, CONSTRAINT "PK_213c6ab4bcd0f91cc31349c677a" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b10fd3530f5b8a6d5771a640a0" ON "contract_instances" ("address", "chain_id", "contract_id") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_247b14579ee9661318881c1cfe" ON "contract_instances" ("address", "chain_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "sessions" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "user_id" integer NOT NULL, "token" character varying NOT NULL, "salt" character varying NOT NULL, "expiration_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_c0a2d91b41e6ef72cc0ca0b1fa" ON "sessions" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_e9f62f5dcb8a54b84234c9e7a0" ON "sessions" ("token") `
        )
        await queryRunner.query(
            `CREATE TABLE "users" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "email" character varying NOT NULL, "first_name" character varying, "last_name" character varying, "hashed_pw" character varying, "salt" character varying, "email_verified" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_6e20ce1edf0678a09f1963f958" ON "users" ("uid") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `
        )
        await queryRunner.query(
            `CREATE TABLE "project_roles" ("id" SERIAL NOT NULL, "project_id" integer NOT NULL, "org_user_id" integer NOT NULL, "role" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8ac6a6996b6eaeae7b8fbb669f1" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_98ef821d784c775db928ee55a2" ON "project_roles" ("project_id", "org_user_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "org_users" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "org_id" integer NOT NULL, "user_id" integer NOT NULL, "role" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f5d38667a0995ce10777b8474af" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_600881d84df4b1b1b900555c4d" ON "org_users" ("uid") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_1e06ead3f9dca34638f3861fae" ON "org_users" ("org_id", "user_id") `
        )
        await queryRunner.query(
            `CREATE TABLE "orgs" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_80fb575575f4e345deecbb2aa2" ON "orgs" ("uid") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ed4cb7ee9ca5967c101d13bea4" ON "orgs" ("slug") `
        )
        await queryRunner.query(
            `CREATE TABLE "projects" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "org_id" integer NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "api_key" character varying NOT NULL, "admin_key" character varying NOT NULL, "signed_api_key" character varying NOT NULL, "signed_admin_key" character varying NOT NULL, "admin_channel" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f11ed15665df2a5d453e2fb7bd" ON "projects" ("uid") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_688122a0b0c105a34c6ca2886b" ON "projects" ("api_key") `
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_36a39a258d08125fa2ccd3d23f" ON "projects" ("admin_key") `
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_02313999fde4f540271e63a3af" ON "projects" ("org_id", "slug") `
        )
        await queryRunner.query(
            `CREATE TABLE "deployments" ("id" SERIAL NOT NULL, "version" character varying NOT NULL, "project_id" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'created', "failed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1e5627acb3c950deb83fe98fc48" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_085b4277c856ecd0ca00708210" ON "deployments" ("version") `
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
            `ALTER TABLE "contracts" ADD CONSTRAINT "FK_7ca1b7b3d22fb1cd9a0e775e004" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "FK_ce90159872b3e77e5d9b084d9cb" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "project_roles" ADD CONSTRAINT "FK_acdc465c26e9c6e166b0249131b" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "project_roles" ADD CONSTRAINT "FK_d1ed1a35a8988b737e9c9559935" FOREIGN KEY ("org_user_id") REFERENCES "org_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "org_users" ADD CONSTRAINT "FK_91bdfbf80cce12792eebd7979e8" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "org_users" ADD CONSTRAINT "FK_888544af4e3f2f6607edc5c334e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "projects" ADD CONSTRAINT "FK_9f78c168a06314a987cf3bd401c" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "deployments" ADD CONSTRAINT "FK_a3eb8bbf794c8df7575096f7e90" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "deployments" DROP CONSTRAINT "FK_a3eb8bbf794c8df7575096f7e90"`
        )
        await queryRunner.query(
            `ALTER TABLE "projects" DROP CONSTRAINT "FK_9f78c168a06314a987cf3bd401c"`
        )
        await queryRunner.query(
            `ALTER TABLE "org_users" DROP CONSTRAINT "FK_888544af4e3f2f6607edc5c334e"`
        )
        await queryRunner.query(
            `ALTER TABLE "org_users" DROP CONSTRAINT "FK_91bdfbf80cce12792eebd7979e8"`
        )
        await queryRunner.query(
            `ALTER TABLE "project_roles" DROP CONSTRAINT "FK_d1ed1a35a8988b737e9c9559935"`
        )
        await queryRunner.query(
            `ALTER TABLE "project_roles" DROP CONSTRAINT "FK_acdc465c26e9c6e166b0249131b"`
        )
        await queryRunner.query(
            `ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" DROP CONSTRAINT "FK_ce90159872b3e77e5d9b084d9cb"`
        )
        await queryRunner.query(
            `ALTER TABLE "contracts" DROP CONSTRAINT "FK_7ca1b7b3d22fb1cd9a0e775e004"`
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
        await queryRunner.query(`DROP INDEX "public"."IDX_cf44727338b1a3509e41fa680c"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_b588579173e2990337a6525833"`)
        await queryRunner.query(`DROP TABLE "event_generators"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_085b4277c856ecd0ca00708210"`)
        await queryRunner.query(`DROP TABLE "deployments"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_02313999fde4f540271e63a3af"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_36a39a258d08125fa2ccd3d23f"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_688122a0b0c105a34c6ca2886b"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_f11ed15665df2a5d453e2fb7bd"`)
        await queryRunner.query(`DROP TABLE "projects"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ed4cb7ee9ca5967c101d13bea4"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_80fb575575f4e345deecbb2aa2"`)
        await queryRunner.query(`DROP TABLE "orgs"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_1e06ead3f9dca34638f3861fae"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_600881d84df4b1b1b900555c4d"`)
        await queryRunner.query(`DROP TABLE "org_users"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_98ef821d784c775db928ee55a2"`)
        await queryRunner.query(`DROP TABLE "project_roles"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_6e20ce1edf0678a09f1963f958"`)
        await queryRunner.query(`DROP TABLE "users"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_e9f62f5dcb8a54b84234c9e7a0"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_c0a2d91b41e6ef72cc0ca0b1fa"`)
        await queryRunner.query(`DROP TABLE "sessions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_247b14579ee9661318881c1cfe"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_b10fd3530f5b8a6d5771a640a0"`)
        await queryRunner.query(`DROP TABLE "contract_instances"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_4c5fd33d0a8e1ff7c4886d1655"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_086b9a632003fd3a31b48b117b"`)
        await queryRunner.query(`DROP TABLE "contracts"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_fdfcfe825c4a1136ae956e01f3"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_148ffc0b4a49d22cd26049bfd5"`)
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