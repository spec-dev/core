import { MigrationInterface, QueryRunner } from "typeorm";

export class createContractInstanceRegistrationTable1685044455354 implements MigrationInterface {
    name = 'createContractInstanceRegistrationTable1685044455354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "contract_instance_registrations" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "contract_instance_id" integer NOT NULL, "status" character varying NOT NULL, "cursor" integer, "failed" boolean NOT NULL DEFAULT false, "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fa4d0ecf1f2f501576fc448f49b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dafd61444a8b2e03fd61753931" ON "contract_instance_registrations" ("uid") `);
        await queryRunner.query(`CREATE INDEX "IDX_2106131c075422adf56b8291c8" ON "contract_instance_registrations" ("contract_instance_id") `);
        await queryRunner.query(`ALTER TABLE "contract_instance_registrations" ADD CONSTRAINT "FK_2106131c075422adf56b8291c82" FOREIGN KEY ("contract_instance_id") REFERENCES "contract_instances"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract_instance_registrations" DROP CONSTRAINT "FK_2106131c075422adf56b8291c82"`);        
        await queryRunner.query(`DROP INDEX "public"."IDX_2106131c075422adf56b8291c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dafd61444a8b2e03fd61753931"`);
        await queryRunner.query(`DROP TABLE "contract_instance_registrations"`);
    }
}
