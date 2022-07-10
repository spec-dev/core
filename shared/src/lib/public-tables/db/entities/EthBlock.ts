import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

/**
 * An Ethereum Block
 */
@Entity('blocks', { schema: schemas.ETHEREUM })
export class EthBlock {
    @Column('int2', { name: 'chain_id' })
    chainId: number

    // Block number.
    @Column('int8')
    number: number

    // Block hash.
    @PrimaryColumn('varchar', { length: 70 })
    hash: string

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
    @Column('int8', { nullable: true })
    difficulty: number

    // Total difficulty of the chain until this block.
    @Column('int8', { name: 'total_difficulty', nullable: true })
    totalDifficulty: number

    // Size of this block in bytes.
    @Column('int8', { nullable: true })
    size: number

    // Optional, arbitrary extra data included in the block.
    @Column('varchar', { name: 'extra_data', nullable: true })
    extraData: string

    // Maximum gas allowed in this block.
    @Column('int8', { name: 'gas_limit', nullable: true })
    gasLimit: number

    // Total used gas by all transactions in this block.
    @Column('int8', { name: 'gas_used', nullable: true })
    gasUsed: number

    // The market price for gas.
    @Column('int8', { name: 'base_fee_per_gas', nullable: true })
    baseFeePerGas: number

    // Number of transactions included in this block.
    @Column('int2', { name: 'transaction_count' })
    transactionCount: number

    // Unix timestamp of when this block was collated.
    @Column('timestamp')
    timestamp: Date

    // Whether this block was uncled by another.
    @Column({ default: false })
    uncled: boolean
}