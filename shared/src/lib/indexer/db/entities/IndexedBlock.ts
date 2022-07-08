import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'

export enum IndexedBlockStatus {
    Pending,
}

@Entity('indexed_blocks')
export class IndexedBlock {
    @PrimaryGeneratedColumn()
    id: number

    @Column('int2', { name: 'chain_id', nullable: false })
    @Index()
    chainId: number

    @Column('int8', { name: 'block_number', nullable: false })
    blockNumber: number

    @Column('int2', { default: IndexedBlockStatus.Pending, nullable: false })
    status: number

    @Column({ default: false, nullable: false })
    uncled: boolean

    @Column({ default: false, nullable: false })
    failed: boolean

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
        nullable: false,
    })
    createdAt: Date

    @UpdateDateColumn({
        type: 'timestamp with time zone',
        name: 'updated_at',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
        nullable: false,
    })
    updatedAt: Date
}
