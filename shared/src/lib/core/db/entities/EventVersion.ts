import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm'
import { Event } from './Event'
import { LiveEventVersion } from './LiveEventVersion'

/**
 * A particular version of a Spec event.
 */
@Entity('event_versions')
@Index(['nsp', 'name', 'version'], { unique: true })
export class EventVersion {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    // Denormalized namespace name for quicker proxy lookups.
    @Column()
    nsp: string

    @Column()
    name: string

    @Column()
    version: string

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @Column('int8', { name: 'event_id' })
    eventId: number

    @ManyToOne(() => Event, (event) => event.eventVersions)
    @JoinColumn({ name: 'event_id' })
    event: Event

    @OneToMany(() => LiveEventVersion, (liveEventVersion) => liveEventVersion.eventVersion)
    liveEventVersions: LiveEventVersion[]
}