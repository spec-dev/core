import config from '../config'
import {
    logger,
    range,
    StringKeyMap,
    StringMap,
    saveAbis,
    saveFunctionSignatures,
    Abi,
    abiRedis
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
        console.log(await abiRedis.hLen('eth-contracts'))
        console.log(await abiRedis.hLen('eth-function-signatures'))
        // while (this.cursor < this.to) {
        //     const start = this.cursor
        //     const end = Math.min(this.cursor + this.groupSize - 1, this.to)
        //     const group = range(start, end)
        //     await this._indexGroup(group)
        //     this.cursor = this.cursor + this.groupSize
        // }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get this batch of abis (offset + limit).
        const addressAbis = await this._getAbisBatch(numbers)
        if (!addressAbis.length) return

        logger.info(`    Got ${addressAbis.length} ABIs to polish starting at ${addressAbis[0]?.address}.`)

        // Fetch & save new ABIs.
        const [abisMapToSave, funcSigHashesMap] = this._polishAbis(addressAbis)

        await Promise.all([this._saveAbis(abisMapToSave), this._saveFuncSigHashes(funcSigHashesMap)])
    }

    async _getAbisBatch(numbers: number[]) {
        const offset = numbers[0]
        const limit = numbers.length

        let results
        try {
            results = await abiRedis.hScan('eth-contracts', offset, { COUNT: limit })
        } catch (err) {
            logger.error(`Error getting ABIs: ${err}.`)
            return []
        }

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
        return batch
    }

    _polishAbis(addressAbis: StringKeyMap[]): StringKeyMap[] {
        const abisToUpdate = {}
        const funcSigHashesMap = {}

        for (const entry of addressAbis) {
            const { address, abi = [] } = entry

            const newAbi = []
            for (const item of abi) {
                let signature = item.signature

                if (!signature) {
                    signature = this._createAbiItemSignature(item)
                    if (!signature) continue
                    newAbi.push({ ...item, signature })
                }

                if (item.type === 'function' && !funcSigHashesMap.hasOwnProperty(signature)) {
                    funcSigHashesMap[signature] = {
                        name: item.name,
                        type: item.type,
                        inputs: (item.inputs || []).map(({ type }) => ({ type })),
                        signature,
                    }
                }
            }
            if (newAbi.length) {
                abisToUpdate[address] = newAbi
            }
        }

        return [abisToUpdate, funcSigHashesMap]
    }

    _createAbiItemSignature(item: StringKeyMap): string | null {
        switch (item.type) {
            case 'function':
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
