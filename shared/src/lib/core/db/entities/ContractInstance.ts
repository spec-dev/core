import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Unique,
} from 'typeorm'
import { Contract } from './Contract'

/**
 * Instances of deployed contracts.
 */
@Entity('contract_instances')
@Index(['address', 'chainId'], { unique: true })
export class ContractInstance {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    address: string

    @Column()
    name: string

    @Column({ nullable: true })
    desc: string

    @Column({ name: 'chain_id' })
    chainId: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @Column('int8', { name: 'contract_id' })
    contractId: number

    @ManyToOne(() => Contract, (contract) => contract.contractInstances)
    @JoinColumn({ name: 'contract_id' })
    contract: Contract
}
