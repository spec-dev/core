import { getGeneratedEventsCursors, getReorg, logger, StringKeyMap, supportedChainIds } from '../../../shared'

export async function getMostRecentBlockNumbers(request) {
    const currentHeads = await getGeneratedEventsCursors()
    for (const chainId in currentHeads) {
        currentHeads[chainId] = Number(currentHeads[chainId])
    }
    request.end(currentHeads)
}

export async function isReorgValid(request) {
    let { id: uid, chainId, blockNumber } = request.data || {} as StringKeyMap
    if (!uid || !chainId || blockNumber === null || !supportedChainIds.has(chainId)) {
        logger.error(`Invalid reorg validation request`, request.data)
        request.end({ isValid: false })
        return
    }
    blockNumber = parseInt(blockNumber)
    if (Number.isNaN(blockNumber)) {
        logger.error(`Invalid reorg validation request: blockNumber can't be converted to int:`, request.data)
        request.end({ isValid: false })
        return
    }

    const reorg = await getReorg(uid)
    if (!reorg) {
        logger.error(`Invalid reorg for uid: ${uid}. Reorg not found.`)
        request.end({ isValid: false })
        return
    }

    if (reorg.chainId !== chainId) {
        logger.error(`Invalid reorg for uid: ${uid}. chainId doesn't match ${chainId} vs. ${reorg.chainId}`)
        request.end({ isValid: false })
        return
    }

    if (Number(reorg.fromNumber) !== blockNumber) {
        logger.error(`Invalid reorg for uid: ${uid}. blockNumber doesn't match ${reorg.fromNumber} vs. ${blockNumber}`)
        request.end({ isValid: false })
        return
    }

    request.end({ isValid: true })
}