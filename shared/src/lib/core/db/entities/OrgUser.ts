import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany, ManyToOne, JoinColumn, CreateDateColumn, DeleteDateColumn } from 'typeorm'
import { Org } from './Org'
import { User } from './User'
import { ProjectRole } from './ProjectRole'

/**
 * A user who is a member of an organization.
 */
@Entity('org_users')
@Index(['orgId', 'userId'], { unique: true })
export class OrgUser {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column('int8', { name: 'org_id' })
    orgId: number

    @Column('int8', { name: 'user_id' })
    userId: number

    @Column('varchar')
    role: OrgUserRole

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

    @ManyToOne(() => Org, (org) => org.orgUsers)
    @JoinColumn({ name: 'org_id' })
    org: Org

    @ManyToOne(() => User, (user) => user.orgUsers)
    @JoinColumn({ name: 'user_id' })
    user: User

    @OneToMany(() => ProjectRole, (projectRole) => projectRole.orgUser)
    projectRoles: ProjectRole[]
}

export enum OrgUserRole {
    Owner = 'owner',
    Admin = 'admin',
    member = 'member',
}