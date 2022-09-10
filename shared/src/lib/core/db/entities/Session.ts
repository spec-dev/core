import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm'
import { User } from './User'

/**
 * A User auth session.
 */
@Entity('sessions')
export class Session {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column('int8', { name: 'user_id' })
    userId: number

    @Index()
    @Column()
    token: string

    @Column()
    salt: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'expiration_date',
    })
    expirationDate: Date

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @ManyToOne(() => User, (user) => user.sessions)
    @JoinColumn({ name: 'user_id' })
    user: User
}
