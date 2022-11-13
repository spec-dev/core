import { StringKeyMap, logger, SharedTables, sleep, hexToNumberString } from '../../../../shared'
import { publishEventSpecs } from '../relay'
import { BigNumber, utils } from 'ethers'
import { getERC20TokenBalance } from '../../services/contractServices'
import { AlchemyWeb3 } from '@alch/alchemy-web3'

export async function onIvyWalletCreatedContractEvent(eventSpec: StringKeyMap, web3: AlchemyWeb3) {
    // Get smart wallet contract and owner addresses from received event data.
    const { data, origin } = eventSpec
    const contractAddress = data.smartWallet
    const ownerAddress = data.owner
    if (!contractAddress || !ownerAddress) return

    // Get the rest of the needed data from the event origin.
    const {
        chainId,
        transactionHash,
        blockNumber,
        blockHash,
        blockTimestamp,
    } = origin

    // Create the smart wallet live object.
    const smartWallet = {
        chainId,
        contractAddress,
        ownerAddress,
        transactionHash,
        blockNumber,
        blockHash,
        blockTimestamp,
    }

    // Upsert the smart wallet record.
    try {
        await SharedTables.query(`INSERT INTO ivy.smart_wallets (chain_id, contract_address, owner_address, transaction_hash, block_number, block_hash, block_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (chain_id, contract_address) DO UPDATE SET owner_address = EXCLUDED.owner_address, transaction_hash = EXCLUDED.transaction_hash, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
            [
                smartWallet.chainId,
                smartWallet.contractAddress,
                smartWallet.ownerAddress,
                smartWallet.transactionHash,
                smartWallet.blockNumber,
                smartWallet.blockHash,
                smartWallet.blockTimestamp,
            ]
        )
    } catch (err) {
        logger.error(err)
        return
    }

    try {
        await Promise.all([
            pullERC20sForAddress(smartWallet.contractAddress, chainId),
            pullNFTsForAddress(smartWallet.contractAddress, web3),
        ])
    } catch (err) {
        logger.error(err)
    }

    // Publish new ivy.NewSmartWallet event.
    await publishEventSpecs([{
        name: 'polygon:ivy.NewSmartWallet@0.0.1',
        data: smartWallet,
        origin: origin,
    }])
}

export async function pullERC20sForAddress(ownerAddress: string, chainId: number) {
    const alreadyPulledTokens = await erc20TokenBalanceExistsForOwner(ownerAddress)
    if (alreadyPulledTokens) return

    const tokens = await fetchERC20s(ownerAddress, chainId)
    if (!tokens.length) return

    const insertPlaceholders = []
    const insertBindings = []
    let i = 1
    for (const token of tokens) {
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`)
        insertBindings.push(...[
            token.token_address,
            token.token_name,
            token.token_symbol,
            token.owner_address,
            token.balance,
        ])
        i += 5
    }
    const insertQuery = `INSERT INTO polygon.erc20_balances (token_address, token_name, token_symbol, owner_address, balance) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT (token_address, owner_address) DO UPDATE SET balance = EXCLUDED.balance`
    await SharedTables.query(insertQuery, insertBindings)
}

