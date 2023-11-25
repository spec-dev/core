import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'
import { StringKeyMap } from '../../../types'

export enum ContractRegistrationJobStatus {
    Created = 'created',
    Decoding = 'decoding',
    Indexing = 'indexing',
    Complete = 'complete',
}

/**
 * Registration job for a group of contract instances.
 */
@Entity('contract_registration_jobs')
export class ContractRegistrationJob {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    nsp: string

    @Column('json')
    groups: StringKeyMap[]

    @Column('varchar')
    status: ContractRegistrationJobStatus

    @Column('jsonb', { nullable: true, default: '[]' })
    cursors: StringKeyMap

    @Column({ default: false })
    failed: boolean

    @Column('text', { nullable: true })
    error: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @UpdateDateColumn({
        type: 'timestamptz',
        name: 'updated_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
        onUpdate: `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    updatedAt: Date

    view() {
        return {
            uid: this.uid,
            nsp: this.nsp,
            contractName: this.contractName,
            addresses: this.addresses,
            chainId: this.chainId,
            status: this.status,
            cursors: this.cursors,
            failed: this.failed,
            error: this.error,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        }
    }
}
