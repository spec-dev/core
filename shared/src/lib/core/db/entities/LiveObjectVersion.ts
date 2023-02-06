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
import { StringKeyMap } from '../../../types'

export interface LiveObjectVersionProperty {
    name: string
    type: string
    desc: string
    options?: LiveObjectVersionPropertyOptions[]
}

export interface LiveObjectVersionPropertyOptions {
    name: string
    type: string
    value: any
}

export interface LiveObjectVersionConfig {
    folder: string
    primaryTimestampProperty: string
    uniqueBy: string[][]
    table: string
    chains?: StringKeyMap
    tableName?: string
}

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

    @Column()
    url: string

    @Column('json', { nullable: true })
    properties: LiveObjectVersionProperty[]

    @Column('json', { nullable: true })
    example: StringKeyMap

    @Column('json', { nullable: true })
    config: LiveObjectVersionConfig

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
