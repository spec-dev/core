import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    UpdateDateColumn,
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

    @Column()
    nsp: string

    @Column()
    name: string

    @Column()
    version: string

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

    @Column('int8', { name: 'event_id' })
    eventId: number

    @ManyToOne(() => Event, (event) => event.eventVersions)
    @JoinColumn({ name: 'event_id' })
    event: Event

    @OneToMany(() => LiveEventVersion, (liveEventVersion) => liveEventVersion.eventVersion)
    liveEventVersions: LiveEventVersion[]
}
