import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { decamelize } from 'humps'

/**
 * An ERC-20 balance owned by a particular address.
 */
@Entity('erc20_balance', { schema: 'tokens' })
@Index(['tokenAddress', 'ownerAddress', 'chainId'], { unique: true })
export class Erc20Balance {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'token_address', length: 50 })
    tokenAddress: string

    @Column('varchar', { name: 'token_name', nullable: true })
    tokenName: string

    @Column('varchar', { name: 'token_symbol', nullable: true })
    tokenSymbol: string

    @Column('int8', { name: 'token_decimals', nullable: true })
    tokenDecimals: number

    @Column('varchar', { name: 'owner_address', length: 50 })
    ownerAddress: string

    @Column('varchar')
    balance: string

    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    @Column('int8', {
        name: 'block_number',
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    blockNumber: number

    @Column('timestamptz', { name: 'block_timestamp' })
    blockTimestamp: Date

    @Column('varchar', { name: 'chain_id' })
    chainId: string
}

export const fullErc20BalanceUpsertConfig = (): string[][] => {
    const conflictCols = ['token_address', 'owner_address', 'chain_id']
    const updateCols = ['balance', 'block_hash', 'block_number', 'block_timestamp']
    return [updateCols, conflictCols]
}
