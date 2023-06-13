import { MigrationInterface, QueryRunner } from 'typeorm'

export class createContractRegistrationJob1686249270095 implements MigrationInterface {
    name = 'createContractRegistrationJob1686249270095'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "contract_registration_jobs" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "nsp" character varying NOT NULL, "contract_name" character varying NOT NULL, "addresses" json NOT NULL, "chain_id" character varying NOT NULL, "status" character varying NOT NULL, "cursors" jsonb DEFAULT '{}', "failed" boolean NOT NULL DEFAULT false, "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d8d19d92d7a52415008d6f5037f" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_240914c22290b2684f267d0c17" ON "contract_registration_jobs" ("uid") `
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_240914c22290b2684f267d0c17"`)
        await queryRunner.query(`DROP TABLE "contract_registration_jobs"`)
    }
}
