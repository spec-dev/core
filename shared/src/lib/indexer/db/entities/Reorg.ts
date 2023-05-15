import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'
import { StringKeyMap } from '../../../types'

export enum ReorgStatus {
    New = 'new',
    Waiting = 'waiting',
    RollingBack = 'rolling-back',
    Publishing = 'publishing',
    Replaced = 'replaced',
    Complete = 'complete',
}

/**
 * A chain reorg.
 */
@Entity('reorgs')
@Index(['chainId', 'fromNumber'])
export class Reorg {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column({ name: 'chain_id' })
    @Index()
    chainId: string

    @Column('int8', { name: 'from_number' })
    fromNumber: number

    @Column('int8', { name: 'to_number' })
    toNumber: number

    @Column('varchar', { default: ReorgStatus.New })
    @Index()
    status: ReorgStatus

    @Column('json', { nullable: true })
    stats: StringKeyMap

    @Column({ default: false })
    @Index()
    failed: boolean

    @Column('text', { nullable: true })
    error: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @UpdateDateColumn({
        type: 'timestamptz',
        name: 'updated_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
        onUpdate: `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    updatedAt: Date
}
