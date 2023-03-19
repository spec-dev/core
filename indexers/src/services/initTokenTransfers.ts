import { Erc20Token, NftCollection, Erc20Transfer, NftTransfer, StringKeyMap, logger } from '../../../shared'

async function initTokenTransfers(
    newErc20Tokens: Erc20Token[],
    newNftCollections: NftCollection[],
    logs: StringKeyMap[]
): Promise<[Erc20Transfer[], NftTransfer[]]> {
    return [[], []]
}
export default initTokenTransfers