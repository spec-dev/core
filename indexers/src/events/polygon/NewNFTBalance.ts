import { StringKeyMap, logger, SharedTables } from '../../../../shared'
import { publishEventSpecs } from '../relay'

export async function onNewNFTBalanceEvent(eventSpec: StringKeyMap) {
    const tokenBalance = eventSpec.data
    try {
        await SharedTables.query(
            `INSERT INTO polygon.nft_balances (token_address, token_name, token_symbol, token_standard, token_id, owner_address, balance) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (token_address, token_id, owner_address) DO UPDATE SET balance = EXCLUDED.balance`,
            [
                tokenBalance.tokenAddress,
                tokenBalance.tokenName,
                tokenBalance.tokenSymbol,
                tokenBalance.tokenStandard,
                tokenBalance.tokenId,
                tokenBalance.ownerAddress,
                tokenBalance.balance,
            ]
        )
    } catch (err) {
        logger.error(err)
        return
    }
    await publishEventSpecs([eventSpec])
}