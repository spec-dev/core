import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { CoreDB } from '../core/db/dataSource'
import { EventGenerator } from '../core/db/entities/EventGenerator'
import { Contract } from '../core/db/entities/Contract'
import { EventVersion } from '../core/db/entities/EventVersion'
import { StringKeyMap } from '../types'

// Create redis client.
export const redis = createClient(config.INDEXER_REDIS_URL)

// Log any redis client errors.
redis.on('error', (err) => logger.error(`Redis error: ${err}`))

export interface ContractInstanceEntry {
    address: string
    name: string
    contractUid: string
}

export interface EventVersionEntry {
    nsp: string
    name: string
    version: string
}

export interface EventGeneratorEntry {
    uid: string
    url: string
    metadata: StringKeyMap
    eventVersionEntries: EventVersionEntry[]
}

export interface ContractEntry {
    eventGenerators: EventGeneratorEntry[]
}

const keys = {
    UNCLED_BLOCKS: 'uncled-blocks',
    CONTRACTS: 'contracts',
    CONTRACT_INSTANCES: 'contract-instances',
}

const formatUncledBlockValue = (chainId: number, blockHash: string) => `${chainId}:${blockHash}`

export async function registerBlockHashAsUncled(chainId: number, blockHash: string) {
    const value = formatUncledBlockValue(chainId, blockHash)
    try {
        await redis.sAdd(keys.UNCLED_BLOCKS, value)
    } catch (err) {
        logger.error(`Error adding ${value} to ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }
}

export async function quickUncleCheck(chainId: number, blockHash: string): Promise<boolean> {
    if (!blockHash) return false
    const value = formatUncledBlockValue(chainId, blockHash)
    try {
        return await redis.sIsMember(keys.UNCLED_BLOCKS, value)
    } catch (err) {
        logger.error(`Error checking if ${value} is a member of ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }

    return false
}

export async function getContractEventGeneratorData(addresses: string[]): Promise<{
    instanceEntries: ContractInstanceEntry[]
    contractEventGeneratorEntries: { [key: string]: EventGeneratorEntry[] }
}> {
    let instanceEntries
    try {
        instanceEntries = (await redis.hmGet(keys.CONTRACT_INSTANCES, addresses)) || []
    } catch (err) {
        console.log(err)
        logger.error(`Error getting contract instance entries from redis: ${err}.`)
        throw err
    }

    instanceEntries = instanceEntries
        .filter((v) => !!v)
        .map((v) => JSON.parse(v) as ContractInstanceEntry[])
        .flat() as ContractInstanceEntry[]

    if (!instanceEntries.length) {
        return { instanceEntries: [], contractEventGeneratorEntries: {} }
    }

    // Put all unique contract uids into a list.
    const contractUidSet = new Set<string>()
    for (let instanceEntry of instanceEntries) {
        contractUidSet.add(instanceEntry.contractUid)
    }
    const contractUids: string[] = Array.from(contractUidSet)

    // Get contract entries for uids.
    let contractEntries
    try {
        contractEntries = (await redis.hmGet(keys.CONTRACTS, contractUids)) || []
    } catch (err) {
        logger.error(`Error getting contract entries from redis: ${err}.`)
        throw err
    }

    const contractEventGeneratorEntries: { [key: string]: EventGeneratorEntry[] } = {}
    let contractUid, contractEntryStr
    let contractEntry: ContractEntry
    for (let i = 0; i < contractUids.length; i++) {
        contractUid = contractUids[i]
        contractEntryStr = contractEntries[i]
        if (!contractEntryStr) continue
        contractEntry = JSON.parse(contractEntryStr) as ContractEntry
        contractEventGeneratorEntries[contractUid] = contractEntry.eventGenerators || []
    }

    return { instanceEntries, contractEventGeneratorEntries }
}

export async function upsertContractCaches() {
    const contractsRepo = () => CoreDB.getRepository(Contract)
    const eventVersionsRepo = () => CoreDB.getRepository(EventVersion)

    // Get all contracts with their assocated instances and event generators.
    const contracts = await contractsRepo()
        .createQueryBuilder('contract')
        .leftJoinAndMapMany(
            'contract.eventGenerators',
            EventGenerator,
            'eventGenerator',
            'eventGenerator.parentId = contract.id and eventGenerator.discriminator = :discriminator',
            { discriminator: 'contract' }
        )
        .innerJoinAndSelect('contract.contractInstances', 'contractInstance')
        .getMany()

    // Get all event version uids across all contract event generators.
    const eventVersionUids = []
    for (let contract of contracts) {
        const eventGenerators = (contract as any).eventGenerators || []
        for (let eventGenerator of eventGenerators) {
            const evUids = eventGenerator.eventVersions.split(',').map((s) => s.trim())
            for (let evUid of evUids) {
                eventVersionUids.push(evUid)
            }
        }
    }

    const eventVersions = await eventVersionsRepo()
        .createQueryBuilder('eventVersion')
        .where('eventVersion.uid IN (:...uids)', { uids: eventVersionUids })
        .getMany()

    const eventVersionEntriesMap: { [key: string]: EventVersionEntry } = {}
    for (let eventVersion of eventVersions) {
        eventVersionEntriesMap[eventVersion.uid] = {
            nsp: eventVersion.nsp,
            name: eventVersion.name,
            version: eventVersion.version,
        }
    }

    const contractsMap = {}
    const contractInstancesMap = {}
    for (let i = 0; i < contracts.length; i++) {
        const contract = contracts[i]
        const eventGenerators = (contract as any).eventGenerators || []
        const contractInstances = contract.contractInstances || []

        contractsMap[contract.uid] = {
            eventGenerators: eventGenerators.map((eg) => ({
                uid: eg.uid,
                url: eg.url,
                metadata: eg.metadata || {},
                eventVersionEntries: eg.eventVersions
                    .split(',')
                    .map((s) => s.trim())
                    .map((uid) => eventVersionEntriesMap[uid] || null),
            })),
        }

        for (let j = 0; j < contractInstances.length; j++) {
            const contractInstance = contractInstances[j]
            const { address, name } = contractInstance
            const entry = {
                address,
                name,
                contractUid: contract.uid,
            }

            if (!contractInstancesMap.hasOwnProperty(address)) {
                contractInstancesMap[address] = []
            }

            contractInstancesMap[address].push(entry)
        }
    }

    const promises = []
    // Add contracts to redis.
    for (let contractUid in contractsMap) {
        promises.push(
            redis.hSet(keys.CONTRACTS, [contractUid, JSON.stringify(contractsMap[contractUid])])
        )
    }
    // Add contract instances to redis.
    for (let address in contractInstancesMap) {
        promises.push(
            redis.hSet(keys.CONTRACT_INSTANCES, [
                address,
                JSON.stringify(contractInstancesMap[address]),
            ])
        )
    }

    await Promise.all(promises)
}
