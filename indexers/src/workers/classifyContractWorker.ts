import config from '../config'
import {
    logger,
    range,
    SharedTables,
    In,
    EthContract,
    getAbis,
    Abi,
    AbiItemType,
} from '../../../shared'
import { exit } from 'process'
import { Pool } from 'pg'
import short from 'short-uuid'
import { isContractERC20, isContractERC721, isContractERC1155 } from '../services/contractServices'

const contractsRepo = () => SharedTables.getRepository(EthContract)

class ClassifyContractWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    contractsToSave: EthContract[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.contractsToSave = []

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
        if (this.contractsToSave.length) {
            await this._updateContracts(this.contractsToSave)
            this.contractsToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get contracts for this block range.
        let contracts = await this._getContractsForBlocks(numbers)
        if (!contracts.length) return

        const addresses = contracts.map(c => c.address)
        const abis = await getAbis(addresses)

        // Classify contracts
        contracts = this._classifyContracts(contracts, abis || {})
        this.contractsToSave.push(...contracts)

        if (this.contractsToSave.length >= 5000) {
            await this._updateContracts(this.contractsToSave)
            this.contractsToSave = []
        }
    }

    async _updateContracts(contracts: EthContract[]) {
        const tempTableName = `contracts_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const contract of contracts) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
            insertBindings.push(...[contract.address, contract.isERC20, contract.isERC721, contract.isERC1155])
            i += 4
        }
        const insertQuery = `INSERT INTO ${tempTableName} (address, is_erc20, is_erc721, is_erc1155) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (address character varying(50) primary key, is_erc20 boolean, is_erc721 boolean, is_erc1155 boolean) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE ethereum.contracts SET is_erc20 = ${tempTableName}.is_erc20, is_erc721 = ${tempTableName}.is_erc721, is_erc1155 = ${tempTableName}.is_erc1155 FROM ${tempTableName} WHERE ethereum.contracts.address = ${tempTableName}.address`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error(e)
        } finally {
            client.release()
        }
    }

    _classifyContracts(contracts: EthContract[], abis: { [key: string]: Abi }): EthContract[] {
        return contracts.map(contract => {
            let functionSignatures = null

            const abi = abis[contract.address]
            if (abi && abi.length) {
                functionSignatures = abi
                    .filter(item => item.type === AbiItemType.Function && !!item.signature)
                    .map(item => item.signature)
            }

            contract.isERC20 = isContractERC20(contract.bytecode, functionSignatures)
            contract.isERC721 = isContractERC721(contract.bytecode, functionSignatures)
            contract.isERC1155 = isContractERC1155(contract.bytecode, functionSignatures)

            return contract
        })
    }

    async _getContractsForBlocks(numbers: number[]): Promise<EthContract[]> {
        try {
            return (
                (await contractsRepo().find({
                    select: { address: true, bytecode: true },
                    where: {
                        blockNumber: In(numbers),
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting contracts: ${err}`)
            return []
        }
    }
}

export function getClassifyContractWorker(): ClassifyContractWorker {
    return new ClassifyContractWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}