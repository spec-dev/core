import { Entity, PrimaryColumn, Column, Index } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

/**
 * An Ethereum Contract
 */
@Entity('contracts', { schema: schemas.ETHEREUM })
export class EthContract {
    // Contract address.
    @PrimaryColumn('varchar', { length: 50 })
    address: string

    // The bytecode of the contract.
    @Column('varchar', { nullable: true })
    bytecode: string

    // The hash of the block this transaction was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this transaction was included in.
    @Index()
    @Column('int8', { name: 'block_number' })
    blockNumber: number

    // Unix timestamp of when this transaction's block was collated.
    @Column('timestamp', { name: 'block_timestamp' })
    blockTimestamp: Date
}

export const fullContractUpsertConfig = (contract: EthContract): string[][] => {
    const conflictCols = ['address']
    const updateCols = Object.keys(contract)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
