import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

export enum NftStandard {
    ERC721 = 'erc721',
    ERC1155 = 'erc1155',
    Unknown = 'unknown',
}

/**
 * An NFT collection (contract).
 */
@Entity('nft_collections', { schema: 'tokens' })
@Index(['address', 'chainId'], { unique: true })
export class NftCollection {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar', { length: 50 })
    address: string

    @Column('varchar', { nullable: true })
    name: string

    @Column('varchar', { nullable: true })
    symbol: string

    @Column('varchar')
    standard: NftStandard

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

export const fullNftCollectionUpsertConfig = (): string[][] => {
    const conflictCols = ['address', 'chain_id']
    const updateCols = ['total_supply', 'last_updated']
    return [updateCols, conflictCols]
}
