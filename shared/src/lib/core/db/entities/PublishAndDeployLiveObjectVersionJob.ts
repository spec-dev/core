import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'
import { StringKeyMap } from '../../../types'

export enum PublishAndDeployLiveObjectVersionJobStatus {
    Created = 'created',
    Migrating = 'migrating',
    Publishing = 'publishing',
    Indexing = 'indexing',
    Complete = 'complete',
}

/**
 * Publish job for live object deployment.
 */
@Entity('publish_and_deploy_live_object_version_jobs')
export class PublishAndDeployLiveObjectVersionJob {
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
    folder: string

    @Column()
    version: string

    @Column('varchar')
    status: PublishAndDeployLiveObjectVersionJobStatus

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'cursor',
        nullable: true,
    })
    cursor: Date

    @Column('json', { nullable: true })
    metadata: StringKeyMap

    @Column({ default: false })
    failed: boolean

    @Column('text', { nullable: true })
    error: string

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
    })
    updatedAt: Date

    view() {
        return {
            uid: this.uid,
            nsp: this.nsp,
            name: this.name,
            version: this.version,
            status: this.status,
            cursor: this.cursor?.toISOString(),
            metadata: this.metadata || {},
            failed: this.failed,
            error: this.error,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        }
    }
}
