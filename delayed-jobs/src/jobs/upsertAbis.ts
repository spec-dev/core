import {
    logger,
    StringKeyMap,
    StringMap,
    saveAbisMap,
    saveFunctionSignatures,
    Abi,
    AbiItem,
    AbiItemType,
    sleep,
    toChunks,
    EthContract,
    ChainTables,
    functionSignatureToAbiInputs,
    createAbiItemSignature,
    chainIds,
    schemaForChainId,
    polishAbis,
    range,
    getAbis,
} from '../../../shared'
import fetch from 'cross-fetch'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import qs from 'querystring'
import Web3 from 'web3'
import { ident } from 'pg-format'
import config from '../config'
import { camelizeKeys } from 'humps'

const web3 = new Web3()

const PROXY_UPGRADED_TOPIC = '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b'

export const providers = {
    STARSCAN: '*scan',
    SAMCZSUN: 'samczsun',
}

const starscanHostnames = {
    [chainIds.ETHEREUM]: 'api.etherscan.io',
    [chainIds.GOERLI]: 'api-goerli.etherscan.io',
    [chainIds.POLYGON]: 'api.polygonscan.com',
    [chainIds.MUMBAI]: 'api-testnet.polygonscan.com',
}

const starscanApiKey = {
    [chainIds.ETHEREUM]: config.ETHERSCAN_API_KEY,
    [chainIds.GOERLI]: config.GOERLISCAN_API_KEY,
    [chainIds.POLYGON]: config.POLYGONSCAN_API_KEY,
    [chainIds.MUMBAI]: config.MUMBAISCAN_API_KEY,
}

async function upsertAbis(
    addresses: string[],
    chainId: string,
    overwriteWithStarscan?: boolean,
    overwriteWithSamczsun?: boolean,
) {
    logger.info(`Processing ${addresses.length} addresses to pull ABIs for....`)

    const existingAbis = await getAbis(addresses, chainId)
    if (existingAbis === null) return

    const addressesAlreadyWithAbis = new Set(Object.keys(existingAbis))
    const newAddresses = addresses.filter(a => !addressesAlreadyWithAbis.has(a))

    if (!newAddresses.length && !overwriteWithStarscan) {
        logger.info(`All ABIs already pulled.`)
        return
    }

    // Try one of the *scan providers first.
    const addressesToFetchWithStarScan = overwriteWithStarscan ? addresses : newAddresses
    const starScanAbisMap = await fetchAbis(addressesToFetchWithStarScan, providers.STARSCAN, chainId)
    const addressesMissingFromStarscan = addressesToFetchWithStarScan.filter(a => !starScanAbisMap.hasOwnProperty(a))

    // Fall back to Samczsun.
    let samczsunAbisMap = {}
    if (addressesMissingFromStarscan.length) {
        const addressesToFetchWithSamczsun = overwriteWithSamczsun 
            ? addressesMissingFromStarscan 
            : addressesMissingFromStarscan.filter(a => !addressesAlreadyWithAbis.has(a))

        const contracts = await getContracts(addressesToFetchWithSamczsun, chainId)
        if (contracts.length) {
            samczsunAbisMap = await fetchAbis(contracts, providers.SAMCZSUN, chainId)
        }
    }

    const numAbisFromStarscan = Object.keys(starScanAbisMap).length
    const numAbisFromSamczsun = Object.keys(samczsunAbisMap).length
    logger.info(
        `Upserting ABIs:\n  Starscan: ${numAbisFromStarscan}\n  Samczsun: ${numAbisFromSamczsun}`
    )

    const [abisMap, funcSigHashesMap] = polishAbis({ ...starScanAbisMap, ...samczsunAbisMap })

    await Promise.all([
        saveAbisMap(abisMap, chainId),
        saveFuncSigHashes(funcSigHashesMap),
    ])
}

async function getContracts(addresses: string[], chainId: string): Promise<EthContract[]> {
    const schema = schemaForChainId[chainId]
    if (!schema) {
        logger.error(`No schema found for chain id ${chainId}.`)
        return []
    }

    const phs = range(1, addresses.length).map(i => `$${i}`)
    try {
        return (await ChainTables.query(schema,
            `select "address", "bytecode" from ${ident(schema)}."contracts" where "address" in (${phs.join(', ')})`,
            addresses,
        )) as EthContract[]
    } catch (err) {
        logger.error(`Error querying ${ident(schema)}."contracts": ${err}`)
        return []
    }
}

export async function fetchAbis(
    data: any[],
    provider: string,
    chainId: string,
): Promise<StringKeyMap> {
    if (!data.length) return {}

    const chunks = toChunks(data, 5) as string[][]

    const results = []
    for (let i = 0; i < chunks.length; i++) {
        results.push(...(await groupFetchAbis(chunks[i], provider, chainId)))
    }

    const abisMap = {}
    for (let i = 0; i < data.length; i++) {
        const abi = results[i]
        if (!abi) continue

        let address
        if (provider === providers.STARSCAN) {
            address = data[i] as string
        } else {
            const contract = data[i]
            address = contract?.address
        }
        if (!address) continue

        abisMap[address] = abi
    }

    return abisMap
}

async function groupFetchAbis(data: any[], provider: string, chainId: string): Promise<string[]> {        
    const abiPromises = []

    let i = 0
    while (i < data.length) {
        await sleep(200)
        abiPromises.push(fetchAbi(data[i], provider, chainId))
        i++
    }

    return await Promise.all(abiPromises)
}

