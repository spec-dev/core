import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm'
import { LiveObjectVersion } from './LiveObjectVersion'
import { Namespace } from './Namespace'

/**
 * A contract function call that's used as an input to a Live Object Version.
 */
@Entity('live_call_handlers')
@Index(['functionName', 'namespaceId', 'liveObjectVersionId'], { unique: true })
@Index(['functionName', 'namespaceId'])
@Index(['liveObjectVersionId'])
export class LiveCallHandler {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ name: 'function_name' })
    functionName: string

    @Column({ name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.liveCallHandlers)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @Column({ name: 'live_object_version_id' })
    liveObjectVersionId: number

    @ManyToOne(() => LiveObjectVersion, (liveObjectVersion) => liveObjectVersion.liveCallHandlers)
    @JoinColumn({ name: 'live_object_version_id' })
    liveObjectVersion: LiveObjectVersion
}
