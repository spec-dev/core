import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'

export enum IndexedBlockStatus {
    Pending = 0
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

    @Column('int8', { name: 'block_number' })
    blockNumber: number

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
