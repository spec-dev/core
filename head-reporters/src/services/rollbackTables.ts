import { BlockHeader } from 'web3-eth'
import { ident, literal } from 'pg-format'
import chalk from 'chalk'
import config from '../config'
import { OpRecord, OpType } from '../types'
import { 
    logger, 
    primitivesForChainId, 
    StringKeyMap, 
    randomIntegerInRange, 
    sleep,
    sum,
    toChunks,
    identPath,
    getBlockEventsSeriesNumber,
    setBlockEventsSeriesNumber,
    getEagerBlocks,
    deleteEagerBlocks,
    CoreDB,
    markLovFailure,
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    range,
    ChainTables,
} from '../../../shared'

export async function rollbackTables(chainId: string, block: BlockHeader, toNumber: number) {
    const blockNumber = Number(block.number)
    const blockTimestamp = new Date(new Date(block.timestamp as number * 1000).toUTCString()).toISOString()

    // Split primitive tables into 2 buckets, those that are "append-only" & those that can be updated in-place.
    const { appendOnlyPrimitives, updatablePrimitives } = getPrimitivesByType(chainId)
    const updatablePrimitiveTablePaths = new Set(updatablePrimitives.map(p => p.table))

    // Delete append-only primitives >= blockNumber and rollback any record counts.
    await Promise.all([
        deleteAppendOnlyPrimitivesAtOrAboveNumber(appendOnlyPrimitives, chainId, blockNumber, toNumber),
        rollbackRecordCounts(chainId, blockNumber),
    ])

    // Get all tables that are being tracked for operations.
    const opTables: StringKeyMap[] = updatablePrimitives.map(obj => ({ ...obj, isPrimitive: true }))
    const opTrackingTablePaths = await getOpTrackingTablesForChain(chainId)
    for (const tablePath of opTrackingTablePaths) {
        if (updatablePrimitiveTablePaths.has(tablePath)) continue
        opTables.push({
            table: tablePath,
            appendOnly: false,
            crossChain: true,
            isPrimitive: false,
        })
    }
    const crossChainTablePaths = new Set(opTables.filter(t => t.crossChain).map(t => t.table))

    // Get snapshots of records that need to be rolled back.
    const recordSnapshotOps = await getTargetRecordSnapshotOps(opTables, chainId, blockNumber, blockTimestamp)
    const numRecordsAffected = sum(Object.values(recordSnapshotOps).map(records => records.length))
    if (!numRecordsAffected) {
        await rollbackEventSorterSeries(chainId, blockNumber)
        logger.info(chalk.magenta(`No op-tracked records to roll back.`))
        return
    }

    const rollbackTables = Object.keys(recordSnapshotOps)
    logger.info(chalk.magenta(
        `Rolling back ${numRecordsAffected} records across ${rollbackTables.length} tables:\n` + 
        `${rollbackTables.map(t => `- ${t}`).join('\n')}`
    ))

    // Update the op-tracking floor to the rollback target number 
    // and perform the rollback, resetting records to a previous 
    // snapshot AND deleting the ops that kept track of this.
    await setOpTrackingFloor(opTables, chainId, blockNumber)
    await performRollback(
        recordSnapshotOps, 
        crossChainTablePaths, 
        updatablePrimitiveTablePaths, 
        chainId, 
        blockNumber, 
        blockTimestamp,
    )

    // Rollback the event sorter.
    await rollbackEventSorterSeries(chainId, blockNumber)
}

