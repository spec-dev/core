import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    ManyToOne,
    OneToMany,
    Unique,
    JoinColumn,
} from 'typeorm'
import { Namespace } from './Namespace'
import { EventVersion } from './EventVersion'

/**
 * Spec Events.
 */
@Entity('events')
@Unique(['namespaceId', 'name'])
export class Event {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    name: string

    @Column({ nullable: true })
    desc: string

    @Column({ name: 'is_contract_event', nullable: true })
    isContractEvent: boolean

    @Column('int8', { name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.events)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @OneToMany(() => EventVersion, (eventVersion) => eventVersion.event)
    eventVersions: EventVersion[]
}
