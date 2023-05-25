import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm'
import { ContractInstance } from './ContractInstance'

export enum ContractInstanceRegistrationStatus {
    Created = 'created',
    InProgress = 'in-progress',
    Complete = 'complete',
}

/**
 * Contract instance registration jobs
 */
@Entity('contract_instance_registrations')
export class ContractInstanceRegistration {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string 

    @Column('int8', { name: 'contract_instance_id' })
    @Index()
    contractInstanceId: number

    @Column()
    status: ContractInstanceRegistrationStatus 

    @Column({ nullable: true })
    cursor: number

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

    @ManyToOne(() => ContractInstance, (contractInstance) => contractInstance.contractInstanceRegistrations)
    @JoinColumn({ name: 'contract_instance_id' })
    contractInstance: ContractInstance
}