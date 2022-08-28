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
import { LiveEventVersion } from './LiveEventVersion'
import { LiveEdgeFunctionVersion } from './LiveEdgeFunctionVersion'
import { LiveObject } from './LiveObject'

/**
 * A particular version of a live object.
 */
@Entity('live_object_versions')
@Index(['nsp', 'name', 'version'], { unique: true })
export class LiveObjectVersion {
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
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @Column('int8', { name: 'live_object_id' })
    liveObjectId: number

    @ManyToOne(() => LiveObject, (liveObject) => liveObject.liveObjectVersions)
    @JoinColumn({ name: 'live_object_id' })
    liveObject: LiveObject

    @OneToMany(() => LiveEventVersion, (liveEventVersion) => liveEventVersion.liveObjectVersion)
    liveEventVersions: LiveEventVersion[]

    @OneToMany(
        () => LiveEdgeFunctionVersion,
        (liveEdgeFunctionVersion) => liveEdgeFunctionVersion.liveObjectVersion
    )
    liveEdgeFunctionVersions: LiveEdgeFunctionVersion[]
}
