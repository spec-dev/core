import { StringKeyMap, logger, SharedTables } from '../../../../../shared'

const eventName = 'tokens.NewERC20TokenBalance@0.0.1'

async function NewERC20TokenBalance(eventSpec: StringKeyMap): Promise<StringKeyMap | null> {
    const { data, origin } = eventSpec
    const {
        chainId,
        blockNumber,
        blockHash,
        blockTimestamp,
    } = origin

    const erc20Balance = {
        tokenAddress: data.tokenAddress,
        tokenName: data.tokenName,
        tokenSymbol: data.tokenSymbol,
        ownerAddress: data.ownerAddress,
        balance: data.balance,
        blockNumber,
        blockHash,
        blockTimestamp,
        chainId,
    }

    try {
        if (!data.balance || Number(data.balance) === 0) {
            await SharedTables.query(`DELETE FROM tokens.erc20_balances WHERE token_address = $1 AND owner_address = $2 AND chain_id = $3`, 
                [
                    erc20Balance.tokenAddress,
                    erc20Balance.ownerAddress,
                    erc20Balance.chainId,
                ],
            )
        } else {
            await SharedTables.query(
                `INSERT INTO tokens.erc20_balances (token_address, token_name, token_symbol, owner_address, balance, block_number, block_hash, block_timestamp, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (token_address, owner_address, chain_id) DO UPDATE SET balance = EXCLUDED.balance, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
                [
                    erc20Balance.tokenAddress,
                    erc20Balance.tokenName,
                    erc20Balance.tokenSymbol,
                    erc20Balance.ownerAddress,
                    erc20Balance.balance,
                    erc20Balance.blockNumber,
                    erc20Balance.blockHash,
                    erc20Balance.blockTimestamp,
                    erc20Balance.chainId,
                ]
            )    
        }
    } catch (err) {
        logger.error(err)
        return null
    }
    
    return {
        name: eventName,
        data: erc20Balance,
        origin: origin,
    }
}

export default NewERC20TokenBalance