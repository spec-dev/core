import EvmIndexer from './EvmIndexer'
import { originEvents } from '../events'
import { 
    NewReportedHead,
    StringKeyMap,
    getPolygonContracts,
    savePolygonContracts,
    unique,
    SharedTables,
} from '../../../shared'
import extractTransfersFromLogs from '../services/extractTransfersFromLogs'
import {
    isContractERC20, 
    resolveERC20Metadata, 
    getContractBytecode, 
    isContractERC721, 
    isContractERC1155, 
    resolveNFTContractMetadata,
    getERC20TokenBalance, 
    getERC1155TokenBalance,
} from '../services/contractServices'

class PolygonIndexer extends EvmIndexer {

    ivySmartWalletInitializerWalletCreated: string

    constructor(head: NewReportedHead, options?: {
        indexTraces?: boolean
        indexTokenTransfers?: boolean
        indexTokenBalances?: boolean
    }) {
        super(head, options)
        this.ivySmartWalletInitializerWalletCreated = `${this.contractEventNsp}.ivy.SmartWalletInitializer.WalletCreated@0x5b03bfed1c14a02bdeceb5fa582eb1a5765fc0bc64ca0e6af4c20afc9487f081`
    }

    async _curateInputsToSendDownstream() {
        await super._curateInputsToSendDownstream()

        // New Ivy Smart Wallet events.
        const ivySmartWalletInitializerWalletCreatedEventSpecs = this.blockEvents.filter(es => (
            es.name === this.ivySmartWalletInitializerWalletCreated
        ))
        let newSmartWalletEventSpecs = []
        if (ivySmartWalletInitializerWalletCreatedEventSpecs.length) {
            newSmartWalletEventSpecs = (await Promise.all(
                ivySmartWalletInitializerWalletCreatedEventSpecs.map(es => originEvents.ivy.NewSmartWallet(es))
            )).filter(v => !!v)
        }

        const tokenEventSpecs = await this._getNewTokenBalanceEventSpecs()

        // ERC-20 Balance events.
        const erc20EventSpecs = (await Promise.all(
            (tokenEventSpecs?.erc20s || []).map(es => originEvents.tokens.NewERC20TokenBalance(es))
        )).filter(v => !!v)

        // NFT Balance events.
        const nftEventSpecs = (await Promise.all(
            (tokenEventSpecs?.nfts || []).map(es => originEvents.tokens.NewNFTBalance(es))
        )).filter(v => !!v)

        this.blockEvents = [
            ...this.blockEvents,
            ...newSmartWalletEventSpecs,
            ...erc20EventSpecs,
            ...nftEventSpecs,
        ]
    }

    async _getNewTokenBalanceEventSpecs(): Promise<StringKeyMap> {
        const transfers = extractTransfersFromLogs(this.successfulLogs)
        if (!transfers.length) return {}

        const accounts = []
        for (const transfer of transfers) {
            transfer.from && accounts.push(transfer.from)
            transfer.to && accounts.push(transfer.to)
        }

        const referencedSmartWalletOwners = await this._getSmartWalletsForAddresses(unique(accounts))
        if (!referencedSmartWalletOwners.length) return {}
        const smartWalletOwners = new Set(referencedSmartWalletOwners)
        
        const referencedContractAddresses = unique(transfers.map(t => t.log.address))
        const contracts = await this._resolveContracts(referencedContractAddresses, this.chainId)

        const refetchERC20TokenBalancesMap = {}
        const erc721BalanceUpdates = {}
        const refetchERC1155TokenBalancesMap = {}

        const transferToLog = {}
        for (const transfer of transfers) {
            const contract = contracts[transfer.log.address]
            if (!contract) continue

            if (contract.isERC20) {
                const token = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                    decimals: contract.decimals || null,
                }
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
    
                if (fromSmartWalletOwner) {
                    const key = [contract.address, transfer.from].join(':')
                    refetchERC20TokenBalancesMap[key] = token
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, transfer.to].join(':')
                    refetchERC20TokenBalancesMap[key] = token
                    transferToLog[key] = transfer.log
                }
            }
            else if (contract.isERC721) {
                const nftContract = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                }
                
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
                const tokenId = transfer.value
                
