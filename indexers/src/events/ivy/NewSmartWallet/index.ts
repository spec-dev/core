import { StringKeyMap, logger, ChainTables } from '../../../../../shared'

const eventName = 'ivy.NewSmartWallet@0.0.1'

async function NewSmartWallet(eventSpec: StringKeyMap): Promise<StringKeyMap | null> {
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
        contractAddress,
        ownerAddress,
        transactionHash,
        blockNumber,
        blockHash,
        blockTimestamp,
        chainId,
    }

    // Upsert the smart wallet record.
    try {
        await ChainTables.query(null, `INSERT INTO ivy.smart_wallets (contract_address, owner_address, transaction_hash, block_number, block_hash, block_timestamp, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (contract_address, chain_id) DO UPDATE SET owner_address = EXCLUDED.owner_address, transaction_hash = EXCLUDED.transaction_hash, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
            [
                smartWallet.contractAddress,
                smartWallet.ownerAddress,
                smartWallet.transactionHash,
                smartWallet.blockNumber,
                smartWallet.blockHash,
                smartWallet.blockTimestamp,
                smartWallet.chainId,
            ]
        )
    } catch (err) {
        logger.error(err)
        return null
    }

    return {
        name: eventName,
        data: smartWallet,
        origin: origin,
    }
}

export default NewSmartWallet