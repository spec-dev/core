import {
    NewReportedHead,
    logger,
    numberToHex,
    SharedTables,
    StringKeyMap,
    contractNamespaceForChainId,
    saveBlockEvents,
    saveBlockCalls,
    Erc20Token,
    Erc20Balance,
    fullErc20TokenUpsertConfig,
    fullErc20BalanceUpsertConfig,
    NftCollection,
    fullNftCollectionUpsertConfig,
    fullTokenTransferUpsertConfig,
    uniqueByKeys,
    TokenTransfer,
    snakeToCamel,
    stripLeadingAndTrailingUnderscores,
    toChunks,
    canBlockBeOperatedOn,
    sleep,
    randomIntegerInRange,
    ContractInstance,
    toNamespacedVersion,
    In,
    Abi,
    CoreDB,
} from '../../../shared'
import config from '../config'
import short from 'short-uuid'
import { Pool } from 'pg'
import { reportBlockEvents } from '../events'
import chalk from 'chalk'
import { ident } from 'pg-format'

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

class AbstractIndexer {
    head: NewReportedHead

    timedOut: boolean = false

    resolvedBlockHash: string | null

    blockUnixTimestamp: number | null

    contractEventNsp: string

    pool: Pool

    erc20Tokens: Erc20Token[] = []

    erc20Balances: Erc20Balance[] = []

    tokenTransfers: TokenTransfer[] = []

    nftCollections: NftCollection[] = []

    saving: boolean = false

    get chainId(): string {
        return this.head.chainId
    }

    get blockNumber(): number {
        return this.head.blockNumber
    }

    get hexBlockNumber(): string {
        return numberToHex(this.blockNumber)
    }

    get blockHash(): string | null {
        return this.resolvedBlockHash || this.head.blockHash
    }

    get logPrefix(): string {
        return `[${this.chainId}:${this.blockNumber}]`
    }

    get pgBlockTimestamp(): string {
        return `timezone('UTC', to_timestamp(${this.blockUnixTimestamp}))`
    }

