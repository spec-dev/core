import { Entity, PrimaryColumn, Column, Index } from 'typeorm'
import schemas from '../../schemas'

export enum EthAddressInteractionType {
    WalletToContract = 'wallet:contract',
    WalletToWallet = 'wallet:wallet',
    ContractToWallet = 'contract:wallet',
    ContractToContract = 'contract:contract',
}

/**
 * The most recent unique interaction between 2 eth addresses.
 */
@Entity('latest_interactions', { schema: schemas.ETHEREUM })
export class EthLatestInteraction {
    @PrimaryColumn('varchar', { length: 50 })
    from: string

    @PrimaryColumn('varchar', { length: 50 })
    to: string

    @Column('varchar', { name: 'interaction_type', length: 20 })
    interactionType: EthAddressInteractionType

    @Column('varchar', { length: 70 })
    hash: string

    @Column('timestamptz', { name: 'timestamp' })
    timestamp: Date

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
}