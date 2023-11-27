import { GenerateTestInputsPayload, StringKeyMap } from '../types'
import {
    schemaForChainId,
    ChainTables,
    toDate,
    subtractDays,
    generateLovInputsForEventsAndCalls,
    logger,
    nowAsUTCDateString,
    setCachedInputGenForStreamId,
    getCachedInputGenForStreamId,
    deleteCachedInputGenForStreamId,
} from '../../../shared'
import { ident, literal } from 'pg-format'
import config from '../config'
import uuid4 from 'uuid4'

async function generateInputRangeData(payload: GenerateTestInputsPayload): Promise<StringKeyMap> {
    let streamId = payload.streamId || null

    let from, to
    try {
        ;({ from, to } = await resolveRange(payload))
    } catch (error) {
        logger.error(error)
        return { error }
    }

    const cachedInputGen = streamId ? await getCachedInputGenForStreamId(streamId) : null
    if (cachedInputGen) {
        for (const chainId in cachedInputGen.queryCursors || {}) {
            cachedInputGen.queryCursors[chainId].inputEventIds = new Set(
                cachedInputGen.queryCursors[chainId].inputEventIds || []
            )
            cachedInputGen.queryCursors[chainId].inputFunctionIds = new Set(
                cachedInputGen.queryCursors[chainId].inputFunctionIds || []
            )
            if (from) {
                cachedInputGen.queryCursors[chainId].timestampCursor = from
            }
        }
    }

    const events = payload.inputs.events || []
    const calls = payload.inputs.calls || []
    const isContractFactory = payload.isContractFactory

    let timer, inputGen
    let cursor = from
    const batchInputs = []
    try {
        const genInfo = await generateLovInputsForEventsAndCalls(
            events,
            calls,
            isContractFactory,
            from,
            config.TEST_DATA_BLOCK_RANGE_SIZE,
            cachedInputGen
        )
        if (!genInfo) throw `Failed to get input generator`

        timer = setTimeout(() => {
            timer = null
        }, config.TEST_DATA_BATCH_MAX_TIME)

        const generateFrom = genInfo.generator
        inputGen = genInfo.inputGen
        while (true) {
            const results = await generateFrom(cursor)
            let inputs = results.inputs || []
            cursor = results.nextStartDate

            let shouldBreak =
                !cursor ||
                timer === null ||
                batchInputs.length >= config.TEST_DATA_BATCH_SIZE_SOFT_LIMIT

            if (to && cursor && cursor > to) {
                inputs = inputs.filter((input) => new Date(input.origin.blockTimestamp) <= to)
                shouldBreak = true
            }

            batchInputs.push(...inputs)
            if (shouldBreak) break
        }
    } catch (err) {
        clearTimeout(timer)
        const error = `Failed to generate test input data starting at ${cursor}: ${err}`
        logger.error(error)
        streamId && (await deleteCachedInputGenForStreamId(streamId))
        return { error }
    }

    // After first request.
    if (!cachedInputGen && inputGen && cursor) {
        streamId = streamId || uuid4()
        for (const chainId in inputGen.queryCursors || {}) {
            inputGen.queryCursors[chainId].inputEventIds = Array.from(
                inputGen.queryCursors[chainId].inputEventIds
            )
            inputGen.queryCursors[chainId].inputFunctionIds = Array.from(
                inputGen.queryCursors[chainId].inputFunctionIds
            )
        }
        await setCachedInputGenForStreamId(streamId, inputGen)
    }

    // Done.
    if (!cursor && streamId) {
        await deleteCachedInputGenForStreamId(streamId)
        streamId = null
    }

    return {
        data: {
            inputs: batchInputs,
            cursor: cursor?.toISOString() || null,
            streamId,
        },
    }
}

async function resolveRange(payload: GenerateTestInputsPayload): Promise<StringKeyMap> {
    const chainIds = payload.chainIds || []
    const isSingleChainId = chainIds.length === 1

    let maxToDate = payload.to ? toDate(payload.to) : null
    if (!maxToDate && payload.toBlock && isSingleChainId) {
        maxToDate = await getBlockTimestamp(payload.toBlock, chainIds[0])
    }

    let fromDate = null
    if (payload.cursor) {
        fromDate = toDate(payload.cursor)
    }
    if (!fromDate && payload.from) {
        fromDate = toDate(payload.from)
    }
    if (!fromDate && payload.fromBlock && isSingleChainId) {
        const blockTsDate = await getBlockTimestamp(payload.fromBlock, chainIds[0])
        fromDate = blockTsDate || null
    }
    if (!fromDate && payload.recent) {
        fromDate = subtractDays(new Date(nowAsUTCDateString()), 30)
    }
    if (!fromDate && !payload.allTime) {
        throw `Start of test data range couldn't be determined`
    }

    return { from: fromDate, to: maxToDate }
}

async function getBlockTimestamp(number: number, chainId: string): Promise<Date | null> {
    const schema = schemaForChainId[chainId]
    if (!schema) throw `No schema for chainId ${chainId}`
    try {
        const results =
            (await ChainTables.query(schema,
                `select timestamp from ${ident(schema)}.blocks where number = ${literal(number)}`
            )) || []
        const ts = results[0]?.timestamp
        return ts ? new Date(ts) : null
    } catch (err) {
        throw `Failed to fetch ${schema} block at ${number}: ${err}`
    }
}

export default generateInputRangeData
