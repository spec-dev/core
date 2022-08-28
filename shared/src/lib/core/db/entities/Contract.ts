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
} from 'typeorm'
import { Namespace } from './Namespace'
import { ContractInstance } from './ContractInstance'

/**
 * Unique contract interfaces.
 */
@Entity('contracts')
@Unique(['namespaceId', 'slug'])
export class Contract {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    name: string

    @Column()
    @Index()
    slug: string

    @Column()
    desc: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @Column('int8', { name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.contracts)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @OneToMany(() => ContractInstance, (contractInstance) => contractInstance.contract)
    contractInstances: ContractInstance[]
}