    constructor(head: NewReportedHead) {
        this.head = head
        this.resolvedBlockHash = null
        this.blockUnixTimestamp = null
        this.contractEventNsp = contractNamespaceForChainId(this.chainId)
        this.pool = new Pool({
            host: config.SHARED_TABLES_DB_HOST,
            port: config.SHARED_TABLES_DB_PORT,
            user: config.SHARED_TABLES_DB_USERNAME,
            password: config.SHARED_TABLES_DB_PASSWORD,
            database: config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            connectionTimeoutMillis: 60000,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async perform(): Promise<StringKeyMap | void> {
        console.log('')
        config.IS_RANGE_MODE ||
            logger.info(
                `${this.logPrefix} Indexing block ${this.blockNumber}...`
            )

        if (this.head.replace) {
            this._info(chalk.magenta(`REORG: Replacing block ${this.blockNumber} with (${this.blockHash.slice(0, 10)})...`))
        }
    }

    async _kickBlockDownstream(eventSpecs: StringKeyMap[], callSpecs: StringKeyMap[]) {
        if (!(await this._shouldContinue())) {
            this._info(chalk.yellow('Job stopped mid-indexing inside _kickBlockDownstream.'))
            return
        }

        await Promise.all([
            saveBlockEvents(this.chainId, this.blockNumber, eventSpecs),
            saveBlockCalls(this.chainId, this.blockNumber, callSpecs),
        ])

        await reportBlockEvents(this.blockNumber)
    }

    async _blockAlreadyExists(schema: string): Promise<boolean> {
        try {
            return (
                await SharedTables.query(
                    `SELECT EXISTS (SELECT 1 FROM ${schema}.blocks where number = $1)`,
                    [this.blockNumber]
                )
            )[0]?.exists
        } catch (err) {
            this._error(err)
            return false
        }
    }

    async _getContractInstancesForAddresses(addresses: string[]): Promise<ContractInstance[]> {
        let contractInstances = []
        try {
            contractInstances = await contractInstancesRepo().find({
                relations: { contract: { namespace: true } },
                where: {
                    address: In(addresses),
                    chainId: this.chainId,
                }
            })
        } catch (err) {
            this._error(`Error getting contract_instances: ${err}`)
            return []
        }
        return contractInstances || []        
    }

    async _getDetectedContractEventSpecs(
        decodedLogs: StringKeyMap[], 
        contractInstances: ContractInstance[],
        namespacedContractGroupAbis: { [key: string]: Abi },
    ): Promise<StringKeyMap[]> {
        const contractGroupsHoldingAddress = {}
        for (const contractInstance of contractInstances) {
            const address = contractInstance.address
            const nsp = contractInstance.contract?.namespace?.name
            const contractGroupAbi = namespacedContractGroupAbis[nsp]
            if (!contractGroupAbi) continue
        
            contractGroupsHoldingAddress[address] = contractGroupsHoldingAddress[address] || []
            contractGroupsHoldingAddress[address].push({
                nsp,
                contractGroupAbi,
                contractInstanceName: contractInstance.name,
            })
        }
        if (!Object.keys(contractGroupsHoldingAddress).length) return []

        const eventSpecs = []
        for (const decodedLog of decodedLogs) {
            const { eventName, topic0, address } = decodedLog
            const contractGroups = contractGroupsHoldingAddress[address] || []
            if (!contractGroups.length) continue

            for (const { nsp, contractGroupAbi, contractInstanceName } of contractGroups) {
                const formattedEventData = this._formatLogAsSpecEvent(
                    decodedLog, 
                    contractGroupAbi,
                    contractInstanceName,
                )
                if (!formattedEventData) continue
                const { eventOrigin, data } = formattedEventData
                eventSpecs.push({
                    origin: eventOrigin,
                    name: toNamespacedVersion(nsp, eventName, topic0),
                    data,
                })    
            }
        }
        return eventSpecs
    }

    async _getDetectedContractCallSpecs(
        decodedTraceCalls: StringKeyMap[], 
        contractInstances: ContractInstance[],
        namespacedContractGroupAbis: { [key: string]: Abi },
    ): Promise<StringKeyMap[]> {
        const contractGroupsHoldingAddress = {}
        for (const contractInstance of contractInstances) {
            const address = contractInstance.address
            const nsp = contractInstance.contract?.namespace?.name
            const contractGroupAbi = namespacedContractGroupAbis[nsp]
            if (!contractGroupAbi) continue
        
            contractGroupsHoldingAddress[address] = contractGroupsHoldingAddress[address] || []
            contractGroupsHoldingAddress[address].push({
                nsp,
                contractGroupAbi,
                contractInstanceName: contractInstance.name,
            })
        }
        if (!Object.keys(contractGroupsHoldingAddress).length) return []

        const callSpecs = []
        for (const decodedTrace of decodedTraceCalls) {
            const { functionName, input, to } = decodedTrace
            const signature = input?.slice(0, 10)
            const contractGroups = contractGroupsHoldingAddress[to] || []
            if (!contractGroups.length) continue

            for (const { nsp, contractGroupAbi, contractInstanceName } of contractGroups) {
                const formattedCallData = this._formatTraceAsSpecCall(
                    decodedTrace, 
                    signature,
                    contractGroupAbi,
                    contractInstanceName,
                )
                if (!formattedCallData) continue
                const { 
                    callOrigin,
                    inputs,
                    inputArgs,
                    outputs,
                    outputArgs,
                } = formattedCallData
                callSpecs.push({
                    origin: callOrigin,
                    name: toNamespacedVersion(nsp, functionName, signature),
                    inputs,
                    inputArgs,
                    outputs,
                    outputArgs,
                })
            }
        }
        return callSpecs
    }

    _formatLogAsSpecEvent(
        log: StringKeyMap, 
        contractGroupAbi: Abi,
        contractInstanceName: string,
    ): StringKeyMap | null {
        const eventOrigin = {
            contractAddress: log.address,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
            signature: log.topic0,
            blockHash: log.blockHash,
            blockNumber: Number(log.blockNumber),
            blockTimestamp: log.blockTimestamp.toISOString(),
            chainId: this.chainId,
        }
        
        const fixedContractEventProperties = {
            ...eventOrigin,
            contractName: contractInstanceName,
            logIndex: log.logIndex,
        }

        const groupAbiItem = contractGroupAbi.find(item => item.signature === log.topic0)
        if (!groupAbiItem) return null

        const groupArgNames = (groupAbiItem.inputs || []).map(input => input.name).filter(v => !!v)
        const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
        if (logEventArgs.length !== groupArgNames.length) return null

        const eventProperties = []
        for (let i = 0; i < logEventArgs.length; i++) {
            const arg = logEventArgs[i]
            if (!arg) return null

            const argName = groupArgNames[i]
            if (!argName) return null

            eventProperties.push({
                name: snakeToCamel(stripLeadingAndTrailingUnderscores(argName)),
                value: arg.value,
            })
        }
        
        // Ensure event arg property names are unique.
        const seenPropertyNames = new Set(Object.keys(fixedContractEventProperties))
        for (const property of eventProperties) {
            let propertyName = property.name
            while (seenPropertyNames.has(propertyName)) {
                propertyName = '_' + propertyName
            }
            seenPropertyNames.add(propertyName)
            property.name = propertyName
        }

        const data = {
            ...fixedContractEventProperties
        }
        for (const property of eventProperties) {
            data[property.name] = property.value
        }

        return { data, eventOrigin }
    }

    _formatTraceAsSpecCall(
        trace: StringKeyMap,
        signature: string,
        contractGroupAbi: Abi,
        contractInstanceName: string,
    ): StringKeyMap {
        const callOrigin = {
            contractAddress: trace.to,
            contractName: contractInstanceName,
            transactionHash: trace.transactionHash,
            transactionIndex: trace.transactionIndex,
            traceIndex: trace.traceIndex,
            signature,
            blockHash: trace.blockHash,
            blockNumber: Number(trace.blockNumber),
            blockTimestamp: trace.blockTimestamp.toISOString(),
            chainId: this.chainId,
        }

        const groupAbiItem = contractGroupAbi.find(item => item.signature === signature)
        if (!groupAbiItem) return null

        const groupArgNames = (groupAbiItem.inputs || []).map(input => input.name)
        const functionArgs = (trace.functionArgs || []) as StringKeyMap[]
        const inputs = {}
        const inputArgs = []
        for (let i = 0; i < functionArgs.length; i++) {
            const arg = functionArgs[i]
            if (!arg) return null

            const argName = groupArgNames[i]
            if (argName) {
                inputs[argName] = arg.value
            }

            inputArgs.push(arg.value)
        }

        const groupOutputNames = (groupAbiItem.outputs || []).map(output => output.name)
        const functionOutputs = (trace.functionOutputs || []) as StringKeyMap[]
        const outputs = {}
        const outputArgs = []
        for (let i = 0; i < functionOutputs.length; i++) {
            const output = functionOutputs[i]
            if (!output) return null

            const outputName = groupOutputNames[i]
            if (outputName) {
                outputs[outputName] = output.value
            }

            outputArgs.push(output.value)
        }

        return {
            callOrigin,
            inputs,
            inputArgs,
            outputs,
            outputArgs,
        }
    }

    async _upsertErc20Tokens(erc20Tokens: Erc20Token[], tx: any) {
        if (!erc20Tokens.length) return
        const [updateCols, conflictCols] = fullErc20TokenUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."erc20_tokens"."last_updated" < excluded.last_updated`
        const blockTimestamp = this.pgBlockTimestamp
        erc20Tokens = uniqueByKeys(erc20Tokens, conflictCols.map(snakeToCamel)) as Erc20Token[]

        this.erc20Tokens = ((
            await tx
                .createQueryBuilder()
                .insert()
                .into(Erc20Token)
                .values(erc20Tokens.map((c) => ({ 
                    ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .onConflict(
                    `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                )
                .returning('*')
                .execute()
        ).generatedMaps || []).filter(t => t && !!Object.keys(t).length) as Erc20Token[]
    }

