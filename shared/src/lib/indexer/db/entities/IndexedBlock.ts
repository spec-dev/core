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
export class IndexedBlock {
    @PrimaryGeneratedColumn()
    id: number

    @Column('int2', { name: 'chain_id' })
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
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @UpdateDateColumn({
        type: 'timestamp with time zone',
        name: 'updated_at',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
    })
    updatedAt: Date
}
