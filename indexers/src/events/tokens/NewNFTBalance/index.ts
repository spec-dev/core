import { StringKeyMap, logger, ChainTables } from '../../../../../shared'

const eventName = 'tokens.NewNFTBalance@0.0.1'

async function NewNFTBalance(eventSpec: StringKeyMap): Promise<StringKeyMap | null> {
    const { data, origin } = eventSpec
    const {
        chainId,
        blockNumber,
        blockHash,
        blockTimestamp,
    } = origin

    const nftBalance = {
        tokenAddress: data.tokenAddress,
        tokenName: data.tokenName,
        tokenSymbol: data.tokenSymbol,
        tokenStandard: data.tokenStandard,
        tokenId: data.tokenId,
        ownerAddress: data.ownerAddress,
        balance: data.balance,
        blockNumber,
        blockHash,
        blockTimestamp,
        chainId,
    }

    try {
        await ChainTables.query(
            null,
            `INSERT INTO tokens.nft_balances (token_address, token_name, token_symbol, token_standard, token_id, owner_address, balance, block_number, block_hash, block_timestamp, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (token_address, token_id, owner_address, chain_id) DO UPDATE SET balance = EXCLUDED.balance, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
            [
                nftBalance.tokenAddress,
                nftBalance.tokenName,
                nftBalance.tokenSymbol,
                nftBalance.tokenStandard,
                nftBalance.tokenId,
                nftBalance.ownerAddress,
                nftBalance.balance,
                nftBalance.blockNumber,
                nftBalance.blockHash,
                nftBalance.blockTimestamp,
                nftBalance.chainId,
            ]
        )
    } catch (err) {
        logger.error(err)
        return null
    }

    return {
        name: eventName,
        data: nftBalance,
        origin: origin,
    }
}

export default NewNFTBalance