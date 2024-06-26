import config from '../config'
import {
    logger,
    range,
    StringKeyMap,
    EthContract,
    SharedTables,
    StringMap,
    saveAbis,
    Abi,
    AbiItemType,
    sleep,
    toChunks,
    getMissingAbiAddresses,
    abiRedis,
    functionSignatureToAbiInputs,
    In,
    abiRedisKeys
} from '../../../shared'
import { exit } from 'process'
import fetch from 'cross-fetch'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import qs from 'querystring'
import Web3 from 'web3'

const web3 = new Web3()

const contractsRepo = () => SharedTables.getRepository(EthContract)

class AbiWorker {
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
        // let cursor = null
        // let batch
        // let count = 0
        // while (true) {
        //     const results = await this._getAddressesBatch(cursor || 0)
        //     cursor = results[0]
        //     batch = results[1]
        //     count += 1000
        //     logger.info('\nCOUNT', count.toLocaleString())

        //     // Get this batch of contracts (offset + limit).
        //     const contracts = await this._getContracts(batch)
        //     if (!contracts.length) continue

        //     // Fetch & save new ABIs.
        //     let abisMap = await this._fetchAbis(contracts)

        //     // Polish abis.
        //     abisMap = this._polishAbis(abisMap)

        //     if (Object.keys(abisMap).length) {
        //         await this._saveAbis(abisMap)
        //     }

        //     const addressesToDelete = batch.filter(addr => !abisMap.hasOwnProperty(addr)) as string[]
        //     if (addressesToDelete.length) {
        //         logger.info(`Deleting ${addressesToDelete.length} addresses...`)
        //         await abiRedis.hDel(abiRedisKeys.ETH_CONTRACTS, addressesToDelete)
        //     }

        //     if (cursor === 0) break
        // }
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

        const addresses = await this._getAddressesBatch(numbers)

        // Get this batch of contracts (offset + limit).
        const contracts = await this._getContracts(addresses)
        if (!contracts.length) return

        // logger.info(`    Got ${contracts.length} contracts.`)

        // Filter out contracts we've already fetched ABIs for.
        const contractsThatNeedAbis = await this._getContractsThatNeedAbis(contracts)
        if (!contractsThatNeedAbis.length) return

        // logger.info(`    ${contractsThatNeedAbis.length} contracts need ABIs....`)

        // Fetch & save new ABIs.
        let abisMap = await this._fetchAbis(contractsThatNeedAbis)

        // Polish abis.
        // abisMap = this._polishAbis(abisMap)

