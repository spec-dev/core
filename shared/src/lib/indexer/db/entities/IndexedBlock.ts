import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'

export enum IndexedBlockStatus {
    Pending = 0,
    Indexing = 1,
    Complete = 2,
}

/**
 * A block indexed by Spec.
 */
@Entity('indexed_blocks')
@Index(['chainId', 'number'])
export class IndexedBlock {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ name: 'chain_id' })
    @Index()
    chainId: number

    @Column('int8', {
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    number: number

    @Column('varchar', { nullable: true, length: 70 })
    hash: string

    @Column('int2', { default: IndexedBlockStatus.Pending })
    status: IndexedBlockStatus

    @Column({ default: false })
    uncled: boolean

    @Column({ default: false })
    failed: boolean

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
