import { getRpcPool } from '../lib/pool'
import config from '../lib/config'
import { AbiItem, sleep, logger, groupAbiInputsWithValues, ensureNamesExistOnAbiInputs, isDict } from '../../../shared'
import { StringKeyMap } from '../lib/types'
import errors from '../lib/errors'
import codes from '../lib/codes'

export async function callContract(
    chainId: string, 
    contractAddress: string, 
    abiItem: AbiItem, 
    inputs: any[],
): Promise<StringKeyMap> {
    if (!abiItem.outputs?.length) {
        return { data: { outputs: {}, outputArgs: [] } }
    }

    let outputValues = null
    let numAttempts = 0
    while (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
        numAttempts++
        try {
            outputValues = await getRpcPool().call(chainId, contractAddress, abiItem, inputs)
            break
        } catch (err) {
            const message = (err.message || err.toString() || '').toLowerCase()

            // Always error when reverted.
            if (message.includes('execution reverted') || message.includes('out of gas')) {
                return { error: { message: err.message, code: err.code } }
            }

            // Retry until exhausted.
            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                const hitRateLimit = message.includes('exceeded') || message.includes('too many') || err.code === 429    
                await sleep(hitRateLimit 
                    ? config.RATE_LIMIT_HIT_TIMEOUT 
                    : (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
                continue
            }

            logger.error(`[${chainId}:${contractAddress}] Error calling ${abiItem.name}: ${err}`)
            return { error: { message: errors.CALL_FAILED, code: err.code } }
        }
    }

    const abiOutputs = abiItem.outputs || []
    const hasMultipleOutputs = abiOutputs.length > 1
    let groupedOutputs = []
    if (hasMultipleOutputs) {
        if (isDict(outputValues)) {
            for (let i = 0; i < abiOutputs.length; i++) {
                groupedOutputs.push(outputValues[i.toString()])
            }
        } else {
            logger.error(
                `[${chainId}:${contractAddress}] Error parsing outputs on call to ${abiItem.name} - 
                ${JSON.stringify(abiOutputs)} - ${outputValues}: Expected tuple object structure`
            )
            return { error: { message: errors.ERROR_PARSING_CALL_OUTPUTS, code: codes.INTERNAL_SERVER_ERROR } }
        }
    } else {
        groupedOutputs = [outputValues]
    }

    let typedOutputValues = []
    try {
        typedOutputValues = groupAbiInputsWithValues(ensureNamesExistOnAbiInputs(abiOutputs), groupedOutputs)
    } catch (err) {
        logger.error(
            `[${chainId}:${contractAddress}] Error grouping outputs on call to ${abiItem.name} - 
            ${JSON.stringify(abiOutputs)} - ${groupedOutputs}: ${err}`
        )
        return { error: { message: errors.ERROR_PARSING_CALL_OUTPUTS, code: codes.INTERNAL_SERVER_ERROR } }
    }

    const outputs = {}
    const outputArgs = []
    for (let i = 0; i < typedOutputValues.length; i++) {
        const entry = typedOutputValues[i] || {}
        const name = entry.name || i.toString()
        outputArgs.push(entry.value)
        outputs[name] = entry.value
    }

    return { data: { outputs, outputArgs } }
}