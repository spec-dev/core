import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, OneToMany } from 'typeorm'
import { EdgeFunction } from './EdgeFunction'
import { Contract } from './Contract'
import { Event } from './Event'
import { LiveObject } from './LiveObject'

/**
 * A globally unique namespace for functions, contracts, events, live objects, etc.
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
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @OneToMany(() => Contract, (contract) => contract.namespace)
    contracts: Contract[]

    @OneToMany(() => EdgeFunction, (edgeFunction) => edgeFunction.namespace)
    edgeFunctions: EdgeFunction[]

    @OneToMany(() => Event, (event) => event.namespace)
    events: Event[]

    @OneToMany(() => LiveObject, (liveObject) => liveObject.namespace)
    liveObjects: LiveObject[]
}
