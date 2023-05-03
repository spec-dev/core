import { BlockHeader } from 'web3-eth'
import { ident, literal } from 'pg-format'
import chalk from 'chalk'
import config from '../config'
import { OpRecord, OpType } from '../types'
import { 
    logger, 
    primitivesForChainId, 
    SharedTables, 
    StringKeyMap, 
    randomIntegerInRange, 
    sleep,
    resolveLiveObjectTablesForChainId,
    sum,
    range,
    toChunks,
} from '../../../shared'

const identPath = (value: string): string => (
    value.split('.').map((v) => ident(v)).join('.')
)

async function rollbackTables(chainId: string, block: BlockHeader) {
    const blockNumber = Number(block.number)

    // Split primitive tables into 2 buckets, those that are "append-only" & those that can be updated in-place.
    const { appendOnlyPrimitives, updatablePrimitives } = getPrimitivesByType(chainId)

    // Delete from append-only primitive tables >= blockNumber
    await deleteAppendOnlyPrimitivesAtOrAboveNumber(appendOnlyPrimitives, chainId, blockNumber)

    // Get all live object tables, then merge that with the updatable primitives. 
    // The result is a grouping of all tables that are being tracked for operations.
    const liveObjectTables = (await resolveLiveObjectTablesForChainId(chainId)).map(table => ({ 
        table,
        appendOnly: false,
        crossChain: true,
    }))
    const opTables = [...updatablePrimitives, ...liveObjectTables]

    // Get snapshots of records that need to be rolled back.
    const recordSnapshotOps = await getTargetRecordSnapshotOps(opTables, chainId, blockNumber)
    const numRecordsAffected = sum(Object.values(recordSnapshotOps).map(records => records.length))
    if (!numRecordsAffected) {
        logger.info(chalk.magenta(`No records to roll back.`))
        return
    }

    logger.info(chalk.magenta(
        `Rolling back ${numRecordsAffected} records across ${Object.keys(recordSnapshotOps).length} tables.`
    ))

    // Toggle op-tracking and perform the rollback, resetting records to a 
    // previous snapshot AND deleting the ops that kept track of this.
    await toggleOpTracking(opTables, chainId, false)
    await performRollback(recordSnapshotOps, chainId, blockNumber)
    await toggleOpTracking(opTables, chainId, true)
}

function getPrimitivesByType(chainId: string) {
    const primitives = primitivesForChainId[chainId]
    const appendOnlyPrimitives = []
    const updatablePrimitives = []
    for (const primitive of primitives) {
        if (primitive.appendOnly) {
            appendOnlyPrimitives.push(primitive)
        } else {
            updatablePrimitives.push(primitive)
        }
    }
    return {
        appendOnlyPrimitives,
        updatablePrimitives,
    }
}

async function deleteAppendOnlyPrimitivesAtOrAboveNumber(
    appendOnlyPrimitives: StringKeyMap[],
    chainId: string, 
    blockNumber: number,
) {
    if (!appendOnlyPrimitives.length) return
    logger.info(chalk.magenta(`Deleting primitives >= ${blockNumber}`))

    const ops = []
    for (const primitive of appendOnlyPrimitives) {
        const { table, crossChain } = primitive
        const tableName = table.split('.')[1]
        const numberColumn = tableName === 'blocks' ? 'number' : 'block_number'
        let query = `delete from ${identPath(table)} where ${ident(numberColumn)} >= $1`
        const bindings: any[] = [blockNumber]
        if (crossChain) {
            query += ` and "chain_id" = $2`
            bindings.push(chainId)
        }
        ops.push({ table, query, bindings })
    }

    await Promise.all(ops.map(op => runQueryWithDeadlockProtection(
        op.table,
        op.query,
        op.bindings,
        chainId,
        blockNumber,
    )))
}

async function toggleOpTracking(opTables: StringKeyMap[], chainId: string, enabled: boolean) {
    const placeholders = []
    const bindings = []
    let i = 1
    for (const { table } of opTables) {
        placeholders.push(`($${i}, $${i + 1}, $${i + 2})`)
        bindings.push(...[table, chainId, enabled])
        i += 3
    }
    
    try {
        await SharedTables.query(
            `insert into op_tracking (table_path, chain_id, is_enabled) values ${placeholders.join(', ')} on conflict (table_path, chain_id) do update set is_enabled = $${i}`,
            [...bindings, enabled],
        )    
    } catch (err) {
        logger.error(opTables.map(t => t.table).join(','), err)
        throw `Failed to toggle op tracking (${enabled}): ${err}`
    }
}

