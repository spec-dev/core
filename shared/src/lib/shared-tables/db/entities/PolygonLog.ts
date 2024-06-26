import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

/**
 * A Polygon Log
 */
@Entity('logs', { schema: schemas.polygon() })
export class PolygonLog {
    // The index of this log in the transaction receipt.
    @PrimaryColumn('int8', { name: 'log_index' })
    logIndex: number

    // This log's transaction hash.
    @PrimaryColumn('varchar', { name: 'transaction_hash', length: 70 })
    transactionHash: string

    // The index of this log's transaction in this block.
    @Column({ name: 'transaction_index' })
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

    // Name of the contract event associated with this log.
    @Column('varchar', { name: 'event_name', nullable: true })
    eventName: string

    // Arguments provided to the contract event.
    @Column('json', { name: 'event_args', nullable: true })
    eventArgs: object[]

    // The hash of the block this transaction was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this transaction was included in.
    @Column('int8', {
        name: 'block_number',
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    blockNumber: number

    // Timestamp of when this log's block was collated.
    @Column('timestamptz', { name: 'block_timestamp' })
    blockTimestamp: Date
}

export const fullLogUpsertConfig = (log: PolygonLog): string[][] => {
    const conflictCols = ['log_index', 'transaction_hash']
    const updateCols = Object.keys(log)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
