import { Entity, PrimaryColumn, Column, Index } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

export enum EthTransactionStatus {
    Failure = 0,
    Success = 1,
}

/**
 * An Ethereum Transaction
 */
@Entity('transactions', { schema: schemas.ethereum() })
export class EthTransaction {
    // Transaction hash.
    @PrimaryColumn('varchar', { length: 70 })
    hash: string

    // Number of transactions sent from address.
    @Column('int8')
    nonce: number

    // The index of this transaction in this block.
    @Column({ name: 'transaction_index' })
    transactionIndex: number

    // Address this transaction was sent from.
    @Column('varchar', { length: 50, nullable: true })
    from: string

    // Address this transaction was sent to.
    @Column('varchar', { length: 50, nullable: true })
    to: string

    // The contract address created, if the transaction was a contract creation, otherwise null.
    @Column('varchar', { name: 'contract_address', length: 50, nullable: true })
    contractAddress: string

    // Value transferred in Wei.
    @Column('varchar', { nullable: true, length: 70 })
    value: string

    // Data sent along with the transaction.
    @Column('varchar', { nullable: true })
    input: string

    // Name of the contract function executed.
    @Column('varchar', { name: 'function_name', nullable: true })
    functionName: string

    // Arguments provided to the contract function.
    @Column('json', { name: 'function_args', nullable: true })
    functionArgs: object[]

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
    @Column('varchar', { length: 70, nullable: true })
    gas: string

    // Gas price provided by the sender in Wei.
    @Column('varchar', { name: 'gas_price', length: 70, nullable: true })
    gasPrice: string

    // Total fee that covers both base and priority fees.
    @Column('varchar', { name: 'max_fee_per_gas', length: 70, nullable: true })
    maxFeePerGas: string

    // Fee given to miners to incentivize them to include the transaction.
    @Column('varchar', { name: 'max_priority_fee_per_gas', length: 70, nullable: true })
    maxPriorityFeePerGas: string

    // Amount of gas used by this specific transaction alone.
    @Column('varchar', { name: 'gas_used', length: 70, nullable: true })
    gasUsed: string

    // Total amount of gas used when this transaction was executed in the block.
    @Column('varchar', { name: 'cumulative_gas_used', length: 70, nullable: true })
    cumulativeGasUsed: string

    // The actual value per gas deducted from the senders account.
    @Column('varchar', { name: 'effective_gas_price', length: 70, nullable: true })
    effectiveGasPrice: string

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

    // Timestamp of when this transaction's block was collated.
    @Column('timestamptz', { name: 'block_timestamp' })
    blockTimestamp: Date
}

export const fullTransactionUpsertConfig = (transaction: EthTransaction): string[][] => {
    const conflictCols = ['hash']
    const updateCols = Object.keys(transaction)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