async function getTargetRecordSnapshotOps(
    opTables: StringKeyMap[], 
    chainId: string, 
    blockNumber: number,
): Promise<StringKeyMap> {
    const tablePaths = []
    const tablePathBatches = toChunks(opTables, config.ROLLBACK_TABLE_PARALLEL_FACTOR)
    const opRecords = []

    for (const tables of tablePathBatches) {
        const batchTablePaths = []
        const batchPromises = []
        for (const { table, crossChain } of tables) {
            batchTablePaths.push(table)
            batchPromises.push(findEarliestRecordSnapshotsAtOrAboveNumber(
                table,
                blockNumber,
                crossChain ? chainId : null,
            ))
        }
        const batchRecords = await Promise.all(batchPromises)
        tablePaths.push(...batchTablePaths)
        opRecords.push(...batchRecords)
    }

    const recordSnapshotOps = {}
    for (let i = 0; i < tablePaths.length; i++) {
        const opTableRecords = opRecords[i] || []
        if (!opTableRecords.length) continue
        recordSnapshotOps[tablePaths[i]] = opTableRecords
    }
    return recordSnapshotOps
}

async function findEarliestRecordSnapshotsAtOrAboveNumber(
    tablePath: string, 
    blockNumber: number,
    chainId?: string,
): Promise<OpRecord[]> {
    let whereClause = `where block_number >= ${literal(blockNumber)}`
    if (chainId) {
        whereClause += ` and chain_id = ${literal(chainId)}`
    }
    const [schema, table] = tablePath.split('.')
    const opTable = [ident(schema), ident(`${table}_ops`)].join('.')
    try {
        return await SharedTables.query(
            `select distinct on (pk_values) * from ${opTable} ${whereClause} order by pk_values, block_number, ts ASC`
        )
    } catch (err) {
        logger.error(
            `Error finding record snapshots >= ${blockNumber} (table_path=${opTable}, chain_id=${chainId}): ${err}`
        )
        return []
    }
}

async function performRollback(
    recordSnapshotOps: StringKeyMap,
    chainId: string,
    blockNumber: number,
) {
    const tablePaths = Object.keys(recordSnapshotOps)
    const tablePathBatches = toChunks(tablePaths, config.ROLLBACK_TABLE_PARALLEL_FACTOR)
    for (const batchTablePaths of tablePathBatches) {
        await Promise.all(batchTablePaths.map(tablePath => rollbackTableRecords(
            tablePath,
            recordSnapshotOps[tablePath],
            chainId,
            blockNumber,
        )))
    }
}

async function rollbackTableRecords(
    tablePath: string, 
    opRecords: OpRecord[],
    chainId: string,
    blockNumber: number,
) {
    const upserts = []
    const deletes = []
    for (const record of opRecords) {
        if (!record.before && !record.after) {
            logger.error(
                `Got strange op with null values for both before 
                and after (table=${tablePath}): ${JSON.stringify(record)}`
            )
            continue
        }

        const reverseOpType = getReverseOpType(determineOpTypeFromRecord(record))
        switch (reverseOpType) {
            case OpType.INSERT:
            case OpType.UPDATE:
                upserts.push(record)
                break
            case OpType.DELETE:
                deletes.push(record)
                break
        }
    }

    const upsertGroups = toChunks(upserts, 2000)
    const deleteGroups = toChunks(deletes, 2000)

    try {
        await Promise.all([
            ...upsertGroups.map(records => upsertRecordsToPreviousStates(tablePath, records, chainId, blockNumber)),
            ...deleteGroups.map(records => rollbackRecordsWithDeletion(tablePath, records, chainId, blockNumber)),
        ])    
    } catch (err) {
        logger.error(`[${chainId}:${blockNumber}] Failed to rollback ops for ${tablePath}:`, err)
    }
}

async function upsertRecordsToPreviousStates(
    tablePath: string, 
    opRecords: OpRecord[],
    chainId: string,
    blockNumber: number,
) {
    if (!opRecords.length) return

    const rollbackGroups = {}
    for (const opRecord of opRecords) {
        const conflictColNames = opRecord.pk_names.split(',').map(name => name.trim())
        const conflictColNamesSet = new Set(conflictColNames)
        const conflictColValues = opRecord.pk_values.split(',').map(value => value.trim())

        // TODO: Figure out if you need to JSON.parse the "before" column or not.
        const updateColNames = []
        const updateColValues = []
        const sortedRecordKeys = Object.keys(opRecord.before).sort()
        for (const colName of sortedRecordKeys) {
            if (conflictColNamesSet.has(colName)) continue
            updateColNames.push(colName)
            updateColValues.push(opRecord.before[colName])
        }

        const uniqueKey = ['c', ...conflictColNames, 'u', ...updateColNames].join(':')
        rollbackGroups[uniqueKey] = rollbackGroups[uniqueKey] || []
        rollbackGroups[uniqueKey].push({
            conflictColNames,
            updateColNames,
            columns: [...conflictColNames, ...updateColNames],
            values: [...conflictColValues, ...updateColValues],
            upsert: updateColNames.length > 0,
            opRecord,
        })
    }

    const promises = []
    const opRecordGroups = []
    for (const key in rollbackGroups) {
        const upsertOps = rollbackGroups[key]
        const { conflictColNames, updateColNames, columns, upsert } = upsertOps[0]

        let i = 1
        const placeholders = []
        const bindings = []
        const groupOpRecords = []
        for (const { values, opRecord } of upsertOps) {
            groupOpRecords.push(opRecord)
            const recordPlaceholders = []
            for (let j = 0; j < columns.length; j++) {
                recordPlaceholders.push(`$${i}`)
                bindings.push(values[j])
                i++
            }
            placeholders.push(`(${recordPlaceholders.join(', ')})`)
        }
        opRecordGroups.push(groupOpRecords)

        let query = `insert into ${identPath(tablePath)} (${columns.map(ident).join(', ')}) values ${placeholders.join(', ')}`

        if (upsert) {
            const updateClause = updateColNames.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
            query += ` on conflict (${conflictColNames.map(ident).join(', ')}) do update set ${updateClause}`
        }

        promises.push(runQueryWithDeadlockProtection(
            tablePath,
            query,
            bindings,
            chainId,
            blockNumber,
        ))
    }

    const results = await Promise.all(promises)
    const opsTablePath = `${tablePath}_ops`
    const removeOpRecordPromises = []

    for (let i = 0; i < results.length; i++) {
        const success = results[i]
        const groupOpRecords = opRecordGroups[i]
        const pks = groupOpRecords.map(r => r.id)
        if (!success) {
            logger.error(chalk.yellow(
                `Leaving op records in ${opsTablePath}: ${pks.join(',')}`
            ))
            continue
        }

        const placeholders = range(1, groupOpRecords.length).map(i => `$${i}`)
        const removeOpsQuery = `delete from ${identPath(opsTablePath)} where id in (${placeholders.join(', ')})`
        removeOpRecordPromises.push(runQueryWithDeadlockProtection(
            opsTablePath,
            removeOpsQuery,
            pks,
            chainId,
            blockNumber,
        ))
    }

    await Promise.all(removeOpRecordPromises)
}

