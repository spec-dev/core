import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    DeleteDateColumn,
} from 'typeorm'
import { Project } from './Project'
import { NamespaceUser } from './NamespaceUser'

export enum ProjectRoleName {
    Owner = 'owner',
    Admin = 'admin',
    Member = 'member',
}

/**
 * The role a particular NamespaceUser has within a Project.
 */
@Entity('project_roles')
@Index(['projectId', 'namespaceUserId'], { unique: true })
export class ProjectRole {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ name: 'project_id' })
    projectId: number

    @Column({ name: 'namespace_user_id' })
    namespaceUserId: number

    @Column('varchar')
    role: ProjectRoleName

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

    @ManyToOne(() => Project, (project) => project.projectRoles)
    @JoinColumn({ name: 'project_id' })
    project: Project

    @ManyToOne(() => NamespaceUser, (namespaceUser) => namespaceUser.projectRoles)
    @JoinColumn({ name: 'namespace_user_id' })
    namespaceUser: NamespaceUser
}
