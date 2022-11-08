import { StringKeyMap, logger, SharedTables } from '../../../../shared'
import { publishEventSpecs } from '../relay'

export async function onNewERC20TokenBalanceEvent(eventSpec: StringKeyMap) {
    const tokenBalance = eventSpec.data
    try {
        await SharedTables.query(
            `INSERT INTO polygon.erc20_balances (token_address, token_name, token_symbol, owner_address, balance) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (token_address, owner_address) DO UPDATE SET balance = EXCLUDED.balance`,
            [
                tokenBalance.tokenAddress,
                tokenBalance.tokenName,
                tokenBalance.tokenSymbol,
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