export async function pullNFTsForAddress(ownerAddress: string, web3: AlchemyWeb3) {
    const alreadyPulledNFTs = await nftTokenBalanceExistsForOwner(ownerAddress)
    if (alreadyPulledNFTs) return

    const nfts = await fetchNFTs(ownerAddress, web3)
    if (!nfts.length) return

    const insertPlaceholders = []
    const insertBindings = []
    let i = 1
    for (const nft of nfts) {
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`)
        insertBindings.push(...[
            nft.token_address,
            nft.token_name,
            nft.token_symbol,
            nft.token_standard,
            nft.token_id,
            nft.owner_address,
            nft.balance,
        ])
        i += 5
    }
    const insertQuery = `INSERT INTO polygon.nft_balances (token_address, token_name, token_symbol, token_standard, token_id, owner_address, balance) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT (token_address, token_id, owner_address) DO UPDATE SET balance = EXCLUDED.balance`
    await SharedTables.query(insertQuery, insertBindings)
}

async function erc20TokenBalanceExistsForOwner(ownerAddress: string): Promise<boolean> {
    const count = Number((((await SharedTables.query(
        `SELECT COUNT(*) FROM polygon.erc20_balances WHERE owner_address = $1`, 
        [ownerAddress],
    )) || [])[0] || {}).count || 0)
    return count > 0
}

async function nftTokenBalanceExistsForOwner(ownerAddress: string): Promise<boolean> {
    const count = Number((((await SharedTables.query(
        `SELECT COUNT(*) FROM polygon.nft_balances WHERE owner_address = $1`, 
        [ownerAddress],
    )) || [])[0] || {}).count || 0)
    return count > 0
}

async function fetchERC20s(ownerAddress: string, chainId: number) {
    let externalTokens = null
    let numAttempts = 0

    while (externalTokens === null && numAttempts < 10) {
        externalTokens = await _fetchERC20s(ownerAddress, chainId)
        if (externalTokens === null) {
            await sleep(300)
        }
        numAttempts += 1
    }

    if (externalTokens === null) {
        logger.error(`Out of attempts - No tokens found for owner ${ownerAddress}...`)
        return []
    }

    return externalToInternalERC20s(externalTokens, ownerAddress)
}

async function fetchNFTs(ownerAddress: string, web3: AlchemyWeb3) {
    let externalNFTs = null
    let numAttempts = 0

    while (externalNFTs === null && numAttempts < 10) {
        externalNFTs = await _fetchNFTs(ownerAddress, web3)
        if (externalNFTs === null) {
            await sleep(300)
        }
        numAttempts += 1
    }

    if (externalNFTs === null) {
        logger.error(`Out of attempts - No NFTs found for owner ${ownerAddress}...`)
        return []
    }

    return externalToInternalNFTs(externalNFTs, ownerAddress)
}

async function _fetchERC20s(ownerAddress: string, chainId: number): Promise<StringKeyMap[] | null> {
    let resp, error
    try {
        resp = await fetch(
            `https://api.covalenthq.com/v1/${chainId}/address/${ownerAddress}/balances_v2/?key=ckey_f3bbe4bb746b4df2b6b3fe1cb84`
        )
    } catch (err) {
        error = err
    }

    if (error) {
        logger.error(`Error fetching tokens: ${error}. Will retry`)
        return null
    }

    let data
    try {
        data = await resp.json()
    } catch (err) {
        logger.error(
            `Error parsing json response while fetching tokens for address ${ownerAddress}: ${err}`
        )
        data = {}
    }

    if (data?.error || !data?.data) {
        return null
    }

    const erc20s = (data.data.items || []).filter(item => item.supports_erc?.includes('erc20'))
    if (!erc20s.length) return []

    // Find the ones that are "dust" and refetch their balances.
    let refetchBalancePromises = []
    let refetchBalanceTokenAddresses = []
    for (const token of erc20s) {
        if (token.type === 'dust') {
            refetchBalanceTokenAddresses.push(token.contract_address)
            refetchBalancePromises.push(getERC20TokenBalance(
                token.contract_address, 
                ownerAddress, 
                token.contract_decimals,
                false,
            ))
        }
    }
    if (!refetchBalanceTokenAddresses.length) return erc20s

    let dustBalances
    try {
        dustBalances = await Promise.all(refetchBalancePromises)
    } catch (err) {
        logger.error(err)
        return erc20s
    }
    const dustBalancesMap = {}
    for (let i = 0; i < refetchBalanceTokenAddresses.length; i++) {
        const tokenAddress = refetchBalanceTokenAddresses[i]
        const tokenBalance = dustBalances[i]
        if (!tokenBalance) continue
        dustBalancesMap[tokenAddress] = tokenBalance
    }

    for (let i = 0; i < erc20s.length; i++) {
        if (dustBalancesMap.hasOwnProperty(erc20s[i].contract_address)) {
            erc20s[i].balance = dustBalancesMap[erc20s[i].contract_address]
        }
    }

    return erc20s
}

async function _fetchNFTs(ownerAddress: string, web3: AlchemyWeb3, prevResults?: StringKeyMap[], pageKey?: string): Promise<StringKeyMap[] | null> {
    let resp, error
    try {
        let payload: any = { owner: ownerAddress, withMetadata: true }
        if (pageKey) {
            payload.pageKey = pageKey
        } 
        resp = await web3.alchemy.getNfts(payload)
    } catch (err) {
        error = err
    }

    if (error || !resp) {
        logger.error(`Error fetching NFTs: ${error}. Will retry`)
        return null
    }

    let results = resp.ownedNfts || []

    if (prevResults?.length) {
        results = [...prevResults, results]
    }

    if (resp.pageKey) {
        return _fetchNFTs(ownerAddress, web3, results, pageKey)
    }

    return results
}

function externalToInternalERC20s(externalTokens: StringKeyMap, ownerAddress: string): StringKeyMap[] {
    return externalTokens.map(token => {
        let balance
        try {
            balance = utils.formatUnits(
                BigNumber.from(token.balance || '0'),
                Number(token.contract_decimals || 18),
            )
        } catch (err) {
            return null
        }
        if (Number(balance) === 0) {
            balance = '0'
        }
        return {
            token_address: token.contract_address,
            token_name: token.contract_name,
            token_symbol: token.contract_ticker_symbol,
            owner_address: ownerAddress,
            balance: balance,
        }
    }).filter(v => !!v)
}

function externalToInternalNFTs(externalNFTs: StringKeyMap, ownerAddress: string): StringKeyMap[] {
    return externalNFTs.map(nft => {
        let tokenId = nft.id.tokenId
        if (tokenId.startsWith('0x')) {
            tokenId = hexToNumberString(tokenId)
        }
        return {
            token_address: nft.contract.address,
            token_name: nft.contractMetadata.name,
            token_symbol: nft.contractMetadata.symbol,
            token_standard: nft.id.tokenMetadata.tokenType.toLowerCase(),
            token_id: tokenId,
            owner_address: ownerAddress,
            balance: nft.balance || '1',
        }
    })
}