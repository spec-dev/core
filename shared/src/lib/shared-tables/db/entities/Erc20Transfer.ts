import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { decamelize } from 'humps'

/**
 * An ERC-20 token transfer event.
 */
@Entity('erc20_transfers', { schema: 'tokens' })
@Index(['transactionHash', 'logIndex', 'chainId'], { unique: true })
export class Erc20Transfer {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'transaction_hash', length: 70 })
    transactionHash: string

    @Column('int8', { name: 'log_index' })
    logIndex: number

    @Column('varchar', { name: 'token_address', length: })
    tokenAddress: string

    @Column('varchar', { name: 'token_name', nullable: true })
    tokenName: string

    @Column('varchar', { name: 'token_symbol', nullable: true })
    tokenSymbol: string

    @Column('int8', { name: 'token_decimals', nullable: true })
    tokenDecimals: number

    @Column('varchar', { name: 'from_address', length: 50 })
    fromAddress: string

    @Column('varchar', { name: 'to_address', length: 50 })
    toAddress: string

    @Column({ name: 'is_mint' })
    isMint: boolean

    @Column('varchar')
    value: string

    @Column('numeric', { name: 'value_usd', nullable: true })
    valueUsd: number

    @Column('numeric', { name: 'value_eth', nullable: true })
    valueEth: number

    @Column('numeric', { name: 'value_matic', nullable: true })
    valueMatic: number

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

export const fullErc20TransferUpsertConfig = (transfer: Erc20Transfer): string[][] => {
    const conflictCols = ['transaction_hash', 'log_index', 'chain_id']
    const updateCols = Object.keys(transfer)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
