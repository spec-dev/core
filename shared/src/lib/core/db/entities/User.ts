import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    OneToMany,
    DeleteDateColumn,
} from 'typeorm'
import { Session } from './Session'
import { NamespaceUser } from './NamespaceUser'
import { StringKeyMap } from '../../../types'

/**
 * A top-level user.
 */
@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Index({ unique: true })
    @Column()
    email: string

    @Column({ name: 'first_name', nullable: true })
    firstName: string

    @Column({ name: 'last_name', nullable: true })
    lastName: string

    @Column({ name: 'hashed_pw', nullable: true })
    hashedPw: string

    @Column({ nullable: true })
    salt: string

    @Column({ name: 'email_verified', default: false })
    emailVerified: boolean

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

    @OneToMany(() => NamespaceUser, (namespaceUser) => namespaceUser.user)
    namespaceUsers: NamespaceUser[]

    @OneToMany(() => Session, (session) => session.user)
    sessions: Session[]

    get name(): string {
        return [this.firstName || '', this.lastName || ''].join(' ').trim()
    }

    selfView(): StringKeyMap {
        return {
            id: this.uid,
            email: this.email,
            firstName: this.firstName,
            lastName: this.lastName,
        }
    }
}
