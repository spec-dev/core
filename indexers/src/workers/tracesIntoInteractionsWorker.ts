import config from '../config'
import {
    logger,
    range,
    EthTrace,
    EthContract,
    EthLatestInteractionType,
    EthLatestInteractionAddressCategory,
    SharedTables,
    uniqueByKeys,
    EthLatestInteraction,
    In,
} from '../../../shared'
import LRU from 'lru-cache'
import { exit } from 'process'

const tracesRepo = () => SharedTables.getRepository(EthTrace)
const contracts = () => SharedTables.getRepository(EthContract)

class TracesToInteractionsWorker {

    from: number

    groupSize: number
    
    seenContracts: LRU<string, boolean> = new LRU({
        max: 10000,
    })

    constructor(from: number, groupSize?: number) {
        this.from = from
        this.groupSize = groupSize || 1
    }

    async run() {
        let end = this.from
        while (end >= 0) {
            const groupBlockNumbers = range(Math.max(end - this.groupSize, 0), end)
            await this._addTracesToInteractions(groupBlockNumbers)
            end -= this.groupSize
        }
        logger.info('DONE')
        exit()
    }

    async _addTracesToInteractions(blockNumbers: number[]) {
        logger.info(`${blockNumbers[0].toLocaleString()} --> ${blockNumbers[blockNumbers.length - 1].toLocaleString()}...`)

        const traces = await this._getTracesInBlockRange(blockNumbers)
        logger.info(`Got ${traces.length} traces.`)
        const traceInteractions = traces
            .filter((t) => !!t.from && !!t.to)
            .map((t) => this._newLatestInteractionFromTrace(t))

        const latestInteractions = uniqueByKeys(
            (traceInteractions as any[]).sort((a, b) => 
                (b.blockNumber - a.blockNumber) || (b.transactionIndex - a.transactionIndex)
            ),
            ['from', 'to'],
        ) as EthLatestInteraction[]
        if (!latestInteractions.length) return

        let interactionAddressesSet = new Set<string>()
        for (const interaction of latestInteractions) {
            interactionAddressesSet.add(interaction.from)
            interactionAddressesSet.add(interaction.to)
        }
        const interactionAddresses = Array.from(interactionAddressesSet)

        const potentialContractAddresses = []
        const contractAddresses = new Set<string>()
        for (const address of interactionAddresses) {
            if (this.seenContracts.has(address)) {
                contractAddresses.add(address)
            } else {
                potentialContractAddresses.push(address)
            }
        }
    
        if (potentialContractAddresses.length) {
            const remainingContractAddresses = await this._getContractAddresses(potentialContractAddresses)
            Array.from(remainingContractAddresses).forEach(addr => { contractAddresses.add(addr) })
        }
    
        Array.from(contractAddresses).forEach(address => {
            this.seenContracts.set(address, true)
        })

        latestInteractions.forEach(interaction => {
            const fromType = contractAddresses.has(interaction.from)
                ? EthLatestInteractionAddressCategory.Contract
                : EthLatestInteractionAddressCategory.Wallet
            const toType = contractAddresses.has(interaction.to)
                ? EthLatestInteractionAddressCategory.Contract
                : EthLatestInteractionAddressCategory.Wallet
            interaction.interactionType = [fromType, toType].join(':') as EthLatestInteractionType
        })

        logger.info(`Upserting ${latestInteractions.length} latest_interactions.`)

        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const li of latestInteractions) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`)
            insertBindings.push(...[li.from, li.to, li.interactionType, li.hash, li.timestamp, li.blockHash, li.blockNumber])
            i += 7
        }

        await SharedTables.manager.transaction(async tx => {
            await tx.query(
                `INSERT INTO ethereum.latest_interactions ("from", "to", interaction_type, hash, timestamp, block_hash, block_number) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT ("from", "to") DO UPDATE SET timestamp = EXCLUDED.timestamp, interaction_type = EXCLUDED.interaction_type, hash = EXCLUDED.hash, block_hash = EXCLUDED.block_hash, block_number = EXCLUDED.block_number WHERE ethereum.latest_interactions.block_number < EXCLUDED.block_number`,
                insertBindings,    
            )
        })
    }

    async _getTracesInBlockRange(blockNumbers: number[]) {
        try {
            return (
                (await tracesRepo().find({
                    select: { 
                        from: true, 
                        to: true, 
                        transactionHash: true,
                        blockTimestamp: true,
                        blockHash: true,
                        blockNumber: true,
                    },
                    where: {
                        blockNumber: In(blockNumbers),
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting traces: ${err}`)
            return []
        }
    }

    async _getContractAddresses(addresses: string[]): Promise<Set<string>> {
        let contractRecords = []
        try {
            contractRecords = await contracts().find({
                select: { address: true },
                where: { address: In(addresses) },
            })
        } catch (err) {
            throw `Error querying contracts: ${err}`
        }
        logger.info(`Got ${contractRecords.length} contracts.`)
        return new Set<string>((contractRecords || []).map((c) => c.address))
    }
    
    _newLatestInteractionFromTrace(trace: EthTrace): EthLatestInteraction {
        const latestInteraction = new EthLatestInteraction()
        latestInteraction.from = trace.from
        latestInteraction.to = trace.to
        latestInteraction.interactionType = EthLatestInteractionType.WalletToWallet
        latestInteraction.hash = trace.transactionHash
        latestInteraction.timestamp = trace.blockTimestamp
        latestInteraction.blockHash = trace.blockHash
        latestInteraction.blockNumber = trace.blockNumber
        return latestInteraction
    }
}

export function getTracesToInteractionsWorker(): TracesToInteractionsWorker {
    return new TracesToInteractionsWorker(
        config.FROM,
        config.RANGE_GROUP_SIZE,
    )
}
