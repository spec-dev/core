import { StringKeyMap, logger, SharedTables } from '../../../../shared'

export async function onNewERC20TokenBalanceEvent(eventSpec: StringKeyMap): Promise<StringKeyMap | null> {
    const { data, origin } = eventSpec
    const {
        chainId,
        blockNumber,
        blockHash,
        blockTimestamp,
    } = origin

    try {
        if (!data.balance || Number(data.balance) === 0) {
            await SharedTables.query(`DELETE FROM tokens.erc20_balances WHERE token_address = $1 AND owner_address = $2 AND chain_id = $3`, 
                [
                    data.tokenAddress,
                    data.ownerAddress,
                    chainId,
                ],
            )
        } else {
            await SharedTables.query(
                `INSERT INTO tokens.erc20_balances (token_address, token_name, token_symbol, owner_address, balance, block_number, block_hash, block_timestamp, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (token_address, owner_address, chain_id) DO UPDATE SET balance = EXCLUDED.balance, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
                [
                    data.tokenAddress,
                    data.tokenName,
                    data.tokenSymbol,
                    data.ownerAddress,
                    data.balance,
                    blockNumber,
                    blockHash,
                    blockTimestamp,
                    chainId,
                ]
            )    
        }
    } catch (err) {
        logger.error(err)
        return null
    }
    
    return eventSpec
}