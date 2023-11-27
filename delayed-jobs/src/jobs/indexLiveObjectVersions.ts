import { 
    StringKeyMap, 
    logger, 
    getLovInputGenerator, 
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    newTablesJWT,
    sleep,
    enqueueDelayedJob,
    DEFAULT_TARGET_BLOCK_BATCH_SIZE,
    CoreDB,
    LiveObjectVersion,
    In,
    unique,
    ChainTables,
    getGeneratedEventsCursors,
    addContractInstancesToGroup,
    isValidAddress,
    supportedChainIds,
    updatePublishAndDeployLiveObjectVersionJobStatus,
    PublishAndDeployLiveObjectVersionJobStatus,
    updatePublishAndDeployLiveObjectVersionJobCursor,
    publishAndDeployLiveObjectVersionJobFailed,
    updatePublishAndDeployLiveObjectVersionJobMetadata
} from '../../../shared'
import config from '../config'
import { Pool } from 'pg'
import fetch from 'cross-fetch'

const DEFAULT_MAX_JOB_TIME = 60000

const lovsRepo = () => CoreDB.getRepository(LiveObjectVersion)

export async function indexLiveObjectVersions(
    lovIds: number[],
    lovTables: string[],
    startTimestamp: string | null = null,
    iteration: number = 1,
    maxIterations: number | null = null,
    maxJobTime: number = DEFAULT_MAX_JOB_TIME,
    targetBatchSize: number = DEFAULT_TARGET_BLOCK_BATCH_SIZE,
    shouldGenerateEvents: boolean,
    updateOpTrackingFloor: boolean,
    setLovToIndexingBefore: boolean,
    setLovToLiveAfter: boolean,
    publishJobTableUid?: string,
    liveObjectUid?: string,
    resetCountsForContractGroups: string[] = []
) {
    logger.info(`Indexing (${lovIds.join(', ')}) from ${startTimestamp || 'origin'}...`)
    
    let timer = setTimeout(() => {
        timer = null
    }, maxJobTime)

    let cursor = null
    try {
        // Create input generator.
        let { 
            generator: generateFrom, 
            inputIdsToLovIdsMap, 
            liveObjectVersions,
            indexingContractFactoryLov,
            earliestStartCursor,
        } = (await getLovInputGenerator(lovIds, startTimestamp, targetBatchSize)) || {}
        if (!generateFrom) throw `Failed to get LOV input generator`

        // Before/setup logic.
        if (iteration === 1) {
            // Set op-tracking floors to the head of each chain to prevent ops from being tracked 
            // for a potentially massive number of historical records about to be indexed.
            if (updateOpTrackingFloor) {
                await updateOpTrackingFloors(lovTables.length ? lovTables : await getTablesForLovs(lovIds))
            }

            // Set live object version statuses to indexing.
            setLovToIndexingBefore && await updateLiveObjectVersionStatus(
                lovIds, 
                LiveObjectVersionStatus.Indexing,
            )

            if (publishJobTableUid && liveObjectUid) {
                await updatePublishAndDeployLiveObjectVersionJobMetadata(
                    publishJobTableUid,
                    { liveObjectUid, startCursor: earliestStartCursor.toISOString() }
                )
            }

            if (publishJobTableUid){
                await updatePublishAndDeployLiveObjectVersionJobStatus(
                    publishJobTableUid, 
                    PublishAndDeployLiveObjectVersionJobStatus.Indexing,
                )
            }
        }

        // Index live object versions.
        let inputsFilter = new Set<string>()
        let contractRegistrationSequenceCount = 0
        while (true) {
            // Get next batch of inputs from this cursor (datetime) and filter out inputs already 
            // seen (if new contracts were registered half-way through the previous batch.
            const results = await generateFrom(cursor)
            const inputs = (results.inputs || []).filter(input => !inputsFilter.has(uniqueInputKey(input)))
            inputsFilter = new Set<string>()

            // Send the inputs to the live objects running on Deno.
            const {
                groupContractInstancesToRegister,
                processedInputs,
            } = await processInputs(
                lovIds, 
                inputs, 
                inputIdsToLovIdsMap, 
                liveObjectVersions, 
                indexingContractFactoryLov,
                cursor,
            )

            // If new contracts were registered at some point in this batch...
            if (groupContractInstancesToRegister?.length) {
                contractRegistrationSequenceCount++
                if (contractRegistrationSequenceCount > (config.MAX_CONTRACT_REGISTRATION_STACK_HEIGHT * targetBatchSize)) {
                    throw `[${cursor}] Contract factory additions hit max number of loops.`
                }
                try {
                    await Promise.all(groupContractInstancesToRegister.map(({ group, addresses, chainId, blockNumber }) => {
                        logger.info(`[${chainId}] Registering ${addresses.length} contracts to "${group}"...`)

                        resetCountsForContractGroups = resetCountsForContractGroups.concat(group)
                        const instances = addresses.map(address => ({ chainId, address }))

                        return addContractInstancesToGroup(
                            instances,
                            group,
                            { chainId, blockNumber },
                        )
                    }))
                } catch (err) {
                    throw `[:${cursor}] IndexLOV ${lovIds.join(', ')} Failed to register new contracts ${JSON.stringify(groupContractInstancesToRegister)}: ${err}`
                }
                resetCountsForContractGroups = unique(resetCountsForContractGroups)

                // Recreate the generator after registering new contracts
                // because this will change the generator's queries.
                ;({ 
                    generator: generateFrom,
                    inputIdsToLovIdsMap,
                    liveObjectVersions,
                    indexingContractFactoryLov,
                } = (await getLovInputGenerator(lovIds, startTimestamp, targetBatchSize)) || {})
                if (!generateFrom) throw `Failed to recreate LOV input generator`

                inputsFilter = processedInputs
                logger.info(`Repeating from cursor ${cursor} with ${processedInputs.size} processed inputs.`)
                continue
            }

            contractRegistrationSequenceCount = 0
            cursor = results.nextStartDate

            // if job is called by publishAndDeployLiveObjectVersionJob, update it's cursor
            if (publishJobTableUid && cursor) {
                await updatePublishAndDeployLiveObjectVersionJobCursor(
                    publishJobTableUid,
                    cursor
                )
            }

            if (!cursor || timer === null) break
        }
        generateFrom = null
    } catch (err) {
        clearTimeout(timer)
        logger.error(`Indexing live object versions (id=${lovIds.join(',')}) failed:`, err)
        resetCountsForContractGroups = unique(resetCountsForContractGroups)
        for (const group of resetCountsForContractGroups) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { group })
        }
        await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Failing)

        if (publishJobTableUid) {
            await publishAndDeployLiveObjectVersionJobFailed(publishJobTableUid, err)
        }
        return
    }

    resetCountsForContractGroups = unique(resetCountsForContractGroups)

    // All done -> set to "live".
    if (!cursor) {
        // if job is called by publishAndDeployLiveObjectVersionJob, update it's statis to complete
        if (publishJobTableUid) {
            await updatePublishAndDeployLiveObjectVersionJobStatus(
                publishJobTableUid,
                PublishAndDeployLiveObjectVersionJobStatus.Complete
            )
            await updatePublishAndDeployLiveObjectVersionJobCursor(
                publishJobTableUid,
                (new Date())
            )
        }

        logger.info(`Done indexing live object versions (${lovIds.join(', ')}). Setting to "live".`)
        setLovToLiveAfter && await updateLiveObjectVersionStatus(lovIds, LiveObjectVersionStatus.Live)
        for (const group of resetCountsForContractGroups) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { group })
        }
        return
    }

    // Only used if an interations cap is enforced.
    if (maxIterations && iteration >= maxIterations) {
        logger.info(`[${lovIds.join(', ')}] Completed max ${maxIterations} iterations.`)
        for (const group of resetCountsForContractGroups) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { group })
        }
        return
    }

    logger.info(`[${lovIds.join(', ')}] Enqueueing next indexer iteration ${iteration + 1}.`)

    // Iterate.
    await enqueueDelayedJob('indexLiveObjectVersions', {
        lovIds,
        lovTables,
        startTimestamp: cursor.toISOString(),
        iteration: iteration + 1,
        maxIterations,
        maxJobTime,
        targetBatchSize,
        shouldGenerateEvents,
        updateOpTrackingFloor,
        setLovToIndexingBefore,
        setLovToLiveAfter,
        publishJobTableUid,
        resetCountsForContractGroups,
    })
}

