import { StringKeyMap } from '../lib/types'
import {
    ERC20_NAME_ITEM,
    ERC20_SYMBOL_ITEM,
    ERC20_DECIMALS_ITEM,
    AbiItem,
} from '../../../shared'
import { callContract } from './callContract'

export async function getERC20TokenMetadata(
    chainId: string, 
    tokenAddress: string, 
): Promise<StringKeyMap> {
    const [nameResp, symbolResp, decimalsResp] = await Promise.all([
        callContract(chainId, tokenAddress, ERC20_NAME_ITEM as AbiItem, []),
        callContract(chainId, tokenAddress, ERC20_SYMBOL_ITEM as AbiItem, []),
        callContract(chainId, tokenAddress, ERC20_DECIMALS_ITEM as AbiItem, []),
    ])

    const metadata = {
        name: (nameResp?.data?.outputs || [])[0] || null,
        symbol: (symbolResp?.data?.outputs || [])[0] || null,
        decimals: (decimalsResp?.data?.outputs || [])[0] || null,
    }

    return { data: metadata }
}