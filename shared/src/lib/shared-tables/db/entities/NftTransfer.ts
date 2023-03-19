import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { decamelize } from 'humps'
import { NftStandard } from './NftCollection'

/**
 * An NFT tranfer event.
 */
@Entity('nft_transfers', { schema: 'tokens' })
@Index(['transactionHash', 'logIndex', 'transferIndex', 'chainId'], { unique: true })
export class NftTransfer {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'transaction_hash', length: 70 })
    transactionHash: string

    @Column('int8', { name: 'log_index' })
    logIndex: number

    @Column('int8', { name: 'transfer_index' })
    transferIndex: number

    @Column('varchar', { name: 'token_address', length: 50 })
    tokenAddress: string

    @Column('varchar', { name: 'token_name', nullable: true })
    tokenName: string

    @Column('varchar', { name: 'token_symbol', nullable: true })
    tokenSymbol: string

    @Column('varchar', { name: 'token_standard' })
    tokenStandard: NftStandard

    @Column('varchar', { name: 'from_address', length: 50 })
    fromAddress: string

    @Column('varchar', { name: 'to_address', length: 50 })
    toAddress: string

    @Column({ name: 'is_mint' })
    isMint: boolean

    @Column('varchar', { name: 'token_id' })
    tokenId: string

    @Column('varchar')
    value: string

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

export const fullNftTransferUpsertConfig = (transfer: NftTransfer): string[][] => {
    const conflictCols = ['transaction_hash', 'log_index', 'transfer_index', 'chain_id']
    const updateCols = Object.keys(transfer)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
