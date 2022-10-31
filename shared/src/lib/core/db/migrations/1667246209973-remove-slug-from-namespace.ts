import { MigrationInterface, QueryRunner } from 'typeorm'

export class removeSlugFromNamespace1667246209973 implements MigrationInterface {
    name = 'removeSlugFromNamespace1667246209973'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_92d1542088774a5957b5164254"`)
        await queryRunner.query(`ALTER TABLE "contract_instances" DROP CONSTRAINT "unique_cis"`)
        await queryRunner.query(
            `ALTER TABLE "contracts" DROP CONSTRAINT "UQ_2085920d62f41248243d7d12d23"`
        )
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "slug"`)
        await queryRunner.query(
            `CREATE INDEX "IDX_4c5fd33d0a8e1ff7c4886d1655" ON "contracts" ("name") `
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00" UNIQUE ("contract_id", "address", "chain_id")`
        )
        await queryRunner.query(
            `ALTER TABLE "contracts" ADD CONSTRAINT "UQ_fe471f1eaa382d05a1ae22a7ce2" UNIQUE ("namespace_id", "name")`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contracts" DROP CONSTRAINT "UQ_fe471f1eaa382d05a1ae22a7ce2"`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" DROP CONSTRAINT "UQ_b10fd3530f5b8a6d5771a640a00"`
        )
        await queryRunner.query(`DROP INDEX "public"."IDX_4c5fd33d0a8e1ff7c4886d1655"`)
        await queryRunner.query(`ALTER TABLE "contracts" ADD "slug" character varying NOT NULL`)
        await queryRunner.query(
            `ALTER TABLE "contracts" ADD CONSTRAINT "UQ_2085920d62f41248243d7d12d23" UNIQUE ("slug", "namespace_id")`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_instances" ADD CONSTRAINT "unique_cis" UNIQUE ("address", "contract_id", "chain_id")`
        )
        await queryRunner.query(
            `CREATE INDEX "IDX_92d1542088774a5957b5164254" ON "contracts" ("slug") `
        )
    }
}
