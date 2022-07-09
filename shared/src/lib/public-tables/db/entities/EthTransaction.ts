import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

/**
 * An Ethereum Transaction
 */
@Entity('transactions', { schema: schemas.ETHEREUM })
export class EthTransaction {
    // Blockchain id.
    @Column('int2', { name: 'chain_id', nullable: false })
    chainId: number

    // Transaction hash.
    @PrimaryColumn('varchar', { nullable: false, length: 70 })
    hash: string

    // Number of transactions sent from address.
    @Column('int8', { nullable: false })
    nonce: number

    // The index of this transaction in this block.
    @Column('int2', { name: 'transaction_index', nullable: false })
    transactionIndex: number

    // Address this transaction was sent from.
    @Column('varchar', { nullable: false, length: 50 })
    from: string

    // Address this transaction was sent to.
    @Column('varchar', { length: 50 })
    to: string
    
    @Column('varchar', { name: 'contract_address', length: 50 })
    contractAddress: string

    // Value transferred in Wei.
    @Column('int8')
    value: number

    // Data sent along with the transaction.
    @Column('varchar')
    input: string
    
    @Column('int2')
    type: number

    // 1 (success) or 0 (failure).
    @Column('int2')
    status: number
    
    // 32 bytes of post-transaction stateroot (pre Byzantium).
    @Column('varchar', { nullable: false, length: 70 })
    root: string
    
    // Gas provided by the sender.
    @Column('int8')
    gas: number

    // Gas price provided by the sender in Wei.
    @Column('int8', { name: 'gas_price' })
    gasPrice: number

    // Total fee that covers both base and priority fees.
    @Column('int8', { name: 'max_fee_per_gas' })
    maxFeePerGas: number

    // Fee given to miners to incentivize them to include the transaction.
    @Column('int8', { name: 'max_priority_fee_per_gas' })
    maxPriorityFeePerGas: number

    // Amount of gas used by this specific transaction alone.
    @Column('int8', { name: 'gas_used' })
    gasUsed: number

    // Total amount of gas used when this transaction was executed in the block.
    @Column('int8', { name: 'cumulative_gas_used' })
    cumulativeGasUsed: number

    // The actual value per gas deducted from the senders account.
    @Column('int8', { name: 'effective_gas_price' })
    effectiveGasPrice: number

    // The hash of the block this transaction was included in.
    @Column('varchar', { name: 'block_hash', nullable: false, length: 70 })
    blockHash: string

    // The number of the block this transaction was included in.
    @Column('int8', { name: 'block_number', nullable: false })
    blockNumber: number

    // Unix timestamp of when this transaction's block was collated.
    @Column('int8', { name: 'block_timestamp', nullable: false })
    blockTimestamp: number
}