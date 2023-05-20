import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { decamelize } from 'humps'
import { NftStandard } from './NftCollection'

/**
 * An NFT asset within a collection owned by a particular address.
 */
@Entity('nft_balance', { schema: 'tokens' })
@Index(['tokenAddress', 'tokenId', 'ownerAddress', 'chainId'], { unique: true })
export class NftBalance {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { name: 'token_address', length: 50 })
    tokenAddress: string

    @Column('varchar', { name: 'token_name', nullable: true })
    tokenName: string

    @Column('varchar', { name: 'token_symbol', nullable: true })
    tokenSymbol: string

    @Column('varchar', { name: 'token_standard' })
    tokenStandard: NftStandard

    @Column('varchar', { name: 'token_id' })
    tokenId: string

    @Column('varchar', { name: 'owner_address', length: 50 })
    ownerAddress: string

    @Column('varchar')
    balance: string

    @Column('varchar', { nullable: true })
    title: string

    @Column('varchar', { nullable: true })
    description: string

    @Column('varchar', { name: 'token_uri', nullable: true })
    tokenUri: string

    @Column('varchar', { name: 'image_uri', nullable: true })
    imageUri: string

    @Column('varchar', { name: 'image_format', nullable: true })
    imageFormat: string

    @Column('json', { nullable: true })
    attributes: any

    @Column('json', { nullable: true })
    metadata: any

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

export const fullNftBalanceUpsertConfig = (nftBalance: NftBalance): string[][] => {
    const conflictCols = ['token_address', 'token_id', 'owner_address', 'chain_id']
    const updateCols = Object.keys(nftBalance)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
