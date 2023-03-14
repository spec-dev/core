import { Entity, PrimaryColumn, Column, Index } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

/**
 * An Ethereum Block
 */
@Entity('blocks', { schema: schemas.ethereum() })
export class EthBlock {
    // Block hash.
    @PrimaryColumn('varchar', { length: 70 })
    hash: string

    // Block number.
    @Index({ unique: true })
    @Column('int8', {
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    number: number

    // Block's parent's hash.
    @Column('varchar', { name: 'parent_hash', length: 70, nullable: true })
    parentHash: string

    // Hash of the generated proof-of-work.
    @Column('varchar', { length: 20 })
    nonce: string

    // Sha3 of the uncles data in the block.
    @Column('varchar', { name: 'sha3_uncles', length: 70, nullable: true })
    sha3Uncles: string

    // Bloom filter for the logs of the block.
    @Column('varchar', { name: 'logs_bloom', nullable: true })
    logsBloom: string

    // Root of the transaction trie of the block.
    @Column('varchar', { name: 'transactions_root', length: 70, nullable: true })
    transactionsRoot: string

    // Root of the final state trie of the block.
    @Column('varchar', { name: 'state_root', length: 70, nullable: true })
    stateRoot: string

    // Root of the receipts trie of the block.
    @Column('varchar', { name: 'receipts_root', length: 70, nullable: true })
    receiptsRoot: string

    // Address of the beneficiary to whom the mining rewards were given.
    @Column('varchar', { length: 50, nullable: true })
    miner: string

    // Difficulty for this block.
    @Column('varchar', { nullable: true })
    difficulty: string

    // Total difficulty of the chain until this block.
    @Column('varchar', { name: 'total_difficulty', nullable: true })
    totalDifficulty: string

    // Size of this block in bytes.
    @Column('int8', { nullable: true })
    size: number

    // Optional, arbitrary extra data included in the block.
    @Column('varchar', { name: 'extra_data', nullable: true })
    extraData: string

    // Maximum gas allowed in this block.
    @Column('varchar', { name: 'gas_limit', length: 70, nullable: true })
    gasLimit: string

    // Total used gas by all transactions in this block.
    @Column('varchar', { name: 'gas_used', length: 70, nullable: true })
    gasUsed: string

    // The market price for gas.
    @Column('varchar', { name: 'base_fee_per_gas', length: 70, nullable: true })
    baseFeePerGas: string

    // Number of transactions included in this block.
    @Column({ name: 'transaction_count' })
    transactionCount: number

    // Timestamp of when this block was collated.
    @Column('timestamptz')
    timestamp: Date
}

export const fullBlockUpsertConfig = (block: EthBlock): string[][] => {
    const conflictCols = ['number']
    const updateCols = Object.keys(block)
        .map(decamelize)
        .filter((col) => col !== 'hash' && !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
