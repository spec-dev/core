import { MigrationInterface, QueryRunner } from 'typeorm'

export class addProjectRelatedTables1662850097619 implements MigrationInterface {
    name = 'addProjectRelatedTables1662850097619'

    public async up(queryRunner: QueryRunner): Promise<void> {
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
            `CREATE TABLE "projects" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "org_id" integer NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "api_key" character varying NOT NULL, "admin_key" character varying NOT NULL, "admin_channel" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f11ed15665df2a5d453e2fb7bd" ON "projects" ("uid") `
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
        await queryRunner.query(`DROP INDEX "public"."IDX_085b4277c856ecd0ca00708210"`)
        await queryRunner.query(`DROP TABLE "deployments"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_02313999fde4f540271e63a3af"`)
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
    }
}
