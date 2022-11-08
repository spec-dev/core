import {
    EthTransaction,
    EthContract,
    EthLatestInteraction,
    EthLatestInteractionType,
    EthTrace,
    SharedTables,
    In,
    uniqueByKeys,
    EthLatestInteractionAddressCategory,
} from '../../../../../shared'

const contracts = () => SharedTables.getRepository(EthContract)

async function initLatestInteractions(
    transactions: EthTransaction[],
    traces: EthTrace[],
    contracts: EthContract[]
): Promise<EthLatestInteraction[]> {
    const transactionInteractions = transactions
        .filter((tx) => !!tx.from && !!tx.to)
        .map((tx) => newLatestInteractionFromTransaction(tx))

    const traceInteractions = traces
        .filter((t) => !!t.from && !!t.to)
        .map((t) => newLatestInteractionFromTrace(t))

    const latestInteractions = uniqueByKeys(
        ([
            ...transactionInteractions,
            ...traceInteractions,
        ] as any[]).sort((a, b) => b.transactionIndex - a.transactionIndex), 
        ['from', 'to'],
    ) as EthLatestInteraction[]

    if (!latestInteractions.length) return []

    const blockContractAddresses = new Set(contracts.map((c) => c.address))

    let interactionAddressesSet = new Set<string>()
    for (const interaction of latestInteractions) {
        interactionAddressesSet.add(interaction.from)
        interactionAddressesSet.add(interaction.to)
    }
    const interactionAddresses = Array.from(interactionAddressesSet)
    const potentialContractAddresses = []
    const contractAddresses = new Set<string>()
    for (const address of interactionAddresses) {
        if (blockContractAddresses.has(address)) {
            contractAddresses.add(address)
        } else {
            potentialContractAddresses.push(address)
        }
    }

    if (potentialContractAddresses.length) {
        const actualContractAddresses = await getContractAddresses(potentialContractAddresses)
        Array.from(actualContractAddresses).forEach(addr => { contractAddresses.add(addr) })
    }

    latestInteractions.forEach(interaction => {
        const fromType = contractAddresses.has(interaction.from)
            ? EthLatestInteractionAddressCategory.Contract
            : EthLatestInteractionAddressCategory.Wallet
        const toType = contractAddresses.has(interaction.to)
            ? EthLatestInteractionAddressCategory.Contract
            : EthLatestInteractionAddressCategory.Wallet
        interaction.interactionType = [fromType, toType].join(':') as EthLatestInteractionType
    })

    return latestInteractions
}

async function getContractAddresses(addresses: string[]): Promise<Set<string>> {
    let contractRecords = []
    try {
        contractRecords = await contracts().find({
            select: { address: true },
            where: { address: In(addresses) },
        })
    } catch (err) {
        throw `Error querying contracts: ${err}`
    }
    return new Set<string>((contractRecords || []).map((c) => c.address))
}

function newLatestInteractionFromTransaction(transaction: EthTransaction): EthLatestInteraction {
    const latestInteraction = new EthLatestInteraction()
    latestInteraction.from = transaction.from
    latestInteraction.to = transaction.to
    latestInteraction.interactionType = EthLatestInteractionType.WalletToWallet
    latestInteraction.hash = transaction.hash
    latestInteraction.timestamp = transaction.blockTimestamp
    latestInteraction.blockHash = transaction.blockHash
    latestInteraction.blockNumber = transaction.blockNumber
    return latestInteraction
}

function newLatestInteractionFromTrace(trace: EthTrace): EthLatestInteraction {
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

export default initLatestInteractions