async function fetchAbi(data: any, provider: string, chainId: string): Promise<Abi | null> {
    // Use samczsun if not pulling from etherscan/polyscan/etc.
    if (provider !== providers.STARSCAN) {
        return fetchAbiFromSamczsun(data)
    }

    // Fetch from etherscan/polyscan/etc.
    const abi = await fetchAbiFromStarscan(data, chainId)
    if (!abi) return null

    // Detect if contract could be a proxy contract.
    const upgradedAbiItem = abi.find(item => item.name === 'Upgraded' && item.type === AbiItemType.Event)
    const isUpgradableProxy = !!upgradedAbiItem && createAbiItemSignature(upgradedAbiItem) === PROXY_UPGRADED_TOPIC
    if (!isUpgradableProxy) return abi
        
    // Find the most recent Upgraded event emitted by this contract.
    const upgradedEventLog = await getFirstProxyUpgradedEventLog(data, chainId)
    if (!upgradedEventLog) return abi

    // Get proxy implementation address from event args.
    const implementationAddress = decodeUpgradedEventForImplementationAddress(
        upgradedAbiItem,
        upgradedEventLog,
    )
    if (!implementationAddress) return abi

    logger.info(`Detected potential proxy contract ${data}.`)

    // Get implementation contract ABI.
    const implementationAbi = await fetchAbiFromStarscan(implementationAddress, chainId)
    if (!implementationAbi) {
        logger.warn(`[${chainId}] Unable to find ABI for implementation contract ${implementationAddress}.`)
        return abi
    }

    // Return merged proxy + implementation abi.
    const fullAbi = [...abi, ...implementationAbi]
    return fullAbi
}

async function fetchAbiFromStarscan(address: string, chainId: string, attempt: number = 1): Promise<Abi | null> {
    const hostname = starscanHostnames[chainId]
    if (!hostname) {
        logger.error(`No star-scan hostname for chain id: ${chainId}`)
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
            `https://${hostname}/api?module=contract&action=getabi&address=${address}&apikey=${starscanApiKey[chainId]}`, 
            { signal: abortController.signal }
        )
    } catch (err) {
        error = err
    }
    clearTimeout(abortTimer)

    if (error || resp?.status !== 200) {
        logger.error(`[Attempt ${attempt}] Error fetching ABI from starscan for address ${address}: ${error || resp?.status}`)
        if (attempt <= 3) {
            await sleep(300)
            return fetchAbiFromStarscan(address, chainId, attempt + 1)
        }
        return null
    }

    let data: StringKeyMap = {}
    try {
        data = await resp.json()
    } catch (err) {
        logger.error(
            `Error parsing json response while fetching ABI from starscan for address ${address}: ${err}`
        )
        return null
    }

    if (data.status != 1 || !data.result) {
        if (data.result?.toLowerCase()?.includes('rate limit')) {
            await sleep(300)
            return fetchAbiFromStarscan(address, chainId, attempt)
        }
        return null
    }

    let abi
    try {
        abi = JSON.parse(data.result) as Abi
    } catch (err) {
        logger.error(`Error parsing JSON ABI from starscan for address ${address}: ${err}`)
        return null
    }

    return abi
}

async function fetchAbiFromSamczsun(contract: any, attempt: number = 1): Promise<Abi | null> {
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

export async function saveFuncSigHashes(funcSigHashes: StringKeyMap) {
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

    // Only dealing with EVM chains for now, so all of them will just share the same
    // function signatures within under "eth-function-signatures".
    if (!(await saveFunctionSignatures(stringified))) {
        logger.error(`Failed to save function sig hashes.`)
        return
    }
}

async function getFirstProxyUpgradedEventLog(contractAddress: string, chainId: string): Promise<StringKeyMap> {
    const schema = schemaForChainId[chainId]
    if (!schema) {
        logger.error(`No schema found for chain id ${chainId}.`)
        return []
    }
    try {
        const results = await ChainTables.query(schema,
            `select * from ${ident(schema)}."logs" where "address" = $1 and "topic0" = $2 order by block_number desc limit 1`,
            [contractAddress, PROXY_UPGRADED_TOPIC],
        )
        const log = (results || [])[0] || {}
        return camelizeKeys(log)
    } catch (err) {
        logger.error(`Error querying ${ident(schema)}."logs" for upgraded event: ${err}`)
        return null
    }
}

function decodeUpgradedEventForImplementationAddress(abiItem: AbiItem, log: StringKeyMap): string | null {
    if (log.eventArgs?.length) {
        return log.eventArgs[0].value
    }

    const topics = []
    abiItem.anonymous && topics.push(log.topic0)
    log.topic1 && topics.push(log.topic1)
    log.topic2 && topics.push(log.topic2)
    log.topic3 && topics.push(log.topic3)

    let decodedArgs
    try {
        decodedArgs = web3.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
    } catch (err) {
        logger.error(`Error decoding log: ${err}`)
        return null
    }
    if (!decodedArgs) return null

    return decodedArgs['0']
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
    const addresses = (params.addresses || []).map(a => a.toLowerCase())
    const chainId = params.chainId || chainIds.ETHEREUM
    const overwriteWithStarscan = params.overwriteWithStarscan || false
    const overwriteWithSamczsun = params.overwriteWithSamczsun || false
    return {
        perform: async () => upsertAbis(
            addresses, 
            chainId,
            overwriteWithStarscan,
            overwriteWithSamczsun,
        )
    }
}