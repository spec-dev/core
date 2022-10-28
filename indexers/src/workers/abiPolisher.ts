import config from '../config'
import {
    logger,
    range,
    StringKeyMap,
    StringMap,
    saveAbis,
    Abi,
    AbiItemType,
    sleep,
    toChunks,
    abiRedis
} from '../../../shared'
import { exit } from 'process'
import fetch from 'cross-fetch'
import qs from 'querystring'

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
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const group = range(start, end)
            await this._indexGroup(group)
            this.cursor = this.cursor + this.groupSize
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get this batch of abis (offset + limit).
        const contracts = await this._getContractsToRefetch(numbers)
        if (!contracts.length) return

        logger.info(`    Got ${contracts.length} contracts to refetch starting at ${contracts[0]?.address}.`)

        // Fetch & save new ABIs.
        const abisMap = await this._fetchAbis(contracts)
        await this._saveAbis(abisMap)
    }

    async _getContractsToRefetch(numbers: number[]) {
        const offset = numbers[0]
        const limit = numbers.length

        let results
        try {
            results = await abiRedis.hScan('eth-contracts', offset, { COUNT: limit })
        } catch (err) {
            logger.error(`Error getting ABIs: ${err}.`)
            return []
        }

        const tuples = results?.tuples || []

        const samczsunContracts = []
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
            
            const isFromSamczsun = !!abi.find(item => item.hasOwnProperty('signature'))
            if (isFromSamczsun) {
                samczsunContracts.push({
                    address,
                    funcSigHexes: abi.map(item => item.signature)
                })
            }
        }

        return samczsunContracts
    }

    async _fetchAbis(contracts: StringKeyMap[]): Promise<StringKeyMap> {
        const chunks = toChunks(contracts, 10) as StringKeyMap[][]

        const results = []
        for (let i = 0; i < chunks.length; i++) {
            logger.info(`    Chunk ${i + 1} / ${chunks.length}`)
            results.push(...(await this._groupFetchAbis(chunks[i])))
        }

        const abisMap = {}
        for (let i = 0; i < contracts.length; i++) {
            const abi = results[i]
            const address = contracts[i].address
            if (!abi) continue
            abisMap[address] = abi
        }
        return abisMap
    }

    async _groupFetchAbis(contracts: StringKeyMap[]): Promise<string[]> {
        const abiPromises = []

        let i = 0
        while (i < contracts.length) {
            await sleep(50)
            abiPromises.push(this._fetchAbiFromSamczsun(contracts[i]))
            i++
        }

        return await Promise.all(abiPromises)
    }

    async _fetchAbiFromSamczsun(contract: StringKeyMap, attempt: number = 1): Promise<Abi | null> {
        const { address, funcSigHexes } = contract
        logger.info(`    Fetching Samczsun ABI for ${address}...`)

        const abortController = new AbortController()
        const abortTimer = setTimeout(() => {
            logger.warn('Aborting due to timeout.')
            abortController.abort()
        }, 20000)
        let resp, error
        try {
            resp = await fetch(
                `https://sig.eth.samczsun.com/api/v1/signatures?${qs.stringify({
                    function: funcSigHexes,
                })}`,
                { signal: abortController.signal }
            )
        } catch (err) {
            error = err
        }
        clearTimeout(abortTimer)

        if (error || resp?.status !== 200) {
            logger.error(
                `[Attempt ${attempt}] Error fetching signatures from samczsun for address ${address}: ${
                    error || resp?.status
                }`
            )
            if (attempt <= 3) {
                await sleep(500)
                return this._fetchAbiFromSamczsun(contract, attempt + 1)
            }
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(
                `Error parsing json response while fetching signatures from samczsun for address ${address}: ${err}`
            )
            return null
        }

        if (!data.ok) {
            logger.error(`Fetching signatures failed for address ${address}: ${data}`)
            return null
        }

        logger.info(`    Got Samczsun ABI function results for ${address}...`)

        const functionResults = data.result?.function || {}
        const abi: Abi = []
        for (const signature in functionResults) {
            const abiItem = (functionResults[signature] || [])[0]
            if (!abiItem) continue
            const { functionName, argTypes } = this._splitSamczsunFunctionSig(abiItem.name)
            abi.push({
                name: functionName,
                type: AbiItemType.Function,
                inputs: argTypes.map(type => ({
                    type
                })),
                signature,
            })
        }
        if (!abi.length) {
            logger.info(`    No matching Samczsun ABI for ${address}...`)
            return null
        }

        logger.info('    Got abi', abi)

        return abi
    }

    async _saveAbis(abisMap: StringKeyMap) {
        const stringified: StringMap = {}

        for (const address in abisMap) {
            const abi = abisMap[address]
            const abiStr = this._stringifyAbi(address, abi)
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

    _stringifyAbi(address: string, abi: Abi): string | null {
        if (!abi) return null
        let abiStr
        try {
            abiStr = JSON.stringify(abi)
        } catch (err) {
            logger.error(`Error stringifying abi for ${address}: ${abi} - ${err}`)
            return null
        }
        return abiStr
    }

    _splitSamczsunFunctionSig(sig: string): StringKeyMap {
        const [functionName, argsGroup] = sig.split('(')
        const argTypes = argsGroup
            .slice(0, argsGroup.length - 1)
            .split(',')
            .map((a) => a.trim())
            .filter((a) => !!a)
        return {
            functionName,
            argTypes,
        }
    }
}

export function getAbiPolisher(): AbiPolisher {
    return new AbiPolisher(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}
