import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

/**
 * A timestamped token price.
 */
@Entity('token_prices', { schema: 'tokens' })
export class TokenPrice {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'token_address' })
    tokenAddress: string

    @Column('varchar', { name: 'token_name' })
    tokenName: string

    @Column('varchar', { name: 'token_symbol' })
    tokenSymbol: string

    @Column('numeric', { name: 'price_usd' })
    priceUsd: number

    @Column('numeric', { name: 'price_eth' })
    priceEth: number

    @Column('numeric', { name: 'price_matic' })
    priceMatic: number

    @Column('timestamptz')
    timestamp: Date

    @Column('varchar', { name: 'chain_id' })
    chainId: string
}
