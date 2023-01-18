import { Entity, PrimaryColumn, Column } from 'typeorm'
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

    // Whether this contract subscribes to the ERC-20 standard.
    @Column('boolean', { name: 'is_erc20', nullable: true })
    isERC20: boolean

    // Whether this contract subscribes to the ERC-721 standard.
    @Column('boolean', { name: 'is_erc721', nullable: true })
    isERC721: boolean

    // Whether this contract subscribes to the ERC-1155 standard.
    @Column('boolean', { name: 'is_erc1155', nullable: true })
    isERC1155: boolean

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

export const fullContractUpsertConfig = (contract: EthContract): string[][] => {
    const conflictCols = ['address']
    const updateCols = Object.keys(contract)
        .map((key) => {
            if (key === 'isERC20') return 'is_erc20'
            if (key === 'isERC721') return 'is_erc721'
            if (key === 'isERC1155') return 'is_erc1155'
            return decamelize(key)
        })
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
