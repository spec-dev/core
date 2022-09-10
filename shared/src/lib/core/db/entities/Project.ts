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
import { Org } from './Org'
import { ProjectRole } from './ProjectRole'
import { Deployment } from './Deployment'
import { StringKeyMap } from '../../../types'

/**
 * A project on Spec within an organization.
 */
@Entity('projects')
@Index(['orgId', 'slug'], { unique: true })
export class Project {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column('int8', { name: 'org_id' })
    orgId: number

    @Column()
    name: string

    @Column()
    slug: string

    @Column({ name: 'api_key' })
    apiKey: string

    @Column({ name: 'admin_key' })
    adminKey: string

    @Column({ name: 'admin_channel', nullable: true })
    adminChannel: string

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

    @ManyToOne(() => Org, (org) => org.projects)
    @JoinColumn({ name: 'org_id' })
    org: Org

    @OneToMany(() => ProjectRole, (projectRole) => projectRole.project)
    projectRoles: ProjectRole[]

    @OneToMany(() => Deployment, (deployment) => deployment.project)
    deployments: Deployment[]

    memberView(): StringKeyMap {
        return {
            id: this.uid,
            name: this.name,
            slug: this.slug,
            apiKey: this.apiKey,
            org: this.org?.publicView(),
        }
    }
}
