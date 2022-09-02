import { MigrationInterface, QueryRunner } from "typeorm";

export class addLatestInteractionsTable1662144535864 implements MigrationInterface {
    name = 'addLatestInteractionsTable1662144535864'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ethereum"."latest_interactions" ("from" character varying(50) NOT NULL, "to" character varying(50) NOT NULL, "interaction_type" character varying(20) NOT NULL, "hash" character varying(70) NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "block_hash" character varying(70) NOT NULL, "block_number" bigint NOT NULL, CONSTRAINT "PK_8d6ef51b5f31ad371bf86ce2db4" PRIMARY KEY ("from", "to"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "ethereum"."latest_interactions"`);
    }

}
