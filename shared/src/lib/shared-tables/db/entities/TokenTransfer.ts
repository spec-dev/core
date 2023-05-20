import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

export enum TokenTransferStandard {
    ERC20 = 'erc20',
    ERC721 = 'erc721',
    ERC1155 = 'erc1155',
    Unknown = 'unknown',
}

/**
 * A token transfer event.
 */
@Entity('token_transfers', { schema: 'tokens' })
@Index(['transferId'], { unique: true })
export class TokenTransfer {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'transfer_id', length: 70 })
    transferId: string

    @Column('varchar', { name: 'transaction_hash', length: 70, nullable: true })
    transactionHash: string

    @Column('int8', { name: 'log_index', nullable: true })
    logIndex: number

    @Column('varchar', { name: 'token_address', length: 50 })
    tokenAddress: string

    @Column('varchar', { name: 'token_name', nullable: true })
    tokenName: string

    @Column('varchar', { name: 'token_symbol', nullable: true })
    tokenSymbol: string

    @Column('int8', { name: 'token_decimals', nullable: true })
    tokenDecimals: number

    @Column('varchar', { name: 'token_standard', nullable: true })
    tokenStandard: TokenTransferStandard

    @Column('varchar', { name: 'token_id', nullable: true })
    tokenId: string

    @Column('varchar', { name: 'from_address', length: 50 })
    fromAddress: string

    @Column('varchar', { name: 'to_address', length: 50 })
    toAddress: string

    @Column({ name: 'is_mint', nullable: true })
    isMint: boolean

    @Column({ name: 'is_native', nullable: true })
    isNative: boolean

    @Column('varchar', { nullable: true })
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

export const fullTokenTransferUpsertConfig = (): string[][] => {
    const conflictCols = ['transfer_id']
    const updateCols = ['token_standard']
    return [updateCols, conflictCols]
}
