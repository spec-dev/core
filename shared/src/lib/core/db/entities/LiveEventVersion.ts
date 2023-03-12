import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm'
import { LiveObjectVersion } from './LiveObjectVersion'
import { EventVersion } from './EventVersion'

/**
 * Join-table between LiveObjectVersion and EventVersion.
 */
@Entity('live_event_versions')
@Index(['liveObjectVersionId', 'eventVersionId'], { unique: true })
export class LiveEventVersion {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ name: 'live_object_version_id' })
    liveObjectVersionId: number

    @ManyToOne(() => LiveObjectVersion, (liveObjectVersion) => liveObjectVersion.liveEventVersions)
    @JoinColumn({ name: 'live_object_version_id' })
    liveObjectVersion: LiveObjectVersion

    @Column({ name: 'event_version_id' })
    eventVersionId: number

    @ManyToOne(() => EventVersion, (eventVersion) => eventVersion.liveEventVersions)
    @JoinColumn({ name: 'event_version_id' })
    eventVersion: EventVersion

    @Column({ name: 'is_input', nullable: true })
    isInput: boolean
}
