import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

/**
 * An ERC-20 token contract.
 */
@Entity('erc20_tokens', { schema: 'tokens' })
@Index(['address', 'chainId'], { unique: true })
export class Erc20Token {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { length: 50 })
    address: string

    @Column('varchar', { nullable: true })
    name: string

    @Column('varchar', { nullable: true })
    symbol: string

    @Column('int8', { nullable: true })
    decimals: number

    @Column('varchar', { name: 'total_supply', nullable: true })
    totalSupply: string

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

    @Column('timestamptz', { name: 'last_updated' })
    lastUpdated: Date

    @Column('varchar', { name: 'chain_id' })
    chainId: string
}

export const fullErc20TokenUpsertConfig = (): string[][] => {
    const conflictCols = ['address', 'chain_id']
    const updateCols = ['total_supply', 'last_updated']
    return [updateCols, conflictCols]
}
