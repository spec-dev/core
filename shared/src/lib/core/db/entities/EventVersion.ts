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
@Index(['nsp', 'name', 'version', 'chainId'], { unique: true })
@Index(['nsp', 'name', 'chainId'])
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

    @Column({ name: 'chain_id', nullable: true })
    chainId: number

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
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
