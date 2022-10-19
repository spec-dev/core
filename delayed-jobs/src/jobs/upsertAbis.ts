import {
    logger,
    StringKeyMap,
    StringMap,
    saveAbis,
    Abi,
    AbiItemType,
    sleep,
    toChunks,
    EthContract,
    SharedTables,
    In,
    ev,
    abiRedis,
} from '../../../shared'
import fetch from 'cross-fetch'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import qs from 'querystring'

const providers = {
    ETHERSCAN: 'etherscan',
    SAMCZSUN: 'samczsun',
}

const ETHERSCAN_API_KEY = ev('ETHERSCAN_API_KEY')

const contractsRepo = () => SharedTables.getRepository(EthContract)

async function upsertAbis(addresses: string[]) {
    logger.info(`Processing ${addresses.length} to upsert....`)

    // Try Etherscan first.
    const etherscanAbisMap = await fetchAbis(addresses, providers.ETHERSCAN)
    const addressesNotVerifiedOnEtherscan = addresses.filter(a => !etherscanAbisMap.hasOwnProperty(a))

    // Fall back to Samczsun.
    let samczsunAbisMap = {}
    if (addressesNotVerifiedOnEtherscan.length) {
        await SharedTables.initialize()
        const contracts = await getContracts(addressesNotVerifiedOnEtherscan)
        if (contracts.length) {
            samczsunAbisMap = await fetchAbis(contracts, providers.SAMCZSUN)
        }
    }

    const numAbisFromEtherscan = Object.keys(etherscanAbisMap).length
    const numAbisFromSamczsun = Object.keys(samczsunAbisMap).length
    logger.info(
        `Upserting ABIs:\n  Etherscan: ${numAbisFromEtherscan}\n  Samczsun: ${numAbisFromSamczsun}`
    )

    if (!abiRedis.isOpen) {
        await abiRedis.connect()
    }
    
    await saveAbisMap({ ...etherscanAbisMap, ...samczsunAbisMap })
}

async function getContracts(addresses: string[]): Promise<EthContract[]> {
    try {
        return (await contractsRepo().find({
            select: { address: true, bytecode: true },
            where: { address: In(addresses) }
        })) || []
    } catch (err) {
        logger.error(`Error getting contracts: ${err}`)
        return []
    }
}

async function fetchAbis(data: string[] | EthContract[], provider: string): Promise<StringKeyMap> {
    const chunks = toChunks(data, 5) as string[][]

    const results = []
    for (let i = 0; i < chunks.length; i++) {
        results.push(...(await groupFetchAbis(chunks[i], provider)))
    }

    const abisMap = {}
    for (let i = 0; i < data.length; i++) {
        const abi = results[i]
        if (!abi) continue

        let address
        if (provider === providers.ETHERSCAN) {
            address = data[i] as string
        } else {
            const contract = data[i] as EthContract
            address = contract?.address
        }
        if (!address) continue

        abisMap[address] = abi
    }

    return abisMap
}

async function groupFetchAbis(data: string[] | EthContract[], provider: string): Promise<string[]> {        
    const abiPromises = []

    let i = 0
    while (i < data.length) {
        await sleep(200)
        abiPromises.push(fetchAbi(data[i], provider))
        i++
    }

    return await Promise.all(abiPromises)
}

async function fetchAbi(data: string | EthContract, provider: string) {
    switch (provider) {
        case providers.ETHERSCAN:
            return await fetchAbiFromEtherscan(data as string)
        case providers.SAMCZSUN:
            return await fetchAbiFromSamczsun(data as EthContract)
        default:
            return null
    }
}

async function fetchAbiFromEtherscan(address: string, attempt: number = 1): Promise<Abi | null> {    
    const abortController = new AbortController()
    const abortTimer = setTimeout(() => {
        logger.warn('Aborting due to timeout.')
        abortController.abort()
    }, 20000)
    
    let resp, error
    try {
        resp = await fetch(
            `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`, 
            { signal: abortController.signal }
        )
    } catch (err) {
        error = err
    }
    clearTimeout(abortTimer)

    if (error || resp?.status !== 200) {
        logger.error(`[Attempt ${attempt}] Error fetching ABI from etherscan for address ${address}: ${error || resp?.status}`)
        if (attempt <= 3) {
            await sleep(300)
            return fetchAbiFromEtherscan(address, attempt + 1)
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
            await sleep(300)
            return fetchAbiFromEtherscan(address, attempt)
        }
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

async function fetchAbiFromSamczsun(contract: EthContract, attempt: number = 1): Promise<Abi | null> {
    const { address, bytecode } = contract

    let funcSigHexes
    try {
        funcSigHexes = selectorsFromBytecode(bytecode)
    } catch (err) {
        logger.error(`Error extracting function sig hexes from bytecode for contract ${address}: ${err}`)
        return null
    }

    const abortController = new AbortController()
    const abortTimer = setTimeout(() => {
        logger.warn('Aborting due to timeout.')
        abortController.abort()
    }, 20000)
    let resp, error
    try {
        resp = await fetch(
            `https://sig.eth.samczsun.com/api/v1/signatures?${qs.stringify({ function: funcSigHexes })}`,
            { signal: abortController.signal },
        )
    } catch (err) {
        error = err
    }
    clearTimeout(abortTimer)

    if (error || resp?.status !== 200) {
        logger.error(`[Attempt ${attempt}] Error fetching signatures from samczsun for address ${address}: ${error || resp?.status}`)
        if (attempt <= 3) {
            await sleep(300)
            return fetchAbiFromSamczsun(contract, attempt + 1)
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
        const { functionName, argTypes } = splitSamczsunFunctionSig(abiItem.name)
        abi.push({
            name: functionName,
            type: AbiItemType.Function,
            inputs: argTypes.map(type => { type }),
            signature,
        })
    }
    if (!abi.length) {
        return null
    }

    return abi
}

async function saveAbisMap(abisMap: StringKeyMap) {
    const stringified: StringMap = {}

    for (const address in abisMap) {
        const abi = abisMap[address]
        const abiStr = stringifyAbi(address, abi)
        if (!abiStr) continue
        stringified[address] = abiStr
    }
    if (!Object.keys(stringified).length) {
        return
    }

    if (!(await saveAbis(stringified))) {
        logger.error(`Failed to save ABI batch.`)
        return
    }
}

function stringifyAbi(address: string, abi: Abi): string | null {
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

function splitSamczsunFunctionSig(sig: string): StringKeyMap {
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

export default function job(params: StringKeyMap) {
    const addresses = params.addresses || []
    return {
        perform: async () => upsertAbis(addresses)
    }
}