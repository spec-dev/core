import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

/**
 * An Ethereum Log
 */
@Entity('logs', { schema: schemas.ETHEREUM })
export class EthLog {
    // The index of this log in the transaction receipt.
    @PrimaryColumn('int8', { name: 'log_index' })
    logIndex: number

    // This log's transaction hash.
    @PrimaryColumn('varchar', { name: 'transaction_hash', length: 70 })
    transactionHash: string

    // The index of this log's transaction in this block.
    @Column('int2', { name: 'transaction_index' })
    transactionIndex: number

    // Address from which this log originated.
    @Column('varchar', { length: 50, nullable: true })
    address: string

    // Log arguments.
    @Column('varchar', { nullable: true })
    data: string

    // Data Topic at index 0.
    @Column('varchar', { nullable: true })
    topic0: string

    // Data Topic at index 1.
    @Column('varchar', { nullable: true })
    topic1: string

    // Data Topic at index 2.
    @Column('varchar', { nullable: true })
    topic2: string

    // Data Topic at index 3.
    @Column('varchar', { nullable: true })
    topic3: string

    // The hash of the block this transaction was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this transaction was included in.
    @Column('int8', { name: 'block_number' })
    blockNumber: number

    // Unix timestamp of when this transaction's block was collated.
    @Column('timestamp', { name: 'block_timestamp' })
    blockTimestamp: Date
}