async function getTablesForLovs(lovIds: number[]): Promise<string[]> {
    let tables = []
    try {
        tables = unique((await lovsRepo().find({
            where: {
                id: In(lovIds)
            }
        })).map(lov => lov.config?.table))
    } catch (err) {
        throw `Failed to get tables for lov ids ${lovIds.join(', ')}: ${err}`
    }

    if (!tables.length) {
        throw `No tables found for lovIds: ${lovIds.join(', ')}`
    }

    return tables
}

async function updateOpTrackingFloors(tables: string[]) {    
    const currentHeads = await getGeneratedEventsCursors()
    if (!Object.keys(currentHeads).length) return

    const updates = []
    for (const table of tables) {
        for (const chainId in currentHeads) {
            const blockNumber = currentHeads[chainId]
            if (blockNumber === null) continue

            // Shielding against potential race conditions.
            const opTrackingFloor = Math.max(0, Number(blockNumber) - 10)

            updates.push([
                table, 
                chainId, 
                opTrackingFloor,
            ])
        }
    }

    const queries = []
    for (const entry of updates) {
        const [table, chainId, opTrackingFloor] = entry
        queries.push({
            sql: `update op_tracking set is_enabled_above = $1 where table_path = $2 and chain_id = $3`,
            bindings: [opTrackingFloor, table, chainId],
        })
    }

    try {
        await Promise.all(queries.map(({ sql, bindings }) => ChainTables.query(null, sql, bindings)))
    } catch (err) {
        throw `Failed to update op-tracking floors for ${tables.join(', ')}: ${err}`
    }
}

