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
import { OrgUser } from './OrgUser'

/**
 * The role a particular OrgUser has within a Project.
 */
@Entity('project_roles')
@Index(['projectId', 'orgUserId'], { unique: true })
export class ProjectRole {
    @PrimaryGeneratedColumn()
    id: number

    @Column('int8', { name: 'project_id' })
    projectId: number

    @Column('int8', { name: 'org_user_id' })
    orgUserId: number

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

    @ManyToOne(() => OrgUser, (orgUser) => orgUser.projectRoles)
    @JoinColumn({ name: 'org_user_id' })
    orgUser: OrgUser
}

export enum ProjectRoleName {
    Owner = 'owner',
    Admin = 'admin',
    member = 'member',
}
