import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, OneToMany } from 'typeorm'
import { EdgeFunction } from './EdgeFunction'
import { Contract } from './Contract'
import { Event } from './Event'

/**
 * A global Spec namespace for functions, contracts, events, etc.,
 */
@Entity('namespaces')
export class Namespace {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    name: string

    @Column()
    @Index({ unique: true })
    slug: string

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @OneToMany(() => EdgeFunction, (edgeFunction) => edgeFunction.namespace)
    edgeFunctions: EdgeFunction[]

    @OneToMany(() => Contract, (contract) => contract.namespace)
    contracts: Contract[]

    @OneToMany(() => Event, (event) => event.namespace)
    events: Event[]
}
