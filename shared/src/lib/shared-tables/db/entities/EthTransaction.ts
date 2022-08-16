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

    // The contract address created, if the transaction was a contract creation, otherwise null.
    @Column('varchar', { name: 'contract_address', length: 50, nullable: true })
    contractAddress: string

    // Value transferred in Wei.
    @Column('varchar', { nullable: true, length: 40 })
    value: string

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
    @Column('varchar', { length: 40, nullable: true })
    gas: string

    // Gas price provided by the sender in Wei.
    @Column('varchar', { name: 'gas_price', length: 40, nullable: true })
    gasPrice: string

    // Total fee that covers both base and priority fees.
    @Column('varchar', { name: 'max_fee_per_gas', length: 40, nullable: true })
    maxFeePerGas: string

    // Fee given to miners to incentivize them to include the transaction.
    @Column('varchar', { name: 'max_priority_fee_per_gas', length: 40, nullable: true })
    maxPriorityFeePerGas: string

    // Amount of gas used by this specific transaction alone.
    @Column('varchar', { name: 'gas_used', length: 40, nullable: true })
    gasUsed: string

    // Total amount of gas used when this transaction was executed in the block.
    @Column('varchar', { name: 'cumulative_gas_used', length: 40, nullable: true })
    cumulativeGasUsed: string

    // The actual value per gas deducted from the senders account.
    @Column('varchar', { name: 'effective_gas_price', length: 40, nullable: true })
    effectiveGasPrice: string

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
