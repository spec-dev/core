import { MigrationInterface, QueryRunner } from 'typeorm'

export class newContractRegistration1701029822283 implements MigrationInterface {
    name = 'newContractRegistration1701029822283'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract_registration_jobs" DROP COLUMN "addresses"`)
        await queryRunner.query(`ALTER TABLE "contract_registration_jobs" DROP COLUMN "cursors"`)
        await queryRunner.query(
            `ALTER TABLE "contract_registration_jobs" DROP COLUMN "contract_name"`
        )
        await queryRunner.query(`ALTER TABLE "contract_registration_jobs" DROP COLUMN "chain_id"`)
        await queryRunner.query(`ALTER TABLE "contract_registration_jobs" ADD "groups" json`)
        await queryRunner.query(`ALTER TABLE "contracts" ADD "is_factory_group" boolean`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "is_factory_group"`)
        await queryRunner.query(`ALTER TABLE "contract_registration_jobs" DROP COLUMN "groups"`)
        await queryRunner.query(
            `ALTER TABLE "contract_registration_jobs" ADD "chain_id" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_registration_jobs" ADD "contract_name" character varying NOT NULL`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_registration_jobs" ADD "cursors" jsonb DEFAULT '{}'`
        )
        await queryRunner.query(
            `ALTER TABLE "contract_registration_jobs" ADD "addresses" json NOT NULL`
        )
        await queryRunner.query(`ALTER TABLE "event_versions" ADD "chain_id" character varying`)
    }
}
