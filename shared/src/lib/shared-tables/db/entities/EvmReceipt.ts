import { Entity, PrimaryColumn, Column } from 'typeorm'
import { currentChainSchema } from '../../../utils/chainIds'

@Entity('receipts', { schema: currentChainSchema() })
export class EvmReceipt {
    // This log's transaction hash.
    @PrimaryColumn('varchar', { name: 'transaction_hash', length: 70 })
    transactionHash: string

    // The contract address created, if the transaction was a contract creation, otherwise null.
    @Column('varchar', { name: 'contract_address', length: 50, nullable: true })
    contractAddress: string

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: number

    // 32 bytes of post-transaction stateroot (pre Byzantium).
    @Column('varchar', { length: 70, nullable: true })
    root: string

    // Amount of gas used by this specific transaction alone.
    @Column('varchar', { name: 'gas_used', nullable: true })
    gasUsed: string

    // Total amount of gas used when this transaction was executed in the block.
    @Column('varchar', { name: 'cumulative_gas_used', nullable: true })
    cumulativeGasUsed: string

    // The actual value per gas deducted from the senders account.
    @Column('varchar', { name: 'effective_gas_price', nullable: true })
    effectiveGasPrice: string
}
