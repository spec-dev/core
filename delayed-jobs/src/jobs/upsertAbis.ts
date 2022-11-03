import {
    logger,
    StringKeyMap,
    StringMap,
    saveAbis,
    saveFunctionSignatures,
    Abi,
    AbiItemType,
    sleep,
    toChunks,
    EthContract,
    SharedTables,
    In,
    ev,
    functionSignatureToAbiInputs,
    minimizeAbiInputs,
} from '../../../shared'
import fetch from 'cross-fetch'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import qs from 'querystring'
import Web3 from 'web3'

const web3 = new Web3()

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

    const [abisMap, funcSigHashesMap] = polishAbis({ ...etherscanAbisMap, ...samczsunAbisMap })

    await Promise.all([
        saveAbisMap(abisMap),
        saveFuncSigHashes(funcSigHashesMap),
    ])
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
        return null
    }

    return abi
}

function polishAbis(abis: StringKeyMap): StringKeyMap[] {
    const abisMap = {}
    const funcSigHashesMap = {}

    for (const address in abis) {
        const abi = abis[address]
        const newAbi = []

        for (const item of abi) {
            let signature = item.signature
            if (signature) {
                newAbi.push(item)
            } else {
                signature = createAbiItemSignature(item)
                if (signature) {
                    newAbi.push({ ...item, signature })
                } else {
                    newAbi.push(item)
                }
            }

            if (['function', 'constructor'].includes(item.type) && signature && !funcSigHashesMap.hasOwnProperty(signature)) {
                funcSigHashesMap[signature] = {
                    name: item.name,
                    type: item.type,
                    inputs: minimizeAbiInputs(item.inputs),
                    signature,
                }
            }
        }

        abisMap[address] = newAbi
    }

    return [abisMap, funcSigHashesMap]
}

function createAbiItemSignature(item: StringKeyMap): string | null {
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

async function saveAbisMap(abisMap: StringKeyMap) {
    const stringified: StringMap = {}

    for (const address in abisMap) {
        const abi = abisMap[address]
        const abiStr = stringify(abi)
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

async function saveFuncSigHashes(funcSigHashes: StringKeyMap) {
    const stringified: StringMap = {}

    for (const signature in funcSigHashes) {
        const abiItem = funcSigHashes[signature]
        const abiStr = stringify(abiItem)
        if (!abiStr) continue
        stringified[signature] = abiStr
    }
    if (!Object.keys(stringified).length) {
        return
    }

    if (!(await saveFunctionSignatures(stringified))) {
        logger.error(`Failed to save function sig hashes.`)
        return
    }
}

function stringify(abi: any): string | null {
    if (!abi) return null
    let abiStr
    try {
        abiStr = JSON.stringify(abi)
    } catch (err) {
        logger.error(`Error stringifying abi for: ${abi} - ${err}`)
        return null
    }
    return abiStr
}

export default function job(params: StringKeyMap) {
    const addresses = params.addresses || []
    return {
        perform: async () => upsertAbis(addresses)
    }
}