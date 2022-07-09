import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

/**
 * An Ethereum Block
 */
@Entity('blocks', { schema: schemas.ETHEREUM })
export class EthBlock {
    @Column('int2', { name: 'chain_id', nullable: false })
    chainId: number

    // Block number.
    @Column('int8', { nullable: false })
    number: number

    // Block hash.
    @PrimaryColumn('varchar', { nullable: false, length: 70 })
    hash: string

    // Block's parent's hash.
    @Column('varchar', { name: 'parent_hash', length: 70 })
    parentHash: string

    // Hash of the generated proof-of-work.
    @Column('varchar', { nullable: false, length: 20 })
    nonce: string

    // Sha3 of the uncles data in the block.
    @Column('varchar', { name: 'sha3_uncles', length: 70 })
    sha3Uncles: string

    // Bloom filter for the logs of the block.
    @Column('varchar', { name: 'logs_bloom' })
    logsBloom: string

    // Root of the transaction trie of the block.
    @Column('varchar', { name: 'transactions_root', length: 70 })
    transactionsRoot: string

    // Root of the final state trie of the block.
    @Column('varchar', { name: 'state_root', length: 70 })
    stateRoot: string

    // Root of the receipts trie of the block.
    @Column('varchar', { name: 'receipts_root', length: 70 })
    receiptsRoot: string
    
    // Address of the beneficiary to whom the mining rewards were given.
    @Column('varchar', { length: 50 })
    miner: string
    
    // Difficulty for this block.
    @Column('int8')
    difficulty: number

    // Total difficulty of the chain until this block.
    @Column('int8', { name: 'total_difficulty' })
    totalDifficulty: number

    // Size of this block in bytes.
    @Column('int8')
    size: number

    // Optional, arbitrary extra data included in the block.
    @Column('varchar', { name: 'extra_data' })
    extraData: string

    // Maximum gas allowed in this block.
    @Column('int8', { name: 'gas_limit' })
    gasLimit: number

    // Total used gas by all transactions in this block.
    @Column('int8', { name: 'gas_used' })
    gasUsed: number

    // The market price for gas.
    @Column('int8', { name: 'base_fee_per_gas' })
    baseFeePerGas: number

    // Number of transactions included in this block.
    @Column('int2', { name: 'transaction_count', nullable: false })
    transactionCount: number

    // Unix timestamp of when this block was collated.
    @Column('timestamp', { nullable: false })
    timestamp: Date

    // Whether this block was uncled by another.
    @Column({ default: false, nullable: false })
    uncled: boolean
}