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
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'

const web3 = new Web3()

const ivyAbi = [{"type":"constructor","payable":false,"inputs":[{"type":"address","name":"trustedForwarder_"}],"signature":"0x88495b5f"},{"type":"event","anonymous":false,"name":"OwnershipTransferred","inputs":[{"type":"address","name":"previousOwner","indexed":true},{"type":"address","name":"newOwner","indexed":true}],"signature":"0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0"},{"type":"event","anonymous":false,"name":"SmartWalletImpSet","inputs":[{"type":"address","name":"smartWalletImpl","indexed":true}],"signature":"0xccf229c32b4b7ac08f8e696ce64fa21c8f59b7c7662fa66ceebe5bdf2a144f67"},{"type":"event","anonymous":false,"name":"WalletCreated","inputs":[{"type":"address","name":"owner","indexed":true},{"type":"address","name":"smartWallet","indexed":true}],"signature":"0x5b03bfed1c14a02bdeceb5fa582eb1a5765fc0bc64ca0e6af4c20afc9487f081"},{"type":"function","name":"getSmartWalletImpl","constant":true,"stateMutability":"view","payable":false,"inputs":[],"outputs":[{"type":"address"}],"signature":"0x6e067962"},{"type":"function","name":"initWallet","constant":false,"payable":false,"inputs":[{"type":"address","name":"user_"}],"outputs":[{"type":"address"}],"signature":"0x9da8be21"},{"type":"function","name":"initWalletWithPayment","constant":false,"stateMutability":"payable","payable":true,"inputs":[{"type":"address","name":"user_"}],"outputs":[{"type":"address"}],"signature":"0x5660356c"},{"type":"function","name":"isTrustedForwarder","constant":true,"stateMutability":"view","payable":false,"inputs":[{"type":"address","name":"forwarder"}],"outputs":[{"type":"bool"}],"signature":"0x572b6c05"},{"type":"function","name":"name","constant":true,"stateMutability":"view","payable":false,"inputs":[],"outputs":[{"type":"string"}],"signature":"0x06fdde03"},{"type":"function","name":"owner","constant":true,"stateMutability":"view","payable":false,"inputs":[],"outputs":[{"type":"address"}],"signature":"0x8da5cb5b"},{"type":"function","name":"renounceOwnership","constant":false,"payable":false,"inputs":[],"outputs":[],"signature":"0x715018a6"},{"type":"function","name":"setSmartWalletImplementation","constant":false,"payable":false,"inputs":[{"type":"address","name":"smartWalletImpl_"}],"outputs":[],"signature":"0x3b08da7c"},{"type":"function","name":"transferOwnership","constant":false,"payable":false,"inputs":[{"type":"address","name":"newOwner"}],"outputs":[],"signature":"0xf2fde38b"}]
const ivyAbiMap = {
    '0xfaf2b3ad1b211a2fe5434c75b50d256069d1b51f': JSON.stringify(ivyAbi)
}

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
        await saveAbis(ivyAbiMap, abiRedisKeys.POLYGON_CONTRACTS)
        logger.info('DONE')
        exit()

        // let cursor = null
        // let batch
        // while (true) {
        //     const results = await this._getAbisBatch(cursor || 0)
        //     cursor = results[0]
        //     batch = results[1]

        //     logger.info(`CURSOR: ${cursor}`)

        //     await this._polishAbis(batch)
    
        //     // await Promise.all([
        //     //     this._saveAbis(abisMapToSave), 
        //     //     this._saveFuncSigHashes(funcSigHashesMap),
        //     // ])

        //     if (cursor === 0) {
        //         break
        //     }
    
        //     // const start = this.cursor
        //     // const end = Math.min(this.cursor + this.groupSize - 1, this.to)
        //     // const group = range(start, end)
        //     // await this._indexGroup(group)
        //     // this.cursor = this.cursor + this.groupSize
        // }
        // logger.info('DONE')
        // logger.info(await abiRedis.sCard('refetch-abis2'))
        // exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // // Get this batch of abis (offset + limit).
        // const addressAbis = await this._getAbisBatch(numbers)
        // if (!addressAbis.length) return

        // logger.info(`    Got ${addressAbis.length} ABIs to polish starting at ${addressAbis[0]?.address}.`)

        // const [abisMapToSave, funcSigHashesMap] = this._polishAbis(addressAbis)

        // await Promise.all([
        //     this._saveAbis(abisMapToSave), 
        //     this._saveFuncSigHashes(funcSigHashesMap),
        // ])
    }

    async _getAbisBatch(inputCursor: number) {
        // const offset = numbers[0]
        // const limit = numbers.length

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

        const refetchSet = new Set()

        for (const entry of addressAbis) {
            const { address, abi = [] } = entry

            const newAbi = []
            let modified = false
            for (const item of abi) {
                if (item.inputs?.includes(null)) {
                    refetchSet.add(address)
                    break
                    // newAbi.push(item)
                    // continue
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

                // if (['function', 'constructor'].includes(item.type) && signature && !funcSigHashesMap.hasOwnProperty(signature)) {
                //     funcSigHashesMap[signature] = {
                //         name: item.name,
                //         type: item.type,
                //         inputs: (item.inputs || []).map(({ type }) => ({ type })),
                //         signature,
                //     }
                // }
            }
            if (modified) {
                // abisToUpdate[address] = newAbi
            }
        }

        const refetch = Array.from(refetchSet) as string[]
        if (refetch.length) {
            await abiRedis.sAdd('refetch-abis2', refetch)
        }

        // return [abisToUpdate, funcSigHashesMap]
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
