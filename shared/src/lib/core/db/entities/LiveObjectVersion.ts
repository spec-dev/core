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
import { LiveEventVersion } from './LiveEventVersion'
import { LiveObject } from './LiveObject'
import { StringKeyMap } from '../../../types'
import { LiveCallHandler } from './LiveCallHandler'
import { toNamespacedVersion } from '../../../utils/formatters'

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
    isContractFactory?: boolean
}

export enum LiveObjectVersionStatus {
    Indexing = 0,
    Live = 1,
    Failing = 2,
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

    // Denormalized namespace name for quicker lookups.
    @Column()
    nsp: string

    @Column()
    name: string

    @Column()
    version: string

    @Column({ nullable: true })
    url: string

    @Column('int2', { nullable: true })
    status: LiveObjectVersionStatus

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

    @UpdateDateColumn({
        type: 'timestamptz',
        name: 'updated_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
        onUpdate: `CURRENT_TIMESTAMP at time zone 'UTC'`,
        nullable: true,
    })
    updatedAt: Date

    @Column({ name: 'live_object_id' })
    liveObjectId: number

    @ManyToOne(() => LiveObject, (liveObject) => liveObject.liveObjectVersions)
    @JoinColumn({ name: 'live_object_id' })
    liveObject: LiveObject

    @OneToMany(() => LiveEventVersion, (liveEventVersion) => liveEventVersion.liveObjectVersion)
    liveEventVersions: LiveEventVersion[]

    @OneToMany(() => LiveCallHandler, (liveCallHandler) => liveCallHandler.liveObjectVersion)
    liveCallHandlers: LiveCallHandler[]

    publicView(): StringKeyMap {
        return {
            id: this.uid,
            name: toNamespacedVersion(this.nsp, this.name, this.version),
            properties: this.properties || [],
            primaryTimestampProperty: this.config?.primaryTimestampProperty,
            uniqueBy: (this.config?.uniqueBy || [])[0] || [],
            createdAt: this.createdAt,
        }
    }
}
