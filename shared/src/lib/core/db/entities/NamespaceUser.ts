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
import { User } from './User'
import { ProjectRole } from './ProjectRole'

export enum NamespaceUserRole {
    Owner = 'owner',
    Admin = 'admin',
    member = 'member',
}

/**
 * A user who is a member of an namespace.
 */
@Entity('namespace_users')
@Index(['namespaceId', 'userId'], { unique: true })
export class NamespaceUser {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column({ name: 'namespace_id' })
    namespaceId: number

    @Column({ name: 'user_id' })
    userId: number

    @Column('varchar')
    role: NamespaceUserRole

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

    @ManyToOne(() => Namespace, (nsp) => nsp.namespaceUsers)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    @ManyToOne(() => User, (user) => user.namespaceUsers)
    @JoinColumn({ name: 'user_id' })
    user: User

    @OneToMany(() => ProjectRole, (projectRole) => projectRole.namespaceUser)
    projectRoles: ProjectRole[]
}
