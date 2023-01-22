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
import { LiveObjectVersion } from './LiveObjectVersion'

/**
 * Web3 data models that auto-populate and auto-update.
 */
@Entity('live_objects')
@Unique(['namespaceId', 'name'])
export class LiveObject {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    name: string

    @Column({ name: 'display_name', nullable: true })
    displayName: string

    @Column()
    desc: string

    @Column({ name: 'has_icon', nullable: true })
    hasIcon: boolean

    @Column('int8', { name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.liveObjects)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @OneToMany(() => LiveObjectVersion, (liveObjectVersion) => liveObjectVersion.liveObject)
    liveObjectVersions: LiveObjectVersion[]
}