        await this._saveAbis(abisMap)
    }

    _polishAbis(abis: StringKeyMap): StringKeyMap {
        const abisMap = {}
    
        for (const address in abis) {
            const abi = abis[address]
            const newAbi = []
    
            for (const item of abi) {
                if (item.inputs?.includes(null)) {
                    break
                }

                let signature = item.signature
                if (signature) {
                    newAbi.push(item)
                } else {
                    signature = this._createAbiItemSignature(item)
                    if (signature) {
                        newAbi.push({ ...item, signature })
                    } else {
                        newAbi.push(item)
                    }
                }
            }
            
            if (newAbi.length) {
                abisMap[address] = newAbi
            }
        }
    
        return abisMap
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

    async _getAddressesBatch(numbers: number[]): Promise<string[]> {
        const start = numbers[0]
        const end = numbers[numbers.length - 1]

        let addresses
        try {
            addresses = await abiRedis.zRange('repull-sam', start, end)
        } catch (err) {
            logger.error(`Error getting addresses: ${err}.`)
            return []
        }
        return addresses || []
    }

    async _getContracts(addresses: string[]): Promise<EthContract[]> {
        try {
            return (
                (await contractsRepo().find({
                    select: { address: true, bytecode: true },
                    where: {
                        address: In(addresses)
                    }
                    // order: { address: 'ASC' },
                    // skip: offset,
                    // take: limit,
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting contracts (offset=): ${err}`)
            return []
        }
    }

    async _getContractsThatNeedAbis(contracts: EthContract[]): Promise<EthContract[]> {
        return contracts
        // const missingAddresses = await getMissingAbiAddresses(contracts.map(c => c.address))
        // const addressesThatNeedAbis = new Set(missingAddresses)
        // return contracts.filter(c => addressesThatNeedAbis.has(c.address))
    }

    async _fetchAbis(contracts: EthContract[]): Promise<StringKeyMap> {
        const chunks = toChunks(contracts, 10) as EthContract[][]

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

    async _groupFetchAbis(contracts: EthContract[]): Promise<string[]> {
        const abiPromises = []

        let i = 0
        while (i < contracts.length) {
            await sleep(25)
            abiPromises.push(this._fetchAbi(contracts[i]))
            i++
        }

        return await Promise.all(abiPromises)
    }

    async _fetchAbi(contract: EthContract) {
        // let abi = await this._fetchAbiFromEtherscan(contract.address)
        // if (abi) return abi
        return await this._fetchAbiFromSamczsun(contract)
    }

    async _fetchAbiFromEtherscan(address: string, attempt: number = 1): Promise<Abi | null> {
        logger.info(`    Fetching Etherscan ABI for ${address}...`)

        const abortController = new AbortController()
        const abortTimer = setTimeout(() => {
            logger.warn('Aborting due to timeout.')
            abortController.abort()
        }, 20000)
        let resp, error
        try {
            resp = await fetch(
                `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${config.ETHERSCAN_API_KEY}`,
                { signal: abortController.signal }
            )
        } catch (err) {
            error = err
        }
        clearTimeout(abortTimer)

        if (error || resp?.status !== 200) {
            logger.error(
                `[Attempt ${attempt}] Error fetching ABI from etherscan for address ${address}: ${
                    error || resp?.status
                }`
            )
            if (attempt <= 3) {
                await sleep(500)
                return this._fetchAbiFromEtherscan(address, attempt + 1)
            }
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(
                `Error parsing json response while fetching ABI from etherscan for address ${address}: ${err}`
            )
            return null
        }

        if (data.status != 1 || !data.result) {
            if (data.result?.toLowerCase()?.includes('rate limit')) {
                await sleep(500)
                return this._fetchAbiFromEtherscan(address, attempt)
            }
            logger.info(`    No Etherscan ABI for ${address}.`)
            return null
        }

        let abi
        try {
            abi = JSON.parse(data.result) as Abi
        } catch (err) {
            logger.error(`Error parsing JSON ABI from etherscan for address ${address}: ${err}`)
            return null
        }

        logger.info(`    Got Etherscan ABI for ${address}.`)

        return abi
    }

    async _fetchAbiFromSamczsun(contract: EthContract, attempt: number = 1): Promise<Abi | null> {
        const { address, bytecode } = contract
        // logger.info(`    Getting Samczsun selectors from bytecode for ${address}...`)

        let funcSigHexes
        try {
            funcSigHexes = selectorsFromBytecode(bytecode)
        } catch (err) {
            logger.error(
                `Error extracting function sig hexes from bytecode for contract ${address}: ${err}`
            )
            return null
        }

        // logger.info(`    Fetching Samczsun ABI for ${address}...`)

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

        // logger.info(`    Got Samczsun ABI function results for ${address}...`)

        const functionResults = data.result?.function || {}
        const abi: Abi = []
        for (const signature in functionResults) {
            const abiItem = (functionResults[signature] || [])[0]
            if (!abiItem) continue
            let functionName, inputs
            try {
                ;({ functionName, inputs } = functionSignatureToAbiInputs(abiItem.name))
            } catch (err) {
                logger.error(err)
                continue
            }
            if (!functionName) continue
            abi.push({
                name: functionName,
                type: AbiItemType.Function,
                inputs: inputs,
                signature,
            })
        }
        if (!abi.length) {
            // logger.info(`    No matching Samczsun ABI for ${address}...`)
            return null
        }

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

    // _splitSamczsunFunctionSig(sig: string): StringKeyMap {
    //     const [functionName, argsGroup] = sig.split('(')
    //     const argTypes = argsGroup
    //         .slice(0, argsGroup.length - 1)
    //         .split(',')
    //         .map((a) => a.trim())
    //         .filter((a) => !!a)
    //     return {
    //         functionName,
    //         argTypes,
    //     }
    // }

    _recurse(val: string, stack: number = 0) {
    
        for (let i = 0; i < val.length; i++) {
            const char = val[i]
            if (char ==='(' || char === '[') {
                stack++
                return this._recurse(val.slice(i + 1, stack))
            }
            if (char === ')' || char === ']') {
                return val.slice(0, i)
            }
        }

    }
}

export function getAbiWorker(): AbiWorker {
    return new AbiWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}
