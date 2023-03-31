import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, OneToMany } from 'typeorm'
import { EdgeFunction } from './EdgeFunction'
import { Contract } from './Contract'
import { Event } from './Event'
import { LiveObject } from './LiveObject'
import { LiveCallHandler } from './LiveCallHandler'

/**
 * A globally unique namespace for functions, contracts, events, live objects, etc.
 */
@Entity('namespaces')
export class Namespace {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    name: string

    @Column()
    @Index({ unique: true })
    slug: string

    @Column({ name: 'code_url', nullable: true })
    codeUrl: string

    @Column({ name: 'has_icon', nullable: true })
    hasIcon: boolean

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

    @OneToMany(() => LiveCallHandler, (liveCallHandler) => liveCallHandler.namespace)
    liveCallHandlers: LiveCallHandler[]
}
