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
        await abiRedis.del(abiRedisKeys.ETH_FUNCTION_SIGNATURES)
        await abiRedis.del('repull-sam')

        let cursor = null
        let batch
        let count = 0
        let i = 0
        while (true) {
            const results = await this._getAbisBatch(cursor || 0)
            cursor = results[0]
            batch = results[1]
            count += 1000
            logger.info('\nCOUNT', count.toLocaleString())

            const repullSam = []
            for (const entry of batch) {
                const { address, abi = [] } = entry
    
                let isFromSamczsun = true
                for (const item of abi) {
                    if (item.type !== 'function') {
                        isFromSamczsun = false
                        break
                    }
                    for (const input of item.inputs || []) {
                        if (Object.keys(input).filter(k => k !== 'type').length) {
                            isFromSamczsun = false
                            break
                        }
                    }
                }

                if (isFromSamczsun) {
                    repullSam.push(address)
                }
            }

            if (repullSam.length) {
                const members = []
                for (const address of repullSam) {
                    members.push({ score: i, value: address })
                    i++
                }
                logger.info(`    ${members.length}`)
                // console.log(JSON.stringify(repullSam, null, 4))
                await abiRedis.zAdd('repull-sam', members)
            }

            // await this._findSamczsunAbis(batch)

            // const [abisMapToSave, funcSigHashesMap] = await this._polishAbis(batch)

            // await Promise.all([
            //     this._saveAbis(abisMapToSave), 
            //     this._saveFuncSigHashes(funcSigHashesMap),
            // ])

            if (cursor === 0) {
                break
            }
        }
        logger.info('DONE')
        logger.info(await abiRedis.zCard('repull-sam'))
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
            results = await abiRedis.hScan('eth-contracts', inputCursor, { COUNT: 1000, MATCH: '*' })
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
        const abisToUpdate = {}
        const funcSigHashesMap = {}

        const deleteAbisSet = new Set()

        for (const entry of addressAbis) {
            const { address, abi = [] } = entry

            const newAbi = []
            let modified = false
            for (const item of abi) {
                if (item.inputs?.includes(null)) {
                    deleteAbisSet.add(address)
                    modified = false
                    break
                }

                let signature = item.signature

                if (signature) {
                    newAbi.push(item)
                } else {
                    signature = this._createAbiItemSignature(item)
                    if (signature) {
                        modified = true
                        newAbi.push({ ...item, signature })
                    } else {
                        newAbi.push(item)
                    }
                }

                if (['function', 'constructor'].includes(item.type) && signature && !funcSigHashesMap.hasOwnProperty(signature)) {
                    funcSigHashesMap[signature] = {
                        name: item.name,
                        type: item.type,
                        inputs: (item.inputs || []).map(({ type }) => ({ type })),
                        signature,
                    }
                }
            }
            if (modified) {
                abisToUpdate[address] = newAbi
            }
        }

        const deleteAbiAddresses = Array.from(deleteAbisSet) as string[]
        if (deleteAbiAddresses.length) {
            await abiRedis.sAdd('delete-nulls', deleteAbiAddresses)
        }

        return [abisToUpdate, funcSigHashesMap]
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