import config from '../config'
import {
    logger,
    range,
    StringKeyMap,
    StringMap,
    saveAbis,
    saveFunctionSignatures,
    Abi,
    abiRedis,
    getAbi,
    abiRedisKeys,
    minimizeAbiInputs,
    CoreDB,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'

const web3 = new Web3()

class AbiPolisher {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
    }

    async run() {
        let cursor = null
        let batch
        let count = 0
        while (true) {
            const results = await this._getAbisBatch(cursor || 0)
            cursor = results[0]
            batch = results[1]
            count += 2500
            logger.info('\nCOUNT', count.toLocaleString())

            const funcSigHashesMap = await this._polishAbis(batch)
            await this._saveFuncSigHashes(funcSigHashesMap)

            if (cursor === 0) {
                break
            }
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // // Get this batch of abis (offset + limit).
        // const addressAbis = await this._getAbisBatch(numbers)
        // if (!addressAbis.length) return

        // logger.info(`    Got ${addressAbis.length} ABIs to polish starting at ${addressAbis[0]?.address}.`)

        // const [abisMapToSave, funcSigHashesMap] = await this._polishAbis(addressAbis)

        // await Promise.all([
        //     this._saveAbis(abisMapToSave), 
        //     this._saveFuncSigHashes(funcSigHashesMap),
        // ])
    }

    async _getAbisBatch(inputCursor: number) {
        let results
        try {
            results = await abiRedis.hScan('eth-contracts', inputCursor, { COUNT: 2500, MATCH: '*' })
        } catch (err) {
            logger.error(`Error getting ABIs: ${err}.`)
            return []
        }

        const cursor = results.cursor
        const tuples = results.tuples || []
        const batch = []
        for (const entry of tuples) {
            const address = entry.field
            let abi = entry.value
            if (!abi) continue
            try {
                abi = JSON.parse(abi) || []
            } catch (err) {
                logger.error(`Error parsing ABI: ${err}.`)
                continue
            }
            batch.push({ address, abi })
        }
        return [cursor, batch]
    }

    async _polishAbis(addressAbis: StringKeyMap[]) {
        const funcSigHashesMap = {}
        for (const entry of addressAbis) {
            const { abi = [] } = entry
            for (const item of abi) {
                if (['function', 'constructor'].includes(item.type) && 
                    item.signature && 
                    !funcSigHashesMap.hasOwnProperty(item.signature)) {
                    funcSigHashesMap[item.signature] = {
                        name: item.name,
                        type: item.type,
                        inputs: minimizeAbiInputs(item.inputs),
                        signature: item.signature,
                    }
                }
            }
        }
        return funcSigHashesMap
    }

    _createAbiItemSignature(item: StringKeyMap): string | null {
        switch (item.type) {
            case 'function':
            case 'constructor':
                return web3.eth.abi.encodeFunctionSignature(item as any)
            case 'event':
                return web3.eth.abi.encodeEventSignature(item as any)
            default:
                return null
        }
    }

    async _saveAbis(abisMap: StringKeyMap) {
        const stringified: StringMap = {}

        for (const address in abisMap) {
            const abi = abisMap[address]
            const abiStr = this._stringify(abi)
            if (!abiStr) continue
            stringified[address] = abiStr
        }
        if (!Object.keys(stringified).length) {
            logger.info(`    No stringified ABIs.`)
            return
        }

        logger.info(`    Saving ${Object.keys(stringified).length} ABIs...`)
        
        if (!(await saveAbis(stringified))) {
            logger.error(`Failed to save ABI batch.`)
            return
        }
    }

    async _saveFuncSigHashes(funcSigHashes: StringKeyMap) {
        const stringified: StringMap = {}

        for (const signature in funcSigHashes) {
            const abiItem = funcSigHashes[signature]
            const abiStr = this._stringify(abiItem)
            if (!abiStr) continue
            stringified[signature] = abiStr
        }
        if (!Object.keys(stringified).length) {
            logger.info(`    No stringified function sig hashes.`)
            return
        }

        logger.info(`    Saving ${Object.keys(stringified).length} function sig hashes...`)

        if (!(await saveFunctionSignatures(stringified))) {
            logger.error(`Failed to save function sig hashes.`)
            return
        }
    }

    _stringify(abi: Abi): string | null {
        if (!abi) return null
        let abiStr
        try {
            abiStr = JSON.stringify(abi)
        } catch (err) {
            logger.error(`Error stringifying abi: ${abi} - ${err}`)
            return null
        }
        return abiStr
    }
}

export function getAbiPolisher(): AbiPolisher {
    return new AbiPolisher(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}