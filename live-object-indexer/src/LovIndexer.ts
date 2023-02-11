import { snakeToCamel, sleep, newTablesJWT, stripLeadingAndTrailingUnderscores, logger, schemaForChainId, CoreDB, toNamespacedVersion, SharedTables, StringKeyMap, EventVersion, LiveObjectVersion, ContractInstance, unique, In, updateLiveObjectVersionStatus, LiveObjectVersionStatus, toChunks } from '../../shared'
import config from './config'
import { ident, literal } from 'pg-format'
import { camelizeKeys } from 'humps'
import fetch from 'cross-fetch'

const lovRepo = () => CoreDB.getRepository(LiveObjectVersion)
const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

class LovIndexer {

    id: number

    offset: number

    liveObjectVersion: LiveObjectVersion

    namespacedLov: string
    
    inputContractEventVersions: EventVersion[] = []

    inputEventsQueryComps: string[] = []

    contractData: StringKeyMap = {}

    chainId: string

    schema: string
    
    tablesApiToken: string

    constructor(id: number) {
        this.id = id
        this.offset = 0
        this.liveObjectVersion = null
        this.namespacedLov = null
        this.inputContractEventVersions = []
        this.chainId = null
        this.schema = null
        this.tablesApiToken = null
    }

    async run() {
        await this._getLiveObjectVersionWithContractInputEvents()
        await this._getContractInstancesForInputEventVersions()
        await updateLiveObjectVersionStatus(this.id, LiveObjectVersionStatus.Indexing)
        await this._indexInBlockRanges()
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

    async _getLiveObjectVersionWithContractInputEvents() {
        this.liveObjectVersion = await lovRepo().findOne({
            relations: { liveEventVersions: { eventVersion: { event: true } } },
            where: { id: this.id }
        })

        this.namespacedLov = toNamespacedVersion(
            this.liveObjectVersion.nsp,
            this.liveObjectVersion.name,
            this.liveObjectVersion.version,
        )

        this.inputContractEventVersions = this.liveObjectVersion.liveEventVersions
            .filter(lev => lev.isInput)
            .map(lev => lev.eventVersion)
            .filter(ev => ev.event.isContractEvent)

        this.tablesApiToken = newTablesJWT(this.liveObjectVersion.config.table.split('.')[0], '10d')
    }

    async _getContractInstancesForInputEventVersions() {
        const uniqueNamespaceIds = unique(this.inputContractEventVersions.map(ev => ev.event.namespaceId))
        const contractInstances = await contractInstancesRepo().find({
            relations: { contract: { namespace: true } },
            where: { contract: { namespaceId: In(uniqueNamespaceIds) } }
        })

        this.chainId = contractInstances[0].chainId
        this.schema = schemaForChainId[this.chainId]

        const contractInstanceAddressesByNamespaceId = {}
        for (const contractInstance of contractInstances) {
            this.contractData[contractInstance.address] = {
                name: contractInstance.name,
                nsp: contractInstance.contract.namespace.name,
            }

            const namespaceId = contractInstance.contract.namespaceId
            if (!contractInstanceAddressesByNamespaceId.hasOwnProperty(namespaceId)) {
                contractInstanceAddressesByNamespaceId[namespaceId] = []
            }
            contractInstanceAddressesByNamespaceId[namespaceId].push(contractInstance.address)
        }

        const inputEventData = []
        const inputEventsQueryComps = []
        const addressesSet = new Set()
        for (const eventVersion of this.inputContractEventVersions) {
            const addresses = contractInstanceAddressesByNamespaceId[eventVersion.event.namespaceId] || []
            if (!addresses.length) continue
            inputEventData.push({ eventVersion, addresses })
            addresses.map(a => addressesSet.add(a))
            inputEventsQueryComps.push(
                `(event_name = ${literal(eventVersion.name)} and address in (${addresses.map(literal).join(', ')}))`
            )
        }
        
        if (addressesSet.size === 1) {
            const address = Array.from(addressesSet)[0]
            const eventNames = inputEventData.map(v => v.eventVersion.name)
            this.inputEventsQueryComps = [`address = ${literal(address)} and event_name in (${eventNames.map(literal).join(', ')})`]
        } else {
            this.inputEventsQueryComps = inputEventsQueryComps
        }
    }

    async _getNextEventLogsBatch(): Promise<[StringKeyMap[], boolean]> {
        const limit = config.BLOCK_RANGE_SIZE
        logger.info(`${this.offset} -> ${this.offset + limit}`)

        const logs = this._sortEventLogs(((await SharedTables.query(
            `select * from ${ident(this.schema)}.${ident('logs')} where ${this.inputEventsQueryComps.join(' or ')} order by block_number asc offset ${this.offset} limit ${limit}`
        )) || []).map(r => camelizeKeys(r)))

        const isLastBatch = logs.length < limit
        this.offset += logs.length

        if (!logs.length) return [[], true]

        const uniqueTxHashes = unique(logs.map(log => log.transactionHash))
        const placeholders = []
        let i = 1
        for (const _ of uniqueTxHashes) {
            placeholders.push(`$${i}`)
            i++
        }
        const txResults = await SharedTables.query(
            `select hash, status from ${ident(this.schema)}.${ident('transactions')} where hash in (${placeholders.join(', ')})`,
            uniqueTxHashes,
        )
        const successfulTxHashes = new Set(
            txResults.filter(tx => tx.status != 0).map(tx => tx.hash)
        )
        const successfulLogs = logs.filter(log => successfulTxHashes.has(log.transactionHash))

        return [successfulLogs, isLastBatch]
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