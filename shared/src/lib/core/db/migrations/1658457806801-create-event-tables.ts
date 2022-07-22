import { MigrationInterface, QueryRunner } from 'typeorm'

export class createEventTables1658457806801 implements MigrationInterface {
    name = 'createEventTables1658457806801'

    public async up(queryRunner: QueryRunner): Promise<void> {
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
            `CREATE TABLE "events" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "name" character varying NOT NULL, "desc" character varying, "topic" character varying NOT NULL, "isContractEvent" boolean NOT NULL, "namespace_id" integer NOT NULL, CONSTRAINT "UQ_afd19d59c91fc595fde1c474e6c" UNIQUE ("namespace_id", "name"), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ee00bddeb44e2e199093485bff" ON "events" ("uid") `
        )
        await queryRunner.query(
            `ALTER TABLE "event_generators" ADD "eventVersions" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "event_versions" ADD CONSTRAINT "FK_4d384c45e5ae782590d6162df15" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
        await queryRunner.query(
            `ALTER TABLE "events" ADD CONSTRAINT "FK_803cbdcb617c236ac7c6102af08" FOREIGN KEY ("namespace_id") REFERENCES "namespaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "events" DROP CONSTRAINT "FK_803cbdcb617c236ac7c6102af08"`
        )
        await queryRunner.query(
            `ALTER TABLE "event_versions" DROP CONSTRAINT "FK_4d384c45e5ae782590d6162df15"`
        )
        await queryRunner.query(`ALTER TABLE "event_generators" DROP COLUMN "eventVersions"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_ee00bddeb44e2e199093485bff"`)
        await queryRunner.query(`DROP TABLE "events"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_4b3877d457294d164194c8df5c"`)
        await queryRunner.query(`DROP INDEX "public"."IDX_8703898643c860c0aa469ec2b6"`)
        await queryRunner.query(`DROP TABLE "event_versions"`)
    }
}
