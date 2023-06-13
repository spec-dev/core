import { StringKeyMap, specialErc20BalanceAffectingAbis } from '../../../shared'
import { getErc20Tokens } from './initTokenTransfers'

async function extractSpecialErc20BalanceEventData(
    logs: StringKeyMap[],
    knownErc20TokensMap: StringKeyMap,
    chainId: string,
): Promise<StringKeyMap> {
    const potentialErc20TokenAddressesSet = new Set<string>()
    const erc20BalanceDataByOwner = {}
    const potentialErc20TokenOwners = []

    for (const log of logs) {
        const specialAbi = specialErc20BalanceAffectingAbis[log.topic0]
        if (!specialAbi) continue

        const ownerAddress = ((log.eventArgs || [])[specialAbi.addressIndex] || {}).value
        if (!ownerAddress || typeof ownerAddress !== 'string' || !ownerAddress.startsWith('0x')) {
            continue
        }

        const tokenAddress = log.address
        const token = knownErc20TokensMap[tokenAddress]
        if (token) {
            const uniqueKey = [tokenAddress, ownerAddress].join(':')
            erc20BalanceDataByOwner[uniqueKey] = {
                tokenAddress,
                ownerAddress,
                tokenName: token.name,
                tokenSymbol: token.symbol,
                tokenDecimals: token.decimals,
            }
            continue
        }

        potentialErc20TokenOwners.push({ tokenAddress, ownerAddress })
        potentialErc20TokenAddressesSet.add(tokenAddress) 
    }

    const potentialErc20TokenAddresses = Array.from(potentialErc20TokenAddressesSet)
    if (!potentialErc20TokenAddresses.length) return erc20BalanceDataByOwner

    const erc20Tokens = await getErc20Tokens(potentialErc20TokenAddresses, chainId)
    if (!Object.keys(erc20Tokens).length) return erc20BalanceDataByOwner

    for (const { tokenAddress, ownerAddress } of potentialErc20TokenOwners) {
        const token = erc20Tokens[tokenAddress]
        if (!token) continue

        const uniqueKey = [tokenAddress, ownerAddress].join(':')
        erc20BalanceDataByOwner[uniqueKey] = {
            tokenAddress,
            ownerAddress,
            tokenName: token.name,
            tokenSymbol: token.symbol,
            tokenDecimals: token.decimals,
        }
    }

    return erc20BalanceDataByOwner
}

export default extractSpecialErc20BalanceEventData