import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    Unique,
    JoinColumn,
    UpdateDateColumn,
} from 'typeorm'
import { Namespace } from './Namespace'
import { ContractInstance } from './ContractInstance'

/**
 * Unique contract interfaces.
 */
@Entity('contracts')
@Unique(['namespaceId', 'name'])
export class Contract {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    @Index()
    name: string

    @Column()
    desc: string

    @Column({ name: 'is_factory_group', nullable: true })
    isFactoryGroup: boolean

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
        nullable: true,
    })
    updatedAt: Date

    @Column({ name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.contracts)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @OneToMany(() => ContractInstance, (contractInstance) => contractInstance.contract)
    contractInstances: ContractInstance[]
}
