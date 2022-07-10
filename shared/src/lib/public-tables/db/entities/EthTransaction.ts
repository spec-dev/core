import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

export enum EthTransactionStatus {
    Failure = 0,
    Success = 1,
}

/**
 * An Ethereum Transaction
 */
@Entity('transactions', { schema: schemas.ETHEREUM })
export class EthTransaction {
    // Blockchain id.
    @Column('int2', { name: 'chain_id' })
    chainId: number

    // Transaction hash.
    @PrimaryColumn('varchar', { length: 70 })
    hash: string

    // Number of transactions sent from address.
    @Column('int8')
    nonce: number

    // The index of this transaction in this block.
    @Column('int2', { name: 'transaction_index' })
    transactionIndex: number

    // Address this transaction was sent from.
    @Column('varchar', { length: 50 })
    from: string

    // Address this transaction was sent to.
    @Column('varchar', { length: 50, nullable: true })
    to: string
    
    @Column('varchar', { name: 'contract_address', length: 50, nullable: true })
    contractAddress: string

    // Value transferred in Wei.
    @Column('int8', { nullable: true })
    value: number

    // Data sent along with the transaction.
    @Column('varchar', { nullable: true })
    input: string
    
    // EIP transaction type.
    @Column('int2', { name: 'transaction_type', nullable: true })
    transactionType: number

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: EthTransactionStatus
    
    // 32 bytes of post-transaction stateroot (pre Byzantium).
    @Column('varchar', { length: 70, nullable: true })
    root: string
    
    // Gas provided by the sender.
    @Column('int8', { nullable: true })
    gas: number

    // Gas price provided by the sender in Wei.
    @Column('int8', { name: 'gas_price', nullable: true })
    gasPrice: number

    // Total fee that covers both base and priority fees.
    @Column('int8', { name: 'max_fee_per_gas', nullable: true })
    maxFeePerGas: number

    // Fee given to miners to incentivize them to include the transaction.
    @Column('int8', { name: 'max_priority_fee_per_gas', nullable: true })
    maxPriorityFeePerGas: number

    // Amount of gas used by this specific transaction alone.
    @Column('int8', { name: 'gas_used', nullable: true })
    gasUsed: number

    // Total amount of gas used when this transaction was executed in the block.
    @Column('int8', { name: 'cumulative_gas_used', nullable: true })
    cumulativeGasUsed: number

    // The actual value per gas deducted from the senders account.
    @Column('int8', { name: 'effective_gas_price', nullable: true })
    effectiveGasPrice: number

    // The hash of the block this transaction was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this transaction was included in.
    @Column('int8', { name: 'block_number' })
    blockNumber: number

    // Unix timestamp of when this transaction's block was collated.
    @Column('timestamp', { name: 'block_timestamp' })
    blockTimestamp: Date

    // Whether this transactions's block was uncled.
    @Column({ default: false })
    uncled: boolean
}