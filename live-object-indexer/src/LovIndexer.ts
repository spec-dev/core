import { snakeToCamel, sleep, newTablesJWT, stripLeadingAndTrailingUnderscores, logger, schemaForChainId, CoreDB, toNamespacedVersion, SharedTables, StringKeyMap, EventVersion, LiveObjectVersion, ContractInstance, unique, In, updateLiveObjectVersionStatus, LiveObjectVersionStatus, toChunks, LiveCallHandler } from '../../shared'
import config from './config'
import { ident, literal } from 'pg-format'
import { camelizeKeys } from 'humps'
import fetch from 'cross-fetch'

const lovRepo = () => CoreDB.getRepository(LiveObjectVersion)
const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

class LovIndexer {

    id: number

    offset: number

    startBlockNumber: number

    liveObjectVersion: LiveObjectVersion

    namespacedLov: string

    chainInputs: StringKeyMap = {}
    
    queryCursors: StringKeyMap = {}

    // inputEventsQueryComps: string[] = []

    contractData: StringKeyMap = {}

    tablesApiToken: string

    constructor(id: number, offset?: number, startBlockNumber?: number) {
        this.id = id
        this.offset = offset || 0
        this.startBlockNumber = startBlockNumber || 0
        this.liveObjectVersion = null
        this.namespacedLov = null
        this.tablesApiToken = null
    }

    async run() {
        await this._getLovInputs()
        this._buildQueryCursors()
        console.log(JSON.stringify(this.queryCursors, null, 4))
        // this.tablesApiToken = newTablesJWT(this.liveObjectVersion.config.table.split('.')[0], '10d')
        // await updateLiveObjectVersionStatus(this.id, LiveObjectVersionStatus.Indexing)
        // await this._indexInBlockRanges()
    }

    async _indexInBlockRanges() {
        while (true) {
            const [eventLogs, done] = await this._getNextEventLogsBatch()
            await this._processEventLogs(eventLogs)
            if (done) {
                const [_, reallyDone] = await this._getNextEventLogsBatch()
                if (reallyDone) break
            }
        }
        logger.info(`Done. Setting ${this.namespacedLov} to "live".`)
        await updateLiveObjectVersionStatus(this.id, LiveObjectVersionStatus.Live)
    }

    async _processEventLogs(eventLogs: StringKeyMap[]) {
        if (!eventLogs.length) return
        const eventSpecs = this._buildContractEventSpecs(eventLogs)
        const eventBatches = toChunks(eventSpecs, 100)

        for (const events of eventBatches) {
            await this._sendInputEventsToLov(events)
        }
    }

    _buildContractEventSpecs(eventLogs: StringKeyMap[]): StringKeyMap[] {
        const eventSpecs = []
        for (const log of eventLogs) {
            const { name: contractInstanceName, nsp } = this.contractData[log.address]
            const { data, eventOrigin } = this._formatLogAsSpecEvent(log, contractInstanceName)
            eventSpecs.push({
                origin: eventOrigin,
                name: toNamespacedVersion(nsp, log.eventName, '0.0.1'),
                data: data,
            })
        }
        return eventSpecs
    }

    async _sendInputEventsToLov(events: StringKeyMap[], attempts: number = 0) {
        const headers = {
            [config.EVENT_GEN_AUTH_HEADER_NAME]: config.EVENT_GENERATORS_JWT,
            [config.TABLES_AUTH_HEADER_NAME]: this.tablesApiToken,
        }

        let resp
        try {
            resp = await fetch(this.liveObjectVersion.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(events),
            })
        } catch (err) {
            logger.error(`Request error to ${this.liveObjectVersion.url} (lovId=${this.id}): ${err}`)
            if (attempts <= 10) {
                await sleep(2000)
                this._sendInputEventsToLov(events, attempts + 1)
            } else {
                throw err
            }
        }

