import { StringKeyMap, logger } from '../../../../shared'
import { SharedTables } from '../../../../shared/src'
import { publishEventSpecs } from '../relay'

export async function onIvyWalletCreatedContractEvent(eventSpec: StringKeyMap) {
    // Get smart wallet contract and owner addresses from received event data.
    const { data, origin } = eventSpec
    const contractAddress = data.smartWallet
    const ownerAddress = data.owner
    if (!contractAddress || !ownerAddress) return

    // Get the rest of the needed data from the event origin.
    const {
        chainId,
        transactionHash,
        blockNumber,
        blockHash,
        blockTimestamp,
    } = origin

    // Create the smart wallet live object.
    const smartWallet = {
        chainId,
        contractAddress,
        ownerAddress,
        transactionHash,
        blockNumber,
        blockHash,
        blockTimestamp,
    }

    // Upsert the smart wallet record.
    try {
        await SharedTables.query(`INSERT INTO ivy.smart_wallets (chain_id, contract_address, owner_address, transaction_hash, block_number, block_hash, block_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (chain_id, contract_address, owner_address) DO UPDATE SET transaction_hash = EXCLUDED.transaction_hash, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
            [
                smartWallet.chainId,
                smartWallet.contractAddress,
                smartWallet.ownerAddress,
                smartWallet.transactionHash,
                smartWallet.blockNumber,
                smartWallet.blockHash,
                smartWallet.blockTimestamp,
            ]
        )
    } catch (err) {
        logger.error(err)
        return
    }

    // Publish new ivy.NewSmartWallet event.
    await publishEventSpecs([{
        name: 'polygon:ivy.NewSmartWallet@0.0.1',
        data: smartWallet,
        origin: origin,
    }])
}