async function processInputs(
    lovIds: number[],
    inputs: StringKeyMap[],
    inputIdsToLovIdsMap: StringKeyMap,
    liveObjectVersions: StringKeyMap,
    indexingContractFactoryLov: boolean,
    cursor: Date,
): Promise<StringKeyMap> {
    if (!inputs.length) return {}
    logger.info(`[${lovIds.join(', ')} - ${cursor?.toISOString()}] Processing ${inputs.length} inputs`)

    if (indexingContractFactoryLov) {
        const processedInputs = new Set<string>()
        const allNewContractInstances = []

        for (const input of inputs) {
            const { chainId, blockNumber } = input.origin
            processedInputs.add(uniqueInputKey(input))
            
            const lovIds = inputIdsToLovIdsMap[input.name] || []
            if (!lovIds.length) continue

            const newContractInstances = (await Promise.all(lovIds.map(lovId => (
                sendInputsToLov([input], liveObjectVersions[lovId], [])
            )))).flat()

            allNewContractInstances.push(...newContractInstances.map(({ address, group }) => ({
                address,
                group,
                chainId,
                blockNumber,
            })))
        }

        const registerContractInstancesByGroup = {}
        for (const { address, group, chainId, blockNumber } of allNewContractInstances) {
            const key = [group, chainId, blockNumber].join(':')
            registerContractInstancesByGroup[key] = registerContractInstancesByGroup[key] || []
            registerContractInstancesByGroup[key].push(address)
        }

        const groupContractInstancesToRegister = []
        for (const key in registerContractInstancesByGroup) {
            const [group, chainId, blockNumber] = key.split(':')
            const addresses = registerContractInstancesByGroup[key]
            groupContractInstancesToRegister.push({
                group,
                chainId,
                blockNumber,
                addresses,
            })
        }

        return {
            groupContractInstancesToRegister,
            processedInputs,
        }
    }

    for (const batchInputs of createGroupInputs(inputs, inputIdsToLovIdsMap)) {
        const lovIds = inputIdsToLovIdsMap[batchInputs[0].name] || []
        if (!lovIds.length) continue
        await Promise.all(lovIds.map(lovId => sendInputsToLov(batchInputs, liveObjectVersions[lovId], [])))
    }

    return {}
}

function createGroupInputs(
    inputs: StringKeyMap[], 
    inputIdsToLovIdsMap: StringKeyMap,
): StringKeyMap[][] {
    const groupInputs = []
    let batch = []
    let prevLovId = null
    const maxBatchSize = 100

    for (const input of inputs) {
        // Get the live object version ids that are dependent on this input.
        const lovIds = inputIdsToLovIdsMap[input.name] || []
        if (!lovIds?.length) continue

        // Never batch inputs that have more than 1 LOV dependent on them.
        if (lovIds.length > 1) {
            batch.length && groupInputs.push(batch)
            groupInputs.push([input])
            batch = []
            prevLovId = null
            continue
        }

        // Start new batch.
        if (!prevLovId) {
            batch = [input]
            prevLovId = lovIds[0]
            continue
        }

        // Different LOV than last iteration, so close 
        // out this batch and start a new one.
        if (lovIds[0] !== prevLovId) {
            batch.length && groupInputs.push(batch)
            batch = [input]
            prevLovId = lovIds[0]
            continue
        }

        // Same LOV as last iteration -- batch these.
        batch.push(input)

        // Don't wanna send Deno too many inputs at once.
        if (batch.length > maxBatchSize) {
            groupInputs.push(batch)
            batch = []
        }
    }
    batch.length && groupInputs.push(batch)
    return groupInputs
}