export async function rollbackTable(
    table: string,
    chainId: string, 
    blockNumber: number,
    blockTimestamp: string,
) {
    logger.info(`Rolling back "${table}" to ${blockNumber} for chain ${chainId}...`)
    const opRecords = await findEarliestRecordSnapshotsAtOrAboveNumber(
        table,
        false,
        blockNumber,
        blockTimestamp,
        chainId,
    )
    if (!opRecords.length) {
        logger.info(`No records to rollback in "${table}" that are >= ${blockNumber} for chain ${chainId}.`)
        return
    }

    await setOpTrackingFloor([{ table }], chainId, blockNumber)
    await rollbackTableRecords(
        table, 
        opRecords,
        true,
        false,
        chainId,
        blockNumber,
        blockTimestamp,
    )

    logger.info(chalk.green(`Rollback complte.`))
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
    toNumber: number,
) {
    if (!appendOnlyPrimitives.length) return
    logger.info(chalk.magenta(`Deleting primitives >= ${blockNumber}...`))

    const blockNumbers = range(blockNumber, toNumber).sort((a, b) => a - b)
    const ops = []
    for (const primitive of appendOnlyPrimitives) {
        const { table, crossChain } = primitive
        const [schema, tableName] = table.split('.')
        const numberColumn = tableName === 'blocks' ? 'number' : 'block_number'

        if (crossChain) {
            const phs = range(1, blockNumbers.length).map(i => `$${i}`)
            ops.push({
                schema,
                table,
                query: `delete from ${identPath(table)} where ${ident(numberColumn)} in (${phs.join(', ')}) and "chain_id" = $${blockNumbers.length + 1}`,
                bindings: [...blockNumbers, chainId]
            })
        } else {
            ops.push({
                schema,
                table,
                query: `delete from ${identPath(table)} where ${ident(numberColumn)} >= $1`,
                bindings: [blockNumber]
            })
        }
    }

    await Promise.all(ops.map(op => runQueryWithDeadlockProtection(
        op.schema,
        op.table,
        op.query,
        op.bindings,
        chainId,
        blockNumber,
    )))
}

async function rollbackRecordCounts(chainId: string, blockNumber: number) {
    let deltas = []
    try {
        deltas = (await ChainTables.query(null,
            `select * from record_count_deltas where chain_id = $1 and block_number >= $2`,
            [chainId, blockNumber]
        )) || []
    } catch (err) {
        logger.error(`[${chainId}:${blockNumber}] Error finding record count deltas during rollback: ${err}`)
        return
    }
    
    const aggregates = {}
    for (const { table_path, value } of deltas) {
        aggregates[table_path] = aggregates[table_path] || 0
        aggregates[table_path] += value
    }
    const tablePaths = Object.keys(aggregates)
    if (!tablePaths.length) return
    const tablePathChunks = toChunks(tablePaths, 20)

    try {
        await ChainTables.transaction(null, async (tx) => {
            for (const chunk of tablePathChunks) {
                await Promise.all(chunk.map(tablePath => (
                    tx.query(
                        `update record_counts set value = value - $1 where table_path = $2`,
                        [aggregates[tablePath], tablePath]
                    )
                )))
            }
        })
    } catch (err) {
        logger.error(`[${chainId}:${blockNumber}] Error rolling back record counts during rollback: ${err}`)
        return
    }

    try {
        await ChainTables.query(null,
            `delete from record_count_deltas where chain_id = $1 and block_number >= $2`,
            [chainId, blockNumber]
        )
    } catch (err) {
        logger.error(`[${chainId}:${blockNumber}] Error deleting record count deltas during rollback: ${err}`)
    }
}

export async function getOpTrackingTablesForChain(chainId: string): Promise<string[]> {
    return (
        await ChainTables.query(null, `select table_path from op_tracking where chain_id = $1`, [chainId])
    ).map(row => row.table_path)
}

async function setOpTrackingFloor(opTables: StringKeyMap[], chainId: string, blockNumber: number) {
    const placeholders = []
    const bindings = []
    let i = 1
    for (const { table } of opTables) {
        placeholders.push(`($${i}, $${i + 1}, $${i + 2})`)
        bindings.push(...[table, chainId, blockNumber])
        i += 3
    }
    
    try {
        await ChainTables.query(null,
            `insert into op_tracking (table_path, chain_id, is_enabled_above) values ${placeholders.join(', ')} on conflict (table_path, chain_id) do update set is_enabled_above = excluded.is_enabled_above`,
            bindings,
        )    
    } catch (err) {
        logger.error(opTables.map(t => t.table).join(','), err)
        throw `Failed to set op-tracking floor to ${blockNumber} for ${opTables.join(', ')}: ${err}`
    }
}

