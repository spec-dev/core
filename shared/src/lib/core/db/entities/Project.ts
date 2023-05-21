import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    OneToMany,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    DeleteDateColumn,
} from 'typeorm'
import { Namespace } from './Namespace'
import { ProjectRole } from './ProjectRole'
import { Deployment } from './Deployment'
import { StringKeyMap } from '../../../types'

/**
 * A project on Spec within a namespace.
 */
@Entity('projects')
@Index(['namespaceId', 'slug'], { unique: true })
export class Project {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column({ name: 'namespace_id' })
    namespaceId: number

    @Column()
    name: string

    @Column()
    slug: string

    @Index()
    @Column({ name: 'api_key' })
    apiKey: string

    @Index()
    @Column({ name: 'admin_key' })
    adminKey: string

    @Column({ name: 'signed_api_key' })
    signedApiKey: string

    @Column({ name: 'signed_admin_key' })
    signedAdminKey: string

    @Column({ name: 'admin_channel', nullable: true })
    adminChannel: string

    @Column('json', { nullable: true })
    metadata: any

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @DeleteDateColumn({
        type: 'timestamptz',
        name: 'deleted_at',
        nullable: true,
    })
    deletedAt: Date

    @ManyToOne(() => Namespace, (nsp) => nsp.projects)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @OneToMany(() => ProjectRole, (projectRole) => projectRole.project)
    projectRoles: ProjectRole[]

    @OneToMany(() => Deployment, (deployment) => deployment.project)
    deployments: Deployment[]

    memberView(): StringKeyMap {
        return {
            id: this.uid,
            name: this.name,
            slug: this.slug,
            apiKey: this.signedApiKey,
            namespace: this.namespace?.publicView(),
            metadata: this.metadata || {},
        }
    }
}
