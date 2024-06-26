import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    fullErc20TokenUpsertConfig,
    fullNftCollectionUpsertConfig,
    NftCollection,
    Erc20Token,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    snakeToCamel,
    sleep,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'
import { teardownWsProviderPool, createWsProviderPool } from '../wsProviderPool'
import { resolveNewTokenContracts } from '../services/contractServices'
import { teardownWeb3Provider, createWeb3Provider } from '../httpProviderPool'

class SeedTokenContractsWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    erc20Tokens: Erc20Token[]

    nftCollections: NftCollection[]

    iterations: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.erc20Tokens = []
        this.nftCollections = []
        this.iterations = 0
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.erc20Tokens.length) {
            logger.info(`Saving ${this.erc20Tokens.length} tokens...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Tokens(this.erc20Tokens, tx)
            })
        }

        if (this.nftCollections.length) {
            logger.info(`Saving ${this.nftCollections.length} collections...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertNftCollections(this.nftCollections, tx)
            })
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        this.iterations++
        if (this.iterations % 100 === 0) {
            teardownWeb3Provider()
            teardownWsProviderPool()
            await sleep(50)
            createWeb3Provider()
            createWsProviderPool()
            await sleep(50)
        }

        logger.info(`Indexing ${start} --> ${end}...`)

        // Get contracts for this block range.
        const contracts = await this._getContractsInBlockRange(start, end)
        if (!contracts.length) return

        // Init tokens for contracts.
        const [erc20Tokens, nftCollections] = await resolveNewTokenContracts(contracts, config.CHAIN_ID)
        await sleep(50)
        
        this.erc20Tokens.push(...erc20Tokens)
        this.nftCollections.push(...nftCollections)

        if (this.erc20Tokens.length >= 3000) {
            logger.info(`Saving ${this.erc20Tokens.length} tokens...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Tokens([...this.erc20Tokens], tx)
            })
            this.erc20Tokens = []
        }
        if (this.nftCollections.length >= 3000) {
            logger.info(`Saving ${this.nftCollections.length} collections...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertNftCollections([...this.nftCollections], tx)
            })
            this.nftCollections = []
        }
    }

    async _upsertErc20Tokens(erc20Tokens: Erc20Token[], tx: any) {
        if (!erc20Tokens.length) return
        const [_, conflictCols] = fullErc20TokenUpsertConfig()
        erc20Tokens = uniqueByKeys(erc20Tokens, conflictCols.map(snakeToCamel)) as Erc20Token[]
        await Promise.all(
            toChunks(erc20Tokens, 2000).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Token)
                    .values(chunk)
                    .orUpdate(['name', 'symbol', 'decimals', 'total_supply'], conflictCols)
                    .execute()
            })
        )
    }

    async _upsertNftCollections(nftCollections: NftCollection[], tx: any) {
        if (!nftCollections.length) return
        const [_, conflictCols] = fullNftCollectionUpsertConfig()
        nftCollections = uniqueByKeys(nftCollections, conflictCols.map(snakeToCamel)) as NftCollection[]
        await Promise.all(
            toChunks(nftCollections, 2000).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(NftCollection)
                    .values(chunk)
                    .orUpdate(['name', 'symbol', 'total_supply'], conflictCols)
                    .execute()
            })
        )
    }

    async _getContractsInBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('contracts')].join('.')
        const numberClause = 'block_number >= $1 and block_number <= $2'
        try {
            const results = (await SharedTables.query(
                `select * from ${table} where (is_erc20 = true and ${numberClause}) or (is_erc721 = true and ${numberClause}) or (is_erc1155 = true and ${numberClause})`,
                [start, end]
            )) || []
            return camelizeKeys(results).map(c => {
                c.isERC20 = c.isErc20
                c.isERC721 = c.isErc721
                c.isERC1155 = c.isErc1155
                return c
            }) as StringKeyMap[]
        } catch (err) {
            logger.error(`Error getting contracts: ${err}`)
            return []
        }
    }
}

export function getSeedTokenContractsWorker(): SeedTokenContractsWorker {
    return new SeedTokenContractsWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}