    async _upsertErc20Balances(erc20Balances: Erc20Balance[], tx: any) {
        if (!erc20Balances.length) return
        const [updateCols, conflictCols] = fullErc20BalanceUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."erc20_balance"."block_timestamp" < excluded.block_timestamp and "tokens"."erc20_balance"."balance" != excluded.balance`
        const blockTimestamp = this.pgBlockTimestamp
        erc20Balances = uniqueByKeys(erc20Balances, conflictCols.map(snakeToCamel)) as Erc20Balance[]
        this.erc20Balances = ((
            await tx
                .createQueryBuilder()
                .insert()
                .into(Erc20Balance)
                .values(erc20Balances.map((b) => ({ 
                    ...b, 
                    blockTimestamp: () => blockTimestamp,
                })))
                .onConflict(
                    `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                )
                .returning('*')
                .execute()
        ).generatedMaps || []).filter(t => t && !!Object.keys(t).length) as Erc20Balance[]
    }
    
    async _upsertNftCollections(nftCollections: NftCollection[], tx: any) {
        if (!nftCollections.length) return
        const [updateCols, conflictCols] = fullNftCollectionUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."nft_collections"."last_updated" < excluded.last_updated`
        const blockTimestamp = this.pgBlockTimestamp
        nftCollections = uniqueByKeys(nftCollections, conflictCols.map(snakeToCamel)) as NftCollection[]
        this.nftCollections = ((
            await tx
                .createQueryBuilder()
                .insert()
                .into(NftCollection)
                .values(nftCollections.map((c) => ({ ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .onConflict(
                    `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                )
                .returning('*')
                .execute()
        ).generatedMaps || []).filter(n => n && !!Object.keys(n).length) as NftCollection[]
    }

    async _upsertTokenTransfers(tokenTransfers: TokenTransfer[], tx: any) {
        if (!tokenTransfers.length) return
        const [updateCols, conflictCols] = fullTokenTransferUpsertConfig()
        const blockTimestamp = this.pgBlockTimestamp
        tokenTransfers = uniqueByKeys(tokenTransfers, conflictCols.map(snakeToCamel)) as TokenTransfer[]
        this.tokenTransfers = (
            await Promise.all(
                toChunks(tokenTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(TokenTransfer)
                        .values(chunk.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps || [])
            .flat() as TokenTransfer[]
    }

    async _bulkUpdateErc20TokensTotalSupply(updates: StringKeyMap[], timestamp: string, attempt: number = 1) {
        if (!updates.length) return
        const tempTableName = `erc20_tokens_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const { id, totalSupply } of updates) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
            insertBindings.push(...[id, totalSupply, timestamp])
            i += 3
        }
        
        let error
        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id integer primary key, total_supply character varying, last_updated timestamp with time zone) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(`INSERT INTO ${tempTableName} (id, total_supply, last_updated) VALUES ${insertPlaceholders.join(', ')}`, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_tokens SET total_supply = ${tempTableName}.total_supply, last_updated = ${tempTableName}.last_updated FROM ${tempTableName} WHERE tokens.erc20_tokens.id = ${tempTableName}.id and tokens.erc20_tokens.last_updated < ${tempTableName}.last_updated`
            )
            await client.query('COMMIT')
        } catch (err) {
            await client.query('ROLLBACK')
            this._error(`Error bulk updating ERC-20 Tokens`, updates, err)
            error = err
        } finally {
            client.release()
        }
        if (!error) return

        const message = error.message || error.toString() || ''
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            this._error(`Got deadlock ("tokens"."erc20_tokens"). Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`)
            await sleep(randomIntegerInRange(50, 500))
            return await this._bulkUpdateErc20TokensTotalSupply(updates, timestamp, attempt + 1)
        }
        
        throw error
    }

    /**
     * Checks to see if this service should continue or if there was a re-org 
     * back to a previous block number -- in which case everything should stop.
     */
    async _shouldContinue(): Promise<boolean> {
        if (this.timedOut) {
            this._notify(chalk.yellow(`Job timed out.`))
            return false
        }
        if (config.IS_RANGE_MODE || this.head.force) return true
        return await canBlockBeOperatedOn(this.chainId, this.blockNumber)
    }

    async _info(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.info(`${this.logPrefix} ${msg}`, ...args)
    }

    async _notify(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.notify(`${this.logPrefix} ${msg}`, ...args)
    }

    async _warn(msg: any, ...args: any[]) {
        logger.warn(`${this.logPrefix} ${chalk.yellow(msg)}`, ...args)
    }

    async _error(msg: any, ...args: any[]) {
        logger.error(`${this.logPrefix} ${chalk.red(msg)}`, ...args)
    }
}

export default AbstractIndexer