async function sendInputsToLov(
    inputs: StringKeyMap[],
    liveObjectVersion: StringKeyMap,
    newContractInstancesQueue: StringKeyMap[],
    attempts: number = 0,
): Promise<StringKeyMap[]> {
    const { id, url } = liveObjectVersion
    const tablesApiToken = newTablesJWT(liveObjectVersion.config.table.split('.')[0], 600000)

    // Prep both auth headers. One for the event generator function itself, 
    // and one for the event generator to make calls to the Tables API.
    const headers = {
        [config.EVENT_GEN_AUTH_HEADER_NAME]: config.EVENT_GENERATORS_JWT,
        [config.TABLES_AUTH_HEADER_NAME]: tablesApiToken,
    }

    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), config.EVENT_GEN_RESPONSE_TIMEOUT)

    let resp
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(inputs),
            signal: abortController.signal,
        })
    } catch (err) {
        clearTimeout(timer)
        const error = `Request error to ${url} (lovId=${id}): ${err}. Attempt ${attempts}/${10}`
        logger.error(error)

        if (attempts <= 50) {
            await sleep(1000)
            return sendInputsToLov(
                inputs,
                liveObjectVersion,
                newContractInstancesQueue,
                attempts + 1,
            )
        } else {
            throw err
        }
    }
    clearTimeout(timer)

    let result: any = {}
    try {
        result = (await resp?.json()) || {}
    } catch (err) {
        result = {}
        logger.error(
            `Failed to parse JSON response (lovId=${id}): ${err} - 
            inputs: ${JSON.stringify(inputs, null, 4)}`
        )
    }
    const newContractInstances = result.newContractInstances || []

    if (resp?.status !== 200) {
        const msg = `Request to ${url} (lovId=${id}) failed with status ${resp?.status}`
        logger.error(msg)
        if (attempts <= 50) {
            await sleep(1000)
            let retryInputs = inputs
            let newContractInstancesToRegister = []

            if (resp.status == 500 && result.hasOwnProperty('index')) {
                retryInputs = retryInputs.slice(Number(result.index))
                newContractInstancesToRegister = newContractInstances
            }

            newContractInstancesQueue.push(...newContractInstancesToRegister)

            return sendInputsToLov(
                retryInputs, 
                liveObjectVersion, 
                newContractInstancesQueue, 
                attempts + 1,
            )
        } else {
            throw msg
        }
    }

    // Filter contract instances by those that are allowed to be registered.
    const givenContractInstancesToRegister = [...newContractInstancesQueue, ...newContractInstances].flat()
    const validContractInstancesToRegister = []
    const inputChainId = inputs[0].origin.chainId
    for (let { address, group, chainId } of givenContractInstancesToRegister) {
        address = address?.toLowerCase()
        if (!isValidAddress(address)) {
            throw `Contract factory - Invalid address ${address} given from lovId=${id}`
        }
        
        chainId = chainId?.toString()
        if (!supportedChainIds.has(chainId)) {
            throw `Contract factory - Invalid chainId ${chainId} given from lovId=${id}`
        }

        if (chainId !== inputChainId) {
            throw `Contract factory - ChainId mismatch: ${chainId} vs. ${inputChainId} (lovId=${id})`
        }

        const splitGroup = (group || '').split('.')
        if (splitGroup.length !== 2) {
            throw `Contract factory - Invalid group "${group}" given from lovId=${id}`
        }

        if (splitGroup[0] !== liveObjectVersion.nsp) {
            throw `Contract factory - Not allowed to register contracts under namespace ${splitGroup[0]}. lovId=${id} is only allowed to register contracts under its own namespace, ${liveObjectVersion.nsp}.`
        }

        validContractInstancesToRegister.push({ address, group })
    }

    return validContractInstancesToRegister
}

function uniqueInputKey(input: StringKeyMap): string {
    const origin = input.origin
    const isContractCall = input.hasOwnProperty('inputs')
    return isContractCall
        ? [origin.chainId, origin._id, input.name].join(':')
        : [origin.chainId, origin.transactionHash, origin.logIndex, input.name].join(':')
}

export default function job(params: StringKeyMap) {
    const lovIds = params.lovIds || []
    const lovTables = params.lovTables || []
    const startTimestamp = params.startTimestamp
    const iteration = params.iteration || 1
    const maxIterations = params.maxIterations || null
    const maxJobTime = params.maxJobTime || DEFAULT_MAX_JOB_TIME
    const targetBatchSize = params.targetBatchSize || 100
    const shouldGenerateEvents = params.shouldGenerateEvents === true
    const updateOpTrackingFloor = params.updateOpTrackingFloor !== false
    const setLovToIndexingBefore = params.setLovToIndexingBefore === true
    const setLovToLiveAfter = params.setLovToLiveAfter !== false
    const resetCountsForContractGroups = params.resetCountsForContractGroups || []
    const publishJobTableUid = params.publishJobTableUid
    const liveObjectUid = params.liveObjectUid
    
    return {
        perform: async () => indexLiveObjectVersions(
            lovIds,
            lovTables,
            startTimestamp, 
            iteration,
            maxIterations,
            maxJobTime,
            targetBatchSize,
            shouldGenerateEvents,
            updateOpTrackingFloor,
            setLovToIndexingBefore,
            setLovToLiveAfter,
            publishJobTableUid,
            liveObjectUid,
            resetCountsForContractGroups,
        )
    }
}