                if (fromSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.from].join(':')
                    erc721BalanceUpdates[key] = {
                        ...nftContract,
                        balance: '0',
                    }
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.to].join(':')
                    erc721BalanceUpdates[key] = {
                        ...nftContract,
                        balance: '1',
                    }
                    transferToLog[key] = transfer.log
                }
            } else if (contract.isERC1155) {
                const nftContract = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                }
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
                const tokenId = transfer.tokenId
    
                if (fromSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.from].join(':')
                    refetchERC1155TokenBalancesMap[key] = nftContract
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.to].join(':')
                    refetchERC1155TokenBalancesMap[key] = nftContract
                    transferToLog[key] = transfer.log
                }
            }
        }

        const tokenBalancePromises = []
        const tokenBalanceData = []
        for (const key in refetchERC20TokenBalancesMap) {
            const token = refetchERC20TokenBalancesMap[key]
            const [tokenAddress, ownerAddress] = key.split(':')
            tokenBalancePromises.push(getERC20TokenBalance(tokenAddress, ownerAddress, token.decimals))
            tokenBalanceData.push({ 
                tokenAddress,
                tokenName: token.name,
                tokenSymbol: token.symbol,
                ownerAddress,
                log: transferToLog[key]
            })
        }

        let tokenBalances
        try {
            tokenBalances = await Promise.all(tokenBalancePromises)
        } catch (err) {
            this._error(`Error refreshing ERC-20 token balances: $${err}`)
            tokenBalances = []
        }

        for (let i = 0; i < tokenBalances.length; i++) {
            tokenBalanceData[i].balance = tokenBalances[i]
        }

        const erc721TokenBalanceData = []
        for (const key in erc721BalanceUpdates) {
            const nftContractWithBalance = erc721BalanceUpdates[key]
            const [contractAddress, tokenId, ownerAddress] = key.split(':')
            erc721TokenBalanceData.push({ 
                tokenAddress: contractAddress,
                tokenName: nftContractWithBalance.name,
                tokenSymbol: nftContractWithBalance.symbol,
                tokenStandard: 'erc721',
                tokenId,
                ownerAddress,
                balance: nftContractWithBalance.balance,
                log: transferToLog[key]
            })
        }

        const erc1155TokenBalancePromises = []
        const erc1155TokenBalanceData = []
        for (const key in refetchERC1155TokenBalancesMap) {
            const nftContract = refetchERC1155TokenBalancesMap[key]
            const [contractAddress, tokenId, ownerAddress] = key.split(':')
            erc1155TokenBalancePromises.push(getERC1155TokenBalance(contractAddress, tokenId, ownerAddress))
            erc1155TokenBalanceData.push({
                tokenAddress: contractAddress,
                tokenName: nftContract.name,
                tokenSymbol: nftContract.symbol,
                tokenStandard: 'erc1155',
                tokenId,
                ownerAddress,
                log: transferToLog[key]
            })
        }

        let erc1155TokenBalances
        try {
            erc1155TokenBalances = await Promise.all(erc1155TokenBalancePromises)
        } catch (err) {
            this._error(`Error refreshing ERC-1155 token balances: $${err}`)
            erc1155TokenBalances = []
        }

        for (let i = 0; i < erc1155TokenBalances.length; i++) {
            erc1155TokenBalanceData[i].balance = erc1155TokenBalances[i]
        }

        const erc20EventSpecs = tokenBalanceData
            .filter(entry => entry.balance !== null)
            .map(value => {
                const { tokenAddress, tokenName, tokenSymbol, ownerAddress, balance, log } = value
                return {
                    data: {
                        tokenAddress,
                        tokenName,
                        tokenSymbol,
                        ownerAddress,
                        balance,
                    },
                    origin: {
                        chainId: this.chainId,
                        transactionHash: log.transactionHash,
                        transactionIndex: log.transactionIndex,
                        logIndex: log.logIndex,
                        signature: log.topic0,
                        contractAddress: log.address,
                        blockNumber: Number(log.blockNumber),
                        blockHash: log.blockHash,
                        blockTimestamp: log.blockTimestamp.toISOString(),        
                    }
                }
            })

        const nftEventSpecs = [...erc721TokenBalanceData, ...erc1155TokenBalanceData]
            .filter(entry => entry.balance !== null)
            .map(value => {
                const { tokenAddress, tokenName, tokenSymbol, tokenStandard, tokenId, ownerAddress, balance, log } = value
                return {
                    data: {
                        tokenAddress,
                        tokenName,
                        tokenSymbol,
                        tokenStandard,
                        tokenId,
                        ownerAddress,
                        balance,
                    },
                    origin: {
                        chainId: this.chainId,
                        transactionHash: log.transactionHash,
                        transactionIndex: log.transactionIndex,
                        logIndex: log.logIndex,
                        signature: log.topic0,
                        contractAddress: log.address,
                        blockNumber: Number(log.blockNumber),
                        blockHash: log.blockHash,
                        blockTimestamp: log.blockTimestamp.toISOString(),        
                    }
                }    
            })

        return { erc20s: erc20EventSpecs, nfts: nftEventSpecs }
    }

    async _getSmartWalletsForAddresses(addresses: string[]): Promise<string[]> {
        if (!addresses.length) return []
        const placeholders = []
        let i = 1
        for (const _ of addresses) {
            placeholders.push(`$${i}`)
            i++
        }
        const results = (await SharedTables.query(
            `SELECT contract_address FROM ivy.smart_wallets WHERE contract_address IN (${placeholders.join(', ')}) AND chain_id = $${i}`,
            [...addresses, this.chainId],
        )) || []
        return results.map(sw => sw?.contract_address).filter(v => !!v)
    }

    async _resolveContracts(addresses: string[], chainId: string): Promise<StringKeyMap> {
        const contracts = await getPolygonContracts(addresses, chainId)
    
        let bytecodePromises = []
        let bytecodeAddresses = []
        for (const address of addresses) {
            if (contracts.hasOwnProperty(address)) continue
            bytecodeAddresses.push(address)
            bytecodePromises.push(getContractBytecode(address))
        }
    
        const bytecodes = await Promise.all(bytecodePromises)
    
        const newERC20Contracts = []
        const newERC721Contracts = []
        const newERC1155Contracts = []
    
        const cacheUpdates = {}
        for (let i = 0; i < bytecodes.length; i++) {
            const bytecode = bytecodes[i]
            if (!bytecode) continue
    
            const address = bytecodeAddresses[i]
    
            const contract = {
                address,
                bytecode,
                isERC20: isContractERC20(bytecode),
                isERC721: isContractERC721(bytecode),
                isERC1155: isContractERC1155(bytecode),
            }
    
            if (contract.isERC20) {
                newERC20Contracts.push(contract)
                continue
            }
    
            if (contract.isERC721) {
                newERC721Contracts.push(contract)
                continue
            }
    
            if (contract.isERC1155) {
                newERC1155Contracts.push(contract)
                continue
            }
    
            contracts[address] = contract
    
            cacheUpdates[address] = JSON.stringify({
                address,
                isERC20: false,
                isERC721: false,
                isERC1155: false,
            })
        }
    
        const erc20Metadata = await Promise.all(
            newERC20Contracts.map(contract => resolveERC20Metadata(contract))
        )
        const erc721Metadata = await Promise.all(
            newERC721Contracts.map(contract => resolveNFTContractMetadata(contract))
        )
        const erc1155Metadata = await Promise.all(
            newERC1155Contracts.map(contract => resolveNFTContractMetadata(contract))
        )
    
        for (let i = 0; i < newERC20Contracts.length; i++) {
            const address = newERC20Contracts[i].address
            const metadata = erc20Metadata[i] || {}
            const { name, symbol, decimals } = metadata
    
            if (name) {
                newERC20Contracts[i].name = name
            }
            if (symbol) {
                newERC20Contracts[i].symbol = symbol
            }
            if (decimals) {
                newERC20Contracts[i].decimals = Number(decimals)
            }
            
            contracts[address] = newERC20Contracts[i]
            cacheUpdates[address] = JSON.stringify({
                ...newERC20Contracts[i],
                bytecode: null,
            })
        }
    
        for (let i = 0; i < newERC721Contracts.length; i++) {
            const address = newERC721Contracts[i].address
            const metadata = erc721Metadata[i] || {}
            const { name, symbol } = metadata
    
            if (name) {
                newERC721Contracts[i].name = name
            }
            if (symbol) {
                newERC721Contracts[i].symbol = symbol
            }
            
            contracts[address] = newERC721Contracts[i]
            cacheUpdates[address] = JSON.stringify({
                ...newERC721Contracts[i],
                bytecode: null,
            })
        }
    
        for (let i = 0; i < newERC1155Contracts.length; i++) {
            const address = newERC1155Contracts[i].address
            const metadata = erc1155Metadata[i] || {}
            const { name, symbol } = metadata
    
            if (name) {
                newERC1155Contracts[i].name = name
            }
            if (symbol) {
                newERC1155Contracts[i].symbol = symbol
            }
            
            contracts[address] = newERC1155Contracts[i]
            cacheUpdates[address] = JSON.stringify({
                ...newERC1155Contracts[i],
                bytecode: null,
            })
        }
    
        savePolygonContracts(cacheUpdates, chainId)
    
        return contracts
    }
}

export default PolygonIndexer