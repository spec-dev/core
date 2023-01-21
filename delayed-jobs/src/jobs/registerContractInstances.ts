import {
    logger,
    StringKeyMap,
    NewContractPayload,
    unique,
    Abi,
    ContractInstance,
    Contract,
    Event,
    upsertContracts,
    getContractInstancesByContractId,
    upsertContractInstances,
    AbiItemType,
    uniqueByKeys,
    upsertEvents,
    upsertEventVersions,
} from '../../../shared'
import { 
    fetchAbis, 
    providers, 
    polishAbis,
    saveAbisMap,
    saveFuncSigHashes,
} from './upsertAbis'

async function registerContractInstances(namespace: StringKeyMap, contractPayloads: NewContractPayload[]) {
    // Get all unique contract addresses given.
    const allContractAddresses = unique(
        contractPayloads.map(c => (c.instances || []).map(i => i.address)).flat()
    )
    logger.info(`Registering ${allContractAddresses.length} contract instances in namespace ${namespace.slug}`)
    
    // Upsert/ensure all contract addresses have verified ABIs.
    const abisMap = await upsertVerifiedAbis(allContractAddresses)
    if (!abisMap) return

    // Verify all instances of the same contract share the "same" ABI.
    const contractAbis = ensureAllInstancesShareSimilarAbis(contractPayloads, abisMap)
    if (!contractAbis) return

    // Upsert contract records.
    const contractsData = contractPayloads.map(contract => ({
        namespaceId: namespace.id,
        name: contract.name,
        desc: contract.desc,
    }))
    const contracts = await upsertContracts(contractsData)
    if (!contracts) return

    // Get all existing contract instances.
    const existingContractInstances = await getContractInstancesByContractId(contracts.map(c => c.id))
    const existingContractInstancesSet = new Set(
        existingContractInstances.map(ci => [ci.chainId, ci.address].join(':'))
    )

    // Create new contract instances.
    const newContractInstances = await createContractInstances(
        contractPayloads, 
        contracts,
        existingContractInstancesSet,
    )
    if (!newContractInstances) return
    
    // Upsert Spec events for each event abi item. across all contracts.
    const events = await createEvents(contracts, contractAbis)
    if (!events) return

    // Upsert event versions for each event.
    const eventVersionsData = events.map(event => ({
        eventId: event.id,
        nsp: namespace.slug,
        name: event.name,
        version: '0.0.1',
    }))
    const eventVersions = await upsertEventVersions(eventVersionsData)
    if (!eventVersions) return
    


    /*

    Create delayed job to create a new live object and all of the things that go with it.
    
    - Format events as live objects (gonna need the abi items for their structure)
    
    */

}

async function upsertVerifiedAbis(addresses: string[]): Promise<{ [key: string]: Abi } | null> {    
    // Pull verified abis for each address.
    const verifiedAbisMap = await fetchAbis(addresses, providers.ETHERSCAN)

    // Ensure all addresses had corresponding verified ABIs. 
    const unverifiedAbiAddresses = addresses.filter(a => !verifiedAbisMap.hasOwnProperty(a))
    if (unverifiedAbiAddresses.length) {
        logger.error(`ABIs not verified for contracts: ${unverifiedAbiAddresses.join(', ')}`)
        return null
    }

    // Polish the abis by adding signatures to each item.
    const [abisMap, funcSigHashesMap] = polishAbis(verifiedAbisMap)

    // Save ABIs and function signatures.
    await Promise.all([saveAbisMap(abisMap), saveFuncSigHashes(funcSigHashesMap)])
    
    return abisMap as { [key: string]: Abi }
}

function ensureAllInstancesShareSimilarAbis(
    contracts: NewContractPayload[],
    abisMap: { [key: string]: Abi },
): Abi[] | null {
    const contractAbis: Abi[] = []

    for (const contract of contracts) {
        // Get contract instances.
        const instances = contract.instances || []
        if (!instances.length) {
            logger.error(`No instances given for contract: ${contract.name}`)
            return null
        }

        // Get abis for each contract instance.
        const abis = instances.map(instance => abisMap[instance.address])

        // Get abi with the least number of items.
        let matchAbi: Abi = null
        let matchAbiIndex = 0
        for (let i = 0; i < abis.length; i++) {
            const abi = abis[i]
            if (!matchAbi || abi.length < matchAbi.length) {
                matchAbi = abi
                matchAbiIndex = i
            }
        }

        contractAbis.push(matchAbi)
        const requiredSigs = matchAbi.map(item => item.signature)

        // Ensure other abis have all required signatures.
        for (let i = 0; i < abis.length; i++) {
            if (i === matchAbiIndex) continue
            const abi = abis[i]
            const abiSigs = new Set(abi.map(item => item.signature))

            for (const sig of requiredSigs) {
                if (!abiSigs.has(sig)) {
                    logger.error(
                        `contract ${contract.name} abi missing signature ${sig}`
                    )
                    return null
                }
            }
        }
    }
    
    return contractAbis
}

async function createContractInstances(
    contractPayloads: NewContractPayload[],
    contracts: Contract[],
    existingContractInstancesSet: Set<string>,
): Promise<ContractInstance[] | null> {
    const contractInstancesData = []

    for (let i = 0; i < contractPayloads.length; i++) {
        const entry = contractPayloads[i]
        const contract = contracts[i]

        for (const instance of entry.instances) {
            const uniqueKey = [instance.chainId, instance.address].join(':')
            if (existingContractInstancesSet.has(uniqueKey)) continue

            contractInstancesData.push({
                contractId: contract.id,
                chainId: instance.chainId,
                address: instance.address,
                name: instance.name,
                desc: instance.desc,
            })
        }
    }
    
    return await upsertContractInstances(contractInstancesData)
}

async function createEvents(contracts: Contract[], contractAbis: Abi[]): Promise<Event[] | null> {
    let eventsData = []

    for (let i = 0; i < contracts.length; i++) {
        const contract = contracts[i]
        const abi = contractAbis[i]
        const eventAbiItems = abi.filter(item => item.type === AbiItemType.Event)
        
        // name, desc, namespaceId
        eventsData.push(...eventAbiItems.map(abiItem => ({
            name: [contract.name, abiItem.name].join('.'),
            desc: 'TODO - auto write this',
            namespaceId: contract.namespaceId,
            isContractEvent: true,
        })))
    }

    eventsData = uniqueByKeys(eventsData, ['name', 'namespaceId'])
    return await upsertEvents(eventsData)
}

export default function job(params: StringKeyMap) {
    const namespace = params.namespace || {}
    const contracts = params.contracts || []
    return {
        perform: async () => registerContractInstances(namespace, contracts)
    }
}