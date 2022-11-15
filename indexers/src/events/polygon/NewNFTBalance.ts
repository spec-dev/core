import { StringKeyMap, logger, SharedTables } from '../../../../shared'
import { publishEventSpecs } from '../relay'

export async function onNewNFTBalanceEvent(eventSpec: StringKeyMap) {
    const data = eventSpec.data
    try {
        if (!data.balance || Number(data.balance) === 0) {
            await SharedTables.query(`DELETE FROM polygon.nft_balances WHERE token_address = $1 AND token_id = $2 AND owner_address = $3`, 
                [
                    data.tokenAddress,
                    data.tokenId,
                    data.ownerAddress,
                ],
            )
        } else {
            await SharedTables.query(
                `INSERT INTO polygon.nft_balances (token_address, token_name, token_symbol, token_standard, token_id, owner_address, balance) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (token_address, token_id, owner_address) DO UPDATE SET balance = EXCLUDED.balance`,
                [
                    data.tokenAddress,
                    data.tokenName,
                    data.tokenSymbol,
                    data.tokenStandard,
                    data.tokenId,
                    data.ownerAddress,
                    data.balance,
                ]
            )
        }
    } catch (err) {
        logger.error(err)
        return
    }
    await publishEventSpecs([eventSpec])
}