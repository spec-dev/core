import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm'
import { Namespace } from './Namespace'

export enum NamespaceAccessTokenScope {
    RegisterContracts = 'contracts:register',
    PublishLiveObjects = 'live-objects:publish',
    Internal = 'internal',
}

/**
 * A particular version of a live object.
 */
@Entity('namespace_access_tokens')
export class NamespaceAccessToken {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column({ name: 'namespace_id' })
    namespaceId: number

    @ManyToOne(() => Namespace, (nsp) => nsp.namespaceAccessTokens)
    @JoinColumn({ name: 'namespace_id' })
    namespace: Namespace

    // comma separated scopes
    @Column()
    scopes: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'expires_at',
        nullable: true,
    })
    expiresAt: Date
}