        let respData
        try {
            respData = (await resp?.json()) || []
        } catch (err) {
            logger.error(`Failed to parse JSON response (lovId=${this.id}): ${err}`)
        }
        if (resp?.status !== 200) {
            const msg = `Request to ${this.liveObjectVersion.url} (lovId=${this.id}) failed with status ${resp?.status}: ${JSON.stringify(respData || [])}.`
            logger.error(msg)
            if (attempts <= 10) {
                await sleep(2000)
                this._sendInputEventsToLov(events, attempts + 1)
            } else {
                throw msg
            }
        }
    }

    _formatLogAsSpecEvent(log: StringKeyMap, contractInstanceName: string): StringKeyMap {
        const eventOrigin = {
            contractAddress: log.address,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
            blockHash: log.blockHash,
            blockNumber: Number(log.blockNumber),
            blockTimestamp: log.blockTimestamp.toISOString(),
            // @ts-ignore
            chainId: this.chainId,
        }
        
        const fixedContractEventProperties = {
            ...eventOrigin,
            contractName: contractInstanceName,
            logIndex: log.logIndex,
        }

        const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
        const eventProperties = []
        for (const arg of logEventArgs) {
            if (!arg.name) continue
            eventProperties.push({
                name: snakeToCamel(stripLeadingAndTrailingUnderscores(arg.name)),
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

    async _getLovInputs() {
        this.liveObjectVersion = await lovRepo().findOne({
            relations: { 
                liveEventVersions: { eventVersion: { event: true } },
                liveCallHandlers: { namespace: { contracts: { contractInstances: true } } },
            },
            where: { id: this.id }
        })

        this.namespacedLov = toNamespacedVersion(
            this.liveObjectVersion.nsp,
            this.liveObjectVersion.name,
            this.liveObjectVersion.version,
        )

        const inputContractEventVersions = this.liveObjectVersion.liveEventVersions
            .filter(lev => lev.isInput)
            .map(lev => lev.eventVersion)
            .filter(ev => ev.event.isContractEvent)

        const uniqueEventNamespaceIds = unique(inputContractEventVersions.map(ev => ev.event.namespaceId))

        const eventContractInstances = await contractInstancesRepo().find({
            relations: { contract: { namespace: true } },
            where: { contract: { namespaceId: In(uniqueEventNamespaceIds) } }
        })

        const eventContractInstancesByNamespaceId = {}
        for (const contractInstance of eventContractInstances) {
            this.contractData[contractInstance.address] = {
                name: contractInstance.name,
                nsp: contractInstance.contract.namespace.name,
                chainId: contractInstance.chainId,
            }

            const namespaceId = contractInstance.contract.namespaceId
            if (!eventContractInstancesByNamespaceId.hasOwnProperty(namespaceId)) {
                eventContractInstancesByNamespaceId[namespaceId] = []
            }
            eventContractInstancesByNamespaceId[namespaceId].push({
                chainId: contractInstance.chainId,
                contractAddress: contractInstance.address,
            })
        }

        for (const eventVersion of inputContractEventVersions) {
            const eventContractInstance = eventContractInstancesByNamespaceId[eventVersion.event.namespaceId] || []
            if (!eventContractInstance.length) continue

            eventContractInstance.forEach(({ chainId, contractAddress }) => {
                this.chainInputs[chainId] = this.chainInputs[chainId] || {}
                this.chainInputs[chainId].inputEventData = this.chainInputs[chainId].inputEventData || {}

                if (!this.chainInputs[chainId].inputEventData[eventVersion.id]) {
                    this.chainInputs[chainId].inputEventData[eventVersion.id] = {
                        eventVersion,
                        contractAddresses: []
                    }
                }

                this.chainInputs[chainId].inputEventData[eventVersion.id].contractAddresses.push(contractAddress)
            })
        }
    
        const inputContractFunctions = this.liveObjectVersion.liveCallHandlers.map(call => {
            const contractNamespace = call.namespace.contracts[0]
            if (!contractNamespace) return []

            return contractNamespace.contractInstances.map(contractInstance => ({
                chainId: contractInstance.chainId,
                contractAddress: contractInstance.address,
                funtionName: call.functionName,
            }))
        }).flat() as StringKeyMap[]

        for (const inputContractFunction of inputContractFunctions) {
            const { chainId, contractAddress, functionName } = inputContractFunction
            this.chainInputs[chainId] = this.chainInputs[chainId] || {}
            this.chainInputs[chainId].inputFunctionData = this.chainInputs[chainId].inputFunctionData || []
            this.chainInputs[chainId].inputFunctionData.push({ contractAddress, functionName })
        }
    }

    _buildQueryCursors() {        
        for (const chainId in this.chainInputs) {
            // Turn input events into a combined *.logs query.
            const inputEvents = Object.values(this.chainInputs[chainId].inputEventData || {}) as StringKeyMap[]
            let inputEventsQueryComps = []
            const uniqueEventContractAddresses = new Set()
            for (const { eventVersion, contractAddresses } of inputEvents) {
                if (!contractAddresses.length) continue
                contractAddresses.forEach(a => uniqueEventContractAddresses.add(a))
                inputEventsQueryComps.push(
                    `(event_name = ${literal(eventVersion.name)} and address in (${contractAddresses.map(literal).join(', ')}))`
                )
            }
            if (uniqueEventContractAddresses.size === 1) {
                const address = Array.from(uniqueEventContractAddresses)[0]
                const eventNames = inputEvents.map(({ eventVersion }) => eventVersion.name)
                inputEventsQueryComps = [`address = ${literal(address)} and event_name in (${eventNames.map(literal).join(', ')})`]
            }

            // Turn input functions into a combined *.traces query.
            const inputFunctionData = this.chainInputs[chainId].inputFunctionData || []
            const inputFunctionsQueryComps = inputFunctionData.map(({ functionName, contractAddress }) => (
                `(function_name = ${literal(functionName)} and "to" = ${literal(contractAddress)})`
            ))

            this.queryCursors[chainId] = {
                inputEventsQueryComps,
                inputFunctionData: 
            }
        }
    }

    // async _getContractInstancesForInputEventVersions() {
    //     const uniqueNamespaceIds = unique(this.inputContractEventVersions.map(ev => ev.event.namespaceId))

    //     const contractInstances = await contractInstancesRepo().find({
    //         relations: { contract: { namespace: true } },
    //         where: { contract: { namespaceId: In(uniqueNamespaceIds) } }
    //     })

    //     const eventContractInstancesByNamespaceId = {}
    //     for (const contractInstance of contractInstances) {
    //         this.contractData[contractInstance.address] = {
    //             name: contractInstance.name,
    //             nsp: contractInstance.contract.namespace.name,
    //             chainId: contractInstance.chainId,
    //         }

    //         const namespaceId = contractInstance.contract.namespaceId
    //         if (!eventContractInstancesByNamespaceId.hasOwnProperty(namespaceId)) {
    //             eventContractInstancesByNamespaceId[namespaceId] = []
    //         }
    //         eventContractInstancesByNamespaceId[namespaceId].push({
    //             chainId: contractInstance.chainId,
    //             contractAddress: contractInstance.address,
    //         })
    //     }

    //     const inputEventsQueryComps = []
    //     const chainInputs = {}
    //     for (const eventVersion of this.inputContractEventVersions) {
    //         const contractInstances = eventContractInstancesByNamespaceId[eventVersion.event.namespaceId] || []
    //         if (!contractInstances.length) continue
    //         contractInstances.forEach(({ chainId, contractAddress }) => {
    //             chainInputs[chainId] = chainInputs[chainId] || {}
    //             chainInputs[chainId].inputEventData = chainInputs[chainId].inputEventData || {}
    //             if (!chainInputs[chainId].inputEventData[eventVersion.id]) {
    //                 chainInputs[chainId].inputEventData[eventVersion.id] = {
    //                     eventVersion,
    //                     contractAddresses: []
    //                 }
    //             }
    //             chainInputs[chainId].inputEventData[eventVersion.id].contractAddress.push(contractAddress)
    //         })
    //     }



    //     const x = {
    //         '1': {
    //             inputEventData: {
    //                 '2': {
    //                     eventVersion: {},
    //                     contractAddresses: ['0x...']
    //                 }
    //             },
    //             inputFunctionData: {

    //             }
    //         }
    //     }

    //     // inputEventsQueryComps.push(
    //     //     `(event_name = ${literal(eventVersion.name)} and address in (${addresses.map(literal).join(', ')}))`
    //     // )
        
    //     // if (addressesSet.size === 1) {
    //     //     const address = Array.from(addressesSet)[0]
    //     //     const eventNames = inputEventData.map(v => v.eventVersion.name)
    //     //     this.inputEventsQueryComps = [`address = ${literal(address)} and event_name in (${eventNames.map(literal).join(', ')})`]
    //     // } else {
    //     //     this.inputEventsQueryComps = inputEventsQueryComps
    //     // }
    // }

    async _getNextEventLogsBatch(): Promise<[StringKeyMap[], boolean]> {
        return [[], false]
        // const limit = config.BLOCK_RANGE_SIZE
        // logger.info(`${this.offset} -> ${this.offset + limit}`)

        // const logs = this._sortEventLogs(((await SharedTables.query(
        //     `select * from ${ident(this.schema)}.${ident('logs')} where ${this.inputEventsQueryComps.join(' or ')} and block_number > ${this.startBlockNumber} order by block_number asc offset ${this.offset} limit ${limit}`
        // )) || []).map(r => camelizeKeys(r)))

        // const isLastBatch = logs.length < limit
        // this.offset += logs.length

        // if (!logs.length) return [[], true]

        // const uniqueTxHashes = unique(logs.map(log => log.transactionHash))
        // const placeholders = []
        // let i = 1
        // for (const _ of uniqueTxHashes) {
        //     placeholders.push(`$${i}`)
        //     i++
        // }
        // const txResults = await SharedTables.query(
        //     `select hash, status from ${ident(this.schema)}.${ident('transactions')} where hash in (${placeholders.join(', ')})`,
        //     uniqueTxHashes,
        // )
        // const successfulTxHashes = new Set(
        //     txResults.filter(tx => tx.status != 0).map(tx => tx.hash)
        // )
        // const successfulLogs = logs.filter(log => successfulTxHashes.has(log.transactionHash))

        // return [successfulLogs, isLastBatch]
    }

    _sortEventLogs(eventLogs: StringKeyMap[]): StringKeyMap[] {
        return eventLogs.sort((a, b) => (
            (Number(a.blockNumber) - Number(b.blockNumber)) || 
            (a.transactionIndex - b.transactionIndex) || 
            (Number(a.logIndex) - Number(b.logIndex))
        ))
    }

    // async _findStartBlock() {
    //     const results = (await SharedTables.query(
    //         `select block_number from ${ident(this.schema)}.${ident('logs')} where (${this.inputEventsQueryComps.join(' or ')}) order by block_number asc limit 1`
    //     )) || []
    //     const firstBlockNumber = Number((results[0])?.block_number)
    //     if (Number.isNaN(firstBlockNumber)) throw `No start block could be found`
    //     this.fromBlock = firstBlockNumber
    //     this.cursor = this.fromBlock
    // }

    // async _findLatestBlockNumber(): Promise<number> {
    //     const results = (await SharedTables.query(
    //         `select number from ${this.schema}.blocks order by number desc limit 1`
    //     )) || []
    //     return Number((results[0])?.number)
    // }
}

export default LovIndexer