async function rollbackRecordsWithDeletion(
    tablePath: string, 
    opRecords: OpRecord[],
    chainId: string,
    blockNumber: number,
) {
    if (!opRecords.length) return

    const orClauses = []
    const bindings = []
    let i = 1
    for (const opRecord of opRecords) {
        const pkNames = opRecord.pk_names.split(',').map(name => name.trim())
        const pkValues = opRecord.pk_values.split(',').map(value => value.trim())
        const andClauses = []
        for (let j = 0; j < pkNames.length; j++) {
            const pkName = pkNames[j]
            const pkValue = pkValues[j]
            andClauses.push(`${ident(pkName)} = $${i}`)
            bindings.push(pkValue)
            i++
        }
        orClauses.push(`(${andClauses.join(' and ')})`)
    }

    const conditions = orClauses.join(' or ')
    const query = `delete from ${identPath(tablePath)} where ${conditions}`

    const success = await runQueryWithDeadlockProtection(
        tablePath,
        query,
        bindings,
        chainId,
        blockNumber,
    )

    const opsTablePath = `${tablePath}_ops`
    const pks = opRecords.map(r => r.id)

    if (!success) {
        logger.error(chalk.yellow(
            `Leaving op records in ${opsTablePath}: ${pks.join(',')}`
        ))
        return
    }

    const placeholders = range(1, opRecords.length).map(i => `$${i}`)
    const removeOpsQuery = `delete from ${identPath(opsTablePath)} where id in (${placeholders.join(', ')})`
    await runQueryWithDeadlockProtection(
        opsTablePath,
        removeOpsQuery,
        pks,
        chainId,
        blockNumber,
        config.MAX_ROLLBACK_QUERY_TIME,
    )
}

function determineOpTypeFromRecord(opRecord: OpRecord): OpType {
    const existedBefore = !!opRecord.before
    const existedAfter = !!opRecord.after
    
    if (!existedBefore) {
        return OpType.INSERT
    }
    if (!existedAfter) {
        return OpType.DELETE
    }
    return OpType.UPDATE
}

function getReverseOpType(opType: OpType): OpType {
    if (opType === OpType.INSERT) {
        return OpType.DELETE
    }
    if (opType === OpType.DELETE) {
        return OpType.INSERT
    }
    return OpType.UPDATE
} 

async function runQueryWithDeadlockProtection(
    table: string,
    query: string, 
    bindings: any[],
    chainId: string,
    blockNumber: number,
    attempt: number = 0
): Promise<boolean> {
    // if (query.startsWith('insert')) {
    console.log(blockNumber, query)
    console.log(bindings)
    // }
    try {
        await SharedTables.query(query, bindings)
    } catch (err) {
        logger.error(`Error rolling back ${table} >= ${blockNumber}`, query, bindings, err)
        const message = err.message || err.toString() || ''

        // Wait and try again if deadlocked.
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            this._error(
                `[${chainId}:${blockNumber} - Rolling back ${table} - Attempt ${attempt}] Got deadlock, trying again...`
            )
            await sleep(randomIntegerInRange(50, 500))
            return await runQueryWithDeadlockProtection(
                table, 
                query,
                bindings, 
                chainId, 
                blockNumber, 
                attempt + 1,
            )
        }
        logger.error(chalk.red(`[${chainId}:${blockNumber}] Rolling back ${table} failed.`))
        return false
    }
    return true
}

export default rollbackTables