import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

export enum EthReceiptStatus {
    Failure = 0,
    Success = 1,
}

@Entity('receipts', { schema: schemas.ETHEREUM })
export class EthReceipt {
    // Transaction hash.
    @PrimaryColumn('varchar', { length: 70 })
    hash: string

    // The contract address created, if the transaction was a contract creation, otherwise null.
    @Column('varchar', { name: 'contract_address', length: 50, nullable: true })
    contractAddress: string

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: EthReceiptStatus

    // 32 bytes of post-transaction stateroot (pre Byzantium).
    @Column('varchar', { length: 70, nullable: true })
    root: string

    // Amount of gas used by this specific transaction alone.
    @Column('varchar', { name: 'gas_used', length: 40, nullable: true })
    gasUsed: string

    // Total amount of gas used when this transaction was executed in the block.
    @Column('varchar', { name: 'cumulative_gas_used', length: 40, nullable: true })
    cumulativeGasUsed: string

    // The actual value per gas deducted from the senders account.
    @Column('varchar', { name: 'effective_gas_price', length: 40, nullable: true })
    effectiveGasPrice: string
}

export const fullReceiptUpsertConfig = (receipt: EthReceipt): string[][] => {
    const conflictCols = ['hash']
    const updateCols = Object.keys(receipt)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
