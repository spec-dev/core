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
    getMissingAbiAddresses,
} from '../../../shared'
import { exit } from 'process'
import fetch from 'cross-fetch'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import qs from 'querystring'
import { PromisePool } from '@supercharge/promise-pool'

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

        // Get this batch of contracts (offset + limit).
        const contracts = await this._getContracts(numbers)
        if (!contracts.length) return

        // Filter out contracts we've already fetched ABIs for.
        const contractsThatNeedAbis = await this._getContractsThatNeedAbis(contracts)
        if (!contractsThatNeedAbis.length) return

        // Fetch & save new ABIs.
        const abisMap = await this._fetchAbis(contractsThatNeedAbis)
        await this._saveAbis(abisMap)
    }

    async _getContracts(numbers: number[]): Promise<EthContract[]> {
        const offset = numbers[0]
        const limit = numbers.length

        try {
            return (await contractsRepo().find({
                select: { address: true, bytecode: true },
                order: { address: 'ASC' },
                skip: offset,
                take: limit,
            })) || []
        } catch (err) {
            logger.error(`Error getting contracts (offset=${offset}): ${err}`)
            return []
        }
    }

    async _getContractsThatNeedAbis(contracts: EthContract[]): Promise<EthContract[]> {
        const missingAddresses = await getMissingAbiAddresses(contracts.map(c => c.address))
        const addressesThatNeedAbis = new Set(missingAddresses)
        return contracts.filter(c => addressesThatNeedAbis.has(c.address))
    }

    async _fetchAbis(contracts: EthContract[]): Promise<StringKeyMap> {
        const { results } = await PromisePool
            .withConcurrency(5)
            .for(contracts)
            .process(c => this._fetchAbi(c))
        
        const abisMap = {}
        for (let i = 0; i < contracts.length; i++) {
            const abi = results[i]
            const address = contracts[i].address
            if (!abi) continue
            abisMap[address] = abi
        }
        return abisMap
    }

    async _fetchAbi(contract: EthContract) {
        let abi = await this._fetchAbiFromEtherscan(contract.address)
        if (abi) return abi
        return await this._fetchAbiFromSamczsun(contract)
    }

    async _fetchAbiFromEtherscan(address: string, attempt: number = 1): Promise<Abi | null> {
        let resp, error
        try {
            resp = await fetch(
                `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${config.ETHERSCAN_API_KEY}`
            )
        } catch (err) {
            error = err
        }

        if (error || resp?.status !== 200) {
            logger.error(`[Attempt ${attempt}] Error fetching ABI from etherscan for address ${address}: ${error || resp?.status}`)
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
            return null
        }

        let abi
        try {
            abi = JSON.parse(data.result) as Abi
        } catch (err) {
            logger.error(`Error parsing JSON ABI from etherscan for address ${address}: ${err}`)
            return null
        }

        return abi
    }

    async _fetchAbiFromSamczsun(contract: EthContract, attempt: number = 1): Promise<Abi | null> {
        const { address, bytecode } = contract

        let funcSigHexes
        try {
            funcSigHexes = selectorsFromBytecode(bytecode)
        } catch (err) {
            logger.error(`Error extracting function sig hexes from bytecode for contract ${address}: ${err}`)
            return null
        }

        let resp, error
        try {
            resp = await fetch(`https://sig.eth.samczsun.com/api/v1/signatures?${qs.stringify({ function: funcSigHexes })}`)
        } catch (err) {
            error = err
        }

        if (error || resp?.status !== 200) {
            logger.error(`[Attempt ${attempt}] Error fetching signatures from samczsun for address ${address}: ${error || resp?.status}`)
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
            logger.error(
                `Fetching signatures failed for address ${address}: ${data}`
            )
            return null
        }

        const functionResults = data.result?.function || {}
        const abi: Abi = []
        for (const signature in functionResults) {
            const abiItem = (functionResults[signature] || [])[0]
            if (!abiItem) continue
            const { functionName, argTypes } = this._splitSamczsunFunctionSig(abiItem.name)
            abi.push({
                name: functionName,
                type: AbiItemType.Function,
                inputs: argTypes.map(type => { type }),
                signature,
            })
        }
        if (!abi.length) return null

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
        if (!Object.keys(stringified).length) return

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
            .map(a => a.trim())
            .filter(a => !!a)
        return {
            functionName,
            argTypes,
        }
    }
}

export function getAbiWorker(): AbiWorker {
    return new AbiWorker(
        config.FROM, 
        config.TO,
        config.RANGE_GROUP_SIZE, 
    )
}