import config from '../config'
import {
    logger,
    range,
    SharedTables,
    Abi,
    In,
    EthLog,
    getAbis,
    StringKeyMap,
    formatAbiValueWithType,
    unique,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'
import { 
    decodeTransferEvent, 
    decodeTransferSingleEvent, 
    decodeTransferBatchEvent,
} from '../services/extractTransfersFromLogs'
import { 
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
} from '../utils/standardAbis'

const web3 = new Web3()

const logsRepo = () => SharedTables.getRepository(EthLog)

class DecodeLogWorker {
    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    logsToSave: EthLog[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.logsToSave = []

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
        if (this.logsToSave.length) {
            await this._updateLogs(this.logsToSave)
            this.logsToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get logs for this block range.
        let logs = await this._getEncodedLogsForBlocks(numbers)
        const numLogsForBlockRange = logs.length
        if (!numLogsForBlockRange) return

        // Get all abis for addresses needed to decode logs.
        const logAddresses = logs.map(l => l.address).filter(v => !!v)
        const abis = await getAbis(unique([ ...logAddresses ]))

        // Use abis to decode logs and report progress.
        logs = this._decodeLogs(logs, abis)
        if (!logs.length) return
        const pct = ((logs.length / numLogsForBlockRange) * 100).toFixed(2)
        logger.info(`    Decoded ${logs.length} / ${numLogsForBlockRange} (${pct}%)\n`)

        // Bulk update logs when enough have been decoded.
        this.logsToSave.push(...logs)
        if (this.logsToSave.length >= 5000) {
            await this._updateLogs(this.logsToSave)
            this.logsToSave = []
        }
    }

    async _updateLogs(logs: EthLog[]) {
        logger.info(`Saving ${logs.length} decoded logs...`)

        const tempTableName = `logs_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const log of logs) {
            let eventArgs
            try {
                eventArgs = log.eventArgs === null ? null : JSON.stringify(log.eventArgs)
            } catch (e) {
                continue
            }
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
            insertBindings.push(...[log.logIndex, log.transactionHash, log.eventName, eventArgs])
            i += 4
        }

        const insertQuery = `INSERT INTO ${tempTableName} (log_index, transaction_hash, event_name, event_args) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (log_index bigint not null, transaction_hash character varying(70) not null, event_name character varying, event_args json, CONSTRAINT ${tempTableName}_pk PRIMARY KEY (log_index, transaction_hash)) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE ethereum.logs SET event_name = ${tempTableName}.event_name, event_args = ${tempTableName}.event_args FROM ${tempTableName} WHERE ethereum.logs.log_index = ${tempTableName}.log_index AND ethereum.logs.transaction_hash = ${tempTableName}.transaction_hash`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error('Error saving decoded logs', e)
        } finally {
            client.release()
        }
    }

    _decodeLogs(logs: EthLog[], abis: { [key: string]: Abi }): EthLog[] {
        const decoded = []
        for (let log of logs) {            
            // Standard contract ABI decoding.
            if (log.address && log.topic0 && abis.hasOwnProperty(log.address)) {
                try {
                    log = this._decodeLog(log, abis[log.address])
                } catch (err) {
                    continue
                }
                if (!log) continue
            }

            // Try decoding as transfer event if couldn't decode with contract ABI.
            if (!log.eventName) {
                log = this._tryDecodingLogAsTransfer(log)
            }

            log?.eventName && decoded.push(log)
        }
        return decoded
    }

    _decodeLog(log: EthLog, abi: Abi): EthLog | null {
        const abiItem = abi.find(item => item.signature === log.topic0)
        if (!abiItem) return null

        const argNames = []
        const argTypes = []
        for (const input of abiItem.inputs || []) {
            input.name && argNames.push(input.name)
            argTypes.push(input.type)
        }
        if (argNames.length !== argTypes.length) {
            return null
        }

        const topics = []
        abiItem.anonymous && topics.push(log.topic0)
        log.topic1 && topics.push(log.topic1)
        log.topic2 && topics.push(log.topic2)
        log.topic3 && topics.push(log.topic3)

        const decodedArgs = web3.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
        const numArgs = parseInt(decodedArgs.__length__)

        const argValues = []
        for (let i = 0; i < numArgs; i++) {
            const stringIndex = i.toString()
            if (!decodedArgs.hasOwnProperty(stringIndex)) continue
            argValues.push(decodedArgs[stringIndex])
        }
        if (argValues.length !== argTypes.length) return null

        const eventArgs = []
        for (let j = 0; j < argValues.length; j++) {
            eventArgs.push({
                name: argNames[j],
                type: argTypes[j],
                value: formatAbiValueWithType(argValues[j], argTypes[j]),
            })
        }

        log.eventName = abiItem.name
        log.eventArgs = eventArgs

        // Ensure args are stringifyable.
        try {
            JSON.stringify(eventArgs)
        } catch (err) {
            log.eventArgs = null
        }

        return log
    }

    _tryDecodingLogAsTransfer(log: EthLog): EthLog | null {
        let eventName, eventArgs

        // Transfer
        if (log.topic0 === TRANSFER_TOPIC) {
            eventArgs = decodeTransferEvent(log, true)
            if (!eventArgs) return null
            eventName = TRANSFER_EVENT_NAME
        }

        // TransferSingle
        if (log.topic0 === TRANSFER_SINGLE_TOPIC) {
            eventArgs = decodeTransferSingleEvent(log, true)
            if (!eventArgs) return null
            eventName = TRANSFER_SINGLE_EVENT_NAME
        }

        // TransferBatch
        if (log.topic0 === TRANSFER_BATCH_TOPIC) {
            eventArgs = decodeTransferBatchEvent(log, true)
            if (!eventArgs) return null
            eventName = TRANSFER_BATCH_EVENT_NAME
        }

        if (!eventName) return null

        log.eventName = eventName
        log.eventArgs = eventArgs as StringKeyMap[]

        return log
    }

    async _getEncodedLogsForBlocks(numbers: number[]): Promise<EthLog[]> {
        try {
            return (
                (await logsRepo().find({
                    where: {
                        blockNumber: In(numbers),
                        eventName: null,
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting logs: ${err}`)
            return []
        }
    }
}

export function getDecodeLogWorker(): DecodeLogWorker {
    return new DecodeLogWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}