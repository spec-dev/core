import { MigrationInterface, QueryRunner } from "typeorm";

export class namespaceAccessTokens1686596579147 implements MigrationInterface {
    name = 'namespaceAccessTokens1686596579147'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "namespace_access_tokens" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "namespace_id" integer NOT NULL, "scopes" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_ec66669f28f11aff40b2ab12053" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f6311cf460d5a9e14c71f8fba1" ON "namespace_access_tokens" ("uid") `);
        await queryRunner.query(`ALTER TABLE "namespace_access_tokens" ADD CONSTRAINT "FK_fbc7906daf10d5f3c6b6c461485" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "namespace_access_tokens" DROP CONSTRAINT "FK_fbc7906daf10d5f3c6b6c461485"`);
        await queryRunner.query(`DROP TABLE "namespace_access_tokens"`);
    }
}
