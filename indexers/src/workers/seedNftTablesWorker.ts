import config from '../config'
import {
    logger,
    range,
    SharedTables,
    In,
    EthContract,
    PolygonContract,
    getAbis,
    Abi,
    toChunks,
    AbiItemType,
    sleep,
    hexToNumberString,
    StringKeyMap,
    Brackets,
} from '../../../shared'
import { exit } from 'process'
import { Pool } from 'pg'
import { isContractERC721, isContractERC1155 } from '../services/contractServices'
import fetch from 'cross-fetch'

class SeedNftTablesWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    collectionsToSave: StringKeyMap[]

    nftsToSave: StringKeyMap[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.collectionsToSave = []
        this.nftsToSave = []

        // Create connection pool.
        this.pool = new Pool({
            host : config.SHARED_TABLES_DB_HOST,
            port : config.SHARED_TABLES_DB_PORT,
            user : config.SHARED_TABLES_DB_USERNAME,
            password : config.SHARED_TABLES_DB_PASSWORD,
            database : config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            idleTimeoutMillis: 0,
            query_timeout: 0,
            connectionTimeoutMillis: 0,
            statement_timeout: 0,
        })
        
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const group = range(start, end)
            await this._indexGroup(group)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.collectionsToSave.length) {
            await this._saveCollections([...this.collectionsToSave])
            this.collectionsToSave = []
        }

        if (this.nftsToSave.length) {
            await this._saveNfts([...this.nftsToSave])
            this.nftsToSave = []
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get NFT contracts for this block range.
        const contracts = await this._getNftContractsInBlockRange(numbers)
        if (!contracts.length) return

        // Get all NFT collections and their associated assets for the given contracts.
        const data = await this._getNftContractData(contracts)

        for (let i = 0; i < contracts.length; i++) {
            const contractAddress = contracts[i].address
            const result = data[i] || {}
            const collection = result.collection
            const nfts = result.nfts || []

            if (!Object.keys(result).length) {
                logger.error(`No NFT data could be pulled for contract ${contractAddress}`)
                continue
            }

            if (collection && !nfts.length) {
                logger.error(`Pulled empty NFT collection ${contractAddress}`)
            }

            collection && this.collectionsToSave.push(collection)
            nfts.length && this.nftsToSave.push(...nfts)
        }

        if (this.collectionsToSave.length >= 2000) {
            await this._saveCollections([...this.collectionsToSave])
            this.collectionsToSave = []
        } 

        if (this.nftsToSave.length >= 2000) {
            await this._saveNfts([...this.nftsToSave])
            this.nftsToSave = []
        }
    }

    async _saveCollections(collections: StringKeyMap[]) {
        logger.info(`Saving ${collections.length} collections...`)
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const collection of collections) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8})`)
            insertBindings.push(...[
                collection.address,
                collection.name,
                collection.symbol,
                collection.standard,
                collection.totalSupply,
                collection.blockNumber,
                collection.blockHash,
                collection.blockTimestamp,
                config.CHAIN_ID,
            ])
            i += 9
        }
        
        const insertQuery = `INSERT INTO tokens.nft_collections (address, name, symbol, standard, total_supply, block_number, block_hash, block_timestamp, chain_id) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT (address, chain_id) DO NOTHING`
        const client = await this.pool.connect()
        
        try {
            await client.query('BEGIN')
            await client.query(insertQuery, insertBindings)
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error(e)
        } finally {
            client.release()
        }
    }

    async _saveNfts(nfts: StringKeyMap[]) {
        logger.info(`Saving ${nfts.length} NFTs...`)
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const nft of nfts) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, $${i + 10}, $${i + 11}, $${i + 12}, $${i + 13}, $${i + 14}, $${i + 15}, $${i + 16})`)
            insertBindings.push(...[
                nft.tokenAddress,
                nft.tokenName,
                nft.tokenSymbol,
                nft.tokenStandard,
                nft.tokenId,
                nft.ownerAddress,
                nft.balance,
                nft.title,
                nft.description,
                nft.tokenUri,
                nft.rawTokenUri,
                nft.imageUri,
                nft.rawImageUri,
                nft.imageFormat,
                nft.attributes,
                nft.metadata,
                config.CHAIN_ID,
            ])
            i += 17
        }
        
        const insertQuery = `INSERT INTO tokens.nfts (token_address, token_name, token_symbol, token_standard, token_id, owner_address, balance, title, description, token_uri, raw_token_uri, image_uri, raw_image_uri, image_format, attributes, metadata, chain_id) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT (token_address, token_id, owner_address, chain_id) DO NOTHING`
        const client = await this.pool.connect()
        
        try {
            await client.query('BEGIN')
            await client.query(insertQuery, insertBindings)
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error(e)
        } finally {
            client.release()
        }
    }

    async _getNftContractData(contracts: StringKeyMap[]) {
        const chunks = toChunks(contracts, 10)

        const results = []
        for (let i = 0; i < chunks.length; i++) {
            results.push(...(await Promise.all(chunks[i].map(contract => (
                this._getNftsForContractAddressWithProtection(contract)
            )))))
            await sleep(300)
        }

        return results
    }

    async _getNftsForContractAddressWithProtection(contract: StringKeyMap): Promise<StringKeyMap> {
        let collectionNfts = null
        let numAttempts = 0
    
        while (collectionNfts === null && numAttempts < 10) {
            collectionNfts = await this._getNftsForContractAddress(contract)
            if (collectionNfts === null) {
                await sleep(300)
            }
            numAttempts += 1
        }
    
        if (collectionNfts === null) {
            logger.error(`Out of attempts - No NFTs found for contract ${contract.address}...`)
            return {}
        }
    
        return collectionNfts
    }

    async _getNftsForContractAddress(contract: StringKeyMap) {
        const [externalNfts, owners] = await Promise.all([
            this._getAssetsForCollection(contract.address),
            this._getOwnersForCollection(contract.address),
        ])
        if (externalNfts === null || owners === null) return null
        if (!externalNfts.length) return {}

        const tokenOwners = {}
        for (const owner of owners || []) {
            const { ownerAddress, tokenBalances = [] } = owner 
            for (const tokenBalance of tokenBalances || []) {
                const { tokenId, balance } = tokenBalance
                if (!tokenOwners.hasOwnProperty(tokenId)) {
                    tokenOwners[tokenId] = []
                }
                tokenOwners[tokenId].push({ 
                    ownerAddress: ownerAddress.toLowerCase(), 
                    balance: balance || '1',
                })
            }
        }

        let resolvedTokenStandard
        const nfts = []
        for (const externalNft of externalNfts) {
            // Resolve token standard.
            let tokenStandard = externalNft.id.tokenMetadata?.tokenType
            if (tokenStandard === 'unknown' && contract.bytecode) {
                if (!resolvedTokenStandard) {
                    resolvedTokenStandard = this._resolveNFTTokenStandard(contract.bytecode)
                }
                tokenStandard = resolvedTokenStandard
            }

            // Turn external nft into internal format.
            const nftAsset = this._formatNftAsset(externalNft, contract.address, tokenStandard)

            // Add balances for every owner/asset pair.
            const owners = tokenOwners[externalNft.id.tokenId] || []
            for (const owner of owners) {
                nfts.push({
                    ...nftAsset,
                    ...owner,
                })
            }
        }

        const contractMetadata = externalNfts[0].contractMetadata || {}
        let contractTokenStandard = contractMetadata.tokenType?.toLowerCase()
        if (contractTokenStandard === 'unknown' && contract.bytecode) {
            if (!resolvedTokenStandard) {
                resolvedTokenStandard = this._resolveNFTTokenStandard(contract.bytecode)
            }
            contractTokenStandard = resolvedTokenStandard
        }

        const collection = {
            address: contract.address,
            name: contractMetadata.name,
            symbol: contractMetadata.symbol,
            standard: contractTokenStandard || 'unknown',
            totalSupply: contractMetadata.totalSupply,
            blockHash: contract.blockHash,
            blockNumber: contract.blockNumber,
            blockTimestamp: contract.blockTimestamp,
        }

        return { collection, nfts }
    }

    async _getAssetsForCollection(
        contractAddress: string,
        prevResults?: StringKeyMap[], 
        startToken?: string,
    ): Promise<StringKeyMap[] | null> {
        const params: any = {
            contractAddress,
            withMetadata: true,
            limit: 1000,
        }
        if (startToken) {
            params.startToken = startToken
        }

        const url = `${config.ALCHEMY_REST_URL}/getNFTsForCollection?${new URLSearchParams(params).toString()}`

        let resp, error
        try {
            resp = await fetch(url, { headers: { 'Accept': 'application/json' } })
        } catch (err) {
            error = err
        }
        if (error || !resp) {
            logger.error(`Error fetching NFTs for collection ${contractAddress}: ${error}...Will retry.`)
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(
                `Error parsing json response while fetching NFTs for collection ${contractAddress}: ${err}`
            )
            data = {}
        }
    
        if (data?.error?.code === -32000 || !data?.nfts) {
            return null
        } else if (data?.error) {
            logger.error(`Error fetching NFTs for collection ${contractAddress}: ${data.error.code} - ${data.error.message}`)
            return null
        }

        let results = data.nfts || []

        if (prevResults?.length) {
            results = [...prevResults, ...results]
        }
    
        if (data.nextToken) {
            return this._getAssetsForCollection(contractAddress, results, data.nextToken)
        }
    
        return results
    }

    async _getOwnersForCollection(
        contractAddress: string,
        prevResults?: StringKeyMap[],
        pageKey?: string,
    ): Promise<StringKeyMap[] | null> {
        const params: any = {
            contractAddress,
            withTokenBalances: true,
        }
        if (pageKey) {
            params.pageKey = pageKey
        }

        const url = `${config.ALCHEMY_REST_URL}/getOwnersForCollection?${new URLSearchParams(params).toString()}`

        let resp, error
        try {
            resp = await fetch(url, { headers: { 'Accept': 'application/json' } })
        } catch (err) {
            error = err
        }
        if (error || !resp) {
            logger.error(`Error fetching owners for collection ${contractAddress}: ${error}...Will retry.`)
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(
                `Error parsing json response while fetching owners for collection ${contractAddress}: ${err}`
            )
            data = {}
        }
    
        if (data?.error?.code === -32000 || !data?.ownerAddresses) {
            return null
        } else if (data?.error) {
            logger.error(`Error fetching owners for collection ${contractAddress}: ${data.error.code} - ${data.error.message}`)
            return null
        }

        let results = data.ownerAddresses || []

        if (prevResults?.length) {
            results = [...prevResults, ...results]
        }
    
        if (data.pageKey) {
            return this._getOwnersForCollection(contractAddress, results, data.pageKey)
        }
    
        return results
    }

    _formatNftAsset(externalNft: StringKeyMap, tokenAddress, tokenStandard: string): StringKeyMap {
        // Format token id.
        let tokenId = externalNft.id.tokenId
        if (tokenId.startsWith('0x')) {
            tokenId = hexToNumberString(tokenId)
        }

        const tokenUriData = externalNft.tokenUri || {}
        const imageData = (externalNft.media || [])[0] || {}

        let metadata = externalNft.metadata
        let attributes = metadata?.attributes
        try {
            metadata = metadata ? JSON.stringify(metadata) : null
            attributes = attributes ? JSON.stringify(attributes) : null
        } catch (err) {
            metadata = null
            attributes = null
        }

        return {
            tokenAddress,
            tokenId,
            tokenName: externalNft.contractMetadata.name || null,
            tokenSymbol: externalNft.contractMetadata.symbol || null,
            tokenStandard: tokenStandard || 'unknown',
            title: externalNft.title,
            description: externalNft.description,
            tokenUri: tokenUriData.gateway,
            rawTokenUri: tokenUriData.raw,
            imageUri: imageData.gateway,
            rawImageUri: imageData.raw,
            imageFormat: imageData.format,
            attributes,
            metadata,
        }
    }

    async _getNftContractsInBlockRange(numbers: number[]): Promise<StringKeyMap[]> {
        let repo = SharedTables.getRepository(['1'].includes(config.CHAIN_ID) ? EthContract : PolygonContract)
        try {
            return (await repo.createQueryBuilder()
                .where('block_number IN (:...blockNumbers)', { blockNumbers: numbers })
                .andWhere(
                    new Brackets((qb) => {
                        qb.where("is_erc721 = :isERC721", {
                            isERC721: true,
                        }).orWhere("is_erc1155 = :isERC1155", { 
                            isERC1155: true
                        })
                    }),
                )
                .getMany()
            ) || []
        } catch (err) {
            logger.error(`Error getting NFT contracts: ${err}`)
            return []
        }
    }

    async _resolveNFTTokenStandard(bytecode: string): Promise<string> {
        if (!bytecode) return 'unknown'
        if (isContractERC721(bytecode)) return 'erc721'
        if (isContractERC1155(bytecode)) return 'erc1155'
        return 'unknown'
    }
}

export function getSeedNftTablesWorker(): SeedNftTablesWorker {
    return new SeedNftTablesWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}