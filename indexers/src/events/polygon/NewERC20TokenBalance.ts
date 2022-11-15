import { StringKeyMap, logger, SharedTables } from '../../../../shared'
import { publishEventSpecs } from '../relay'

export async function onNewERC20TokenBalanceEvent(eventSpec: StringKeyMap) {
    const data = eventSpec.data
    try {
        if (!data.balance || Number(data.balance) === 0) {
            await SharedTables.query(`DELETE FROM polygon.erc20_balances WHERE token_address = $1 AND owner_address = $2`, 
                [
                    data.tokenAddress,
                    data.ownerAddress,
                ],
            )
        } else {
            await SharedTables.query(
                `INSERT INTO polygon.erc20_balances (token_address, token_name, token_symbol, owner_address, balance) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (token_address, owner_address) DO UPDATE SET balance = EXCLUDED.balance`,
                [
                    data.tokenAddress,
                    data.tokenName,
                    data.tokenSymbol,
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