async function getTargetRecordSnapshotOps(
    opTables: StringKeyMap[], 
    chainId: string, 
    blockNumber: number,
    blockTimestamp: string,
): Promise<StringKeyMap> {
    const tablePaths = []
    const tablePathBatches = toChunks(opTables, config.ROLLBACK_TABLE_PARALLEL_FACTOR)
    const opRecords = []

    for (const tables of tablePathBatches) {
        const batchTablePaths = []
        const batchPromises = []
        for (const { table, crossChain, isPrimitive } of tables) {
            batchTablePaths.push(table)
            batchPromises.push(findEarliestRecordSnapshotsAtOrAboveNumber(
                table,
                isPrimitive,
                blockNumber,
                blockTimestamp,
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
    isPrimitive: boolean,
    blockNumber: number,
    blockTimestamp: string,
    chainId?: string,
): Promise<OpRecord[]> {
    let whereClause = `where block_number >= ${literal(blockNumber)}`
    if (chainId) {
        whereClause += ` and chain_id = ${literal(chainId)}`
    }
    const [schema, table] = tablePath.split('.')
    const opTable = [ident(schema), ident(`${table}_ops`)].join('.')
    try {
        return (await ChainTables.query(schema,
            `select distinct on (pk_values) * from ${opTable} ${whereClause} order by pk_values ASC, block_number ASC, ts ASC`
        )) as OpRecord[]
    } catch (err) {
        const error = `Error finding record snapshots >= ${blockNumber} (table_path=${opTable}, chain_id=${chainId}): ${err}`
        logger.error(err)
        if (isPrimitive) throw error
        setLiveObjectVersionsThatRelyOnTableToFailing(tablePath, chainId, blockNumber, blockTimestamp as string)
        return []
    }
}

async function performRollback(
    recordSnapshotOps: StringKeyMap,
    crossChainTablePaths: Set<string>,
    updatablePrimitiveTablePaths: Set<string>,
    chainId: string,
    blockNumber: number,
    blockTimestamp: string,
) {
    const tablePaths = Object.keys(recordSnapshotOps)
    const tablePathBatches = toChunks(tablePaths, config.ROLLBACK_TABLE_PARALLEL_FACTOR)
    for (const batchTablePaths of tablePathBatches) {
        await Promise.all(batchTablePaths.map(tablePath => rollbackTableRecords(
            tablePath,
            recordSnapshotOps[tablePath],
            crossChainTablePaths.has(tablePath),
            updatablePrimitiveTablePaths.has(tablePath),
            chainId,
            blockNumber,
            blockTimestamp,
        )))
    }
}

async function rollbackTableRecords(
    tablePath: string, 
    opRecords: OpRecord[],
    isCrossChain: boolean,
    isPrimitive: boolean,
    chainId: string,
    blockNumber: number,
    blockTimestamp: string,
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

    const schema = tablePath.split('.')[0]

    let attempt = 1
    while (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK) {
        try {
            await ChainTables.transaction(schema, async (tx) => {
                // Rollback records.
                await Promise.all([
                    ...upsertGroups.map(records => upsertRecordsToPreviousStates(tablePath, records, tx)),
                    ...deleteGroups.map(records => rollbackRecordsWithDeletion(tablePath, records, tx)),
                ])

                // Remove ops.
                const opsTablePath = `${tablePath}_ops`
                let removeOpsQuery = `delete from ${identPath(opsTablePath)} where "block_number" >= $1`
                const bindings: any[] = [blockNumber]
                if (isCrossChain) {
                    removeOpsQuery += ` and "chain_id" = $2`
                    bindings.push(chainId)
                }
                await tx.query(removeOpsQuery, bindings)     
            })
            break
        } catch (err) {
            attempt++
            logger.error(`Error rolling back ${tablePath} >= ${blockNumber}`, err)
            const message = err.message || err.toString() || ''
        
            // Wait and try again if deadlocked.
            if (message.toLowerCase().includes('deadlock')) {
                logger.error(
                    `[${chainId}:${blockNumber} - Rolling back ${tablePath}] 
                    Got deadlock on attempt ${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK}.`
                )
                await sleep(randomIntegerInRange(50, 500))
                continue
            } else {
                const error = `[${chainId}:${blockNumber}] Failed to rollback ops for ${tablePath}: ${err}`
                logger.error(error)
                if (isPrimitive) throw error
                setLiveObjectVersionsThatRelyOnTableToFailing(tablePath, chainId, blockNumber, blockTimestamp) 
                break
            }
        }
    }
}

async function upsertRecordsToPreviousStates(
    tablePath: string, 
    opRecords: OpRecord[],
    tx: any,
) {
    if (!opRecords.length) return

    const rollbackGroups = {}
    for (const opRecord of opRecords) {
        const conflictColNames = opRecord.pk_names.split(',').map(name => name.trim())
        const conflictColNamesSet = new Set(conflictColNames)
        const conflictColValues = opRecord.pk_values.split(',').map(value => value.trim())
        const updateColNames = []
        const updateColValues = []
        const sortedRecordKeys = Object.keys(opRecord.before).sort()
        for (const colName of sortedRecordKeys) {
            if (conflictColNamesSet.has(colName)) continue

            updateColNames.push(colName)

            // Re-stringify JSON column types.
            let colValue = opRecord.before[colName]
            if (colValue && typeof colValue === 'object') {
                colValue = stringifyObjectTypeColValue(tablePath, colName, colValue)
            }
            
            updateColValues.push(colValue)
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
    for (const key in rollbackGroups) {
        const upsertOps = rollbackGroups[key]
        const { conflictColNames, updateColNames, columns, upsert } = upsertOps[0]

        let i = 1
        const placeholders = []
        const bindings = []
        for (const { values } of upsertOps) {
            const recordPlaceholders = []
            for (let j = 0; j < columns.length; j++) {
                recordPlaceholders.push(`$${i}`)
                bindings.push(values[j])
                i++
            }
            placeholders.push(`(${recordPlaceholders.join(', ')})`)
        }

        let query = `insert into ${identPath(tablePath)} (${columns.map(ident).join(', ')}) values ${placeholders.join(', ')}`

        if (upsert) {
            const updateClause = updateColNames.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
            query += ` on conflict (${conflictColNames.map(ident).join(', ')}) do update set ${updateClause}`
        }

        promises.push(tx.query(query, bindings))
    }

    await Promise.all(promises)
}

async function rollbackRecordsWithDeletion(
    tablePath: string, 
    opRecords: OpRecord[],
    tx: any,
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
    await tx.query(query, bindings)
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
    schema: string,
    table: string,
    query: string, 
    bindings: any[],
    chainId: string,
    blockNumber: number,
    attempt: number = 0
) {
    try {
        await ChainTables.query(schema, query, bindings)
    } catch (err) {
        logger.error(`Error rolling back ${table} >= ${blockNumber}`, query, bindings, err)
        const message = err.message || err.toString() || ''

        // Wait and try again if deadlocked.
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            logger.error(
                `[${chainId}:${blockNumber} - Rolling back ${table} - Attempt ${attempt}] Got deadlock, trying again...`
            )
            await sleep(randomIntegerInRange(50, 500))
            return await runQueryWithDeadlockProtection(
                schema,
                table, 
                query,
                bindings, 
                chainId, 
                blockNumber,
                attempt + 1,
            )
        }

        const finalErr = `[${chainId}:${blockNumber}] Rolling back ${table} failed.`
        logger.error(chalk.red(finalErr))
        throw finalErr
    }
}

async function rollbackEventSorterSeries(chainId: string, blockNumber: number) {
    const [currentSeriesNumber, currentEagerBlocks] = await Promise.all([
        getBlockEventsSeriesNumber(chainId),
        getEagerBlocks(chainId),
    ])
    // Never set the series number forward.
    if (currentSeriesNumber === null || blockNumber > currentSeriesNumber) {
        return
    }
    // Set series back to floor of rollback.
    await Promise.all([
        setBlockEventsSeriesNumber(chainId, blockNumber),
        deleteEagerBlocks(chainId, currentEagerBlocks.filter(n => n >= blockNumber)),
    ])
}

async function setLiveObjectVersionsThatRelyOnTableToFailing(
    tablePath: string,
    chainId: string,
    blockNumber: number,
    blockTimestamp: string,
) {
    const lovIds = ((await CoreDB.query(
        `select id from live_object_versions where config->>'table' = $1`,
        [tablePath],
    )) || []).map(r => r.id)
    if (!lovIds.length) {
        logger.error(`[${chainId}:${blockNumber}:${blockTimestamp}] ${chalk.redBright(`No live object versions seem to rely on "${tablePath}".`)}`)
        return
    }
    
    logger.error(`[${chainId}:${blockNumber}:${blockTimestamp}] ${chalk.redBright(
        `Setting live object versions that rely on "${tablePath}" to failing:`
    )}\n${lovIds.map(id => `- ${chalk.redBright(id)}\n`)}`)
    
    await Promise.all([
        updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Failing),
        ...lovIds.map(lovId => markLovFailure(lovId, blockTimestamp)),
    ])
}

function stringifyObjectTypeColValue(tablePath: string, colName: string, value: any): any {
    const originalValue = value
    try {
        return JSON.stringify(value)
    } catch (err) {
        logger.error(`Error stringifying ${tablePath}.${colName} during rollback: ${value} - ${err}`)
        return originalValue
    }
}