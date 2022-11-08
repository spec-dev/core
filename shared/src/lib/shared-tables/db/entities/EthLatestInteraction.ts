import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

export enum EthLatestInteractionAddressCategory {
    Wallet = 'wallet',
    Contract = 'contract',
}

export enum EthLatestInteractionType {
    WalletToContract = 'wallet:contract',
    WalletToWallet = 'wallet:wallet',
    ContractToWallet = 'contract:wallet',
    ContractToContract = 'contract:contract',
}

/**
 * Represents the latest "interaction" between 2 ethereum addresses.
 */
@Entity('latest_interactions', { schema: schemas.ETHEREUM })
export class EthLatestInteraction {
    // Address this transaction or trace was sent from.
    @PrimaryColumn('varchar', { length: 50 })
    from: string

    // Address this transaction or trace was sent to.
    @PrimaryColumn('varchar', { length: 50 })
    to: string

    // Specifies whether the sender or recipient is a wallet or a contract.
    @Column('varchar', { name: 'interaction_type', length: 20 })
    interactionType: EthLatestInteractionType

    // The transaction or trace hash.
    @Column('varchar', { length: 70 })
    hash: string

    // Timestamp of when this interaction occurred (i.e. block timestamp).
    @Column('timestamptz', { name: 'timestamp' })
    timestamp: Date

    // The hash of the block this interaction occurred in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this interaction occurred in.
    @Column('int8', {
        name: 'block_number',
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    blockNumber: number
}

export const fullLatestInteractionUpsertConfig = (
    latestInteraction: EthLatestInteraction
): string[][] => {
    const conflictCols = ['from', 'to']
    const updateCols = Object.keys(latestInteraction)
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
