import {
    EthTransaction,
    EthTransactionStatus,
    EthContract,
    EthLatestInteraction,
    EthLatestInteractionType,
    SharedTables,
    In,
    uniqueByKeys,
} from '../../../../../shared'

const contracts = () => SharedTables.getRepository(EthContract)

async function initLatestInteractions(
    transactions: EthTransaction[],
    contracts: EthContract[]
): Promise<EthLatestInteraction[]> {
    if (!transactions.length) return []

    // Create latest interaction models for each transaction with non-empty to/from properties.
    let latestInteractions = uniqueByKeys(
        transactions
            .filter((tx) => !!tx.from && !!tx.to)
            .sort((a, b) => b.transactionIndex - a.transactionIndex)
            .map((tx) => newLatestInteractionFromTransaction(tx)),
        ['from', 'to']
    )

    // Format this block's contract addresses as a set.
    const blockContractAddresses = new Set(contracts.map((c) => c.address))

    // Break out / recategorize the interactions that interacted with one of this block's contracts.
    const contractInteractions = []
    const maybeContractInteractions = []
    for (const interaction of latestInteractions) {
        if (blockContractAddresses.has(interaction.to)) {
            interaction.interactionType = EthLatestInteractionType.WalletToContract
            contractInteractions.push(interaction)
        } else {
            maybeContractInteractions.push(interaction)
        }
    }

    if (!maybeContractInteractions.length) {
        return contractInteractions
    }

    // For the uncategorized interactions that are left, use the contracts shared table
    // to see which of these interactions were sent to a contract.
    const contractAddressesInteractedWith = await getContractAddresses(
        maybeContractInteractions.map((i) => i.to)
    )

    const walletInteractions = []
    for (const interaction of maybeContractInteractions) {
        if (contractAddressesInteractedWith.has(interaction.to)) {
            interaction.interactionType = EthLatestInteractionType.WalletToContract
            contractInteractions.push(interaction)
        } else {
            walletInteractions.push(interaction)
        }
    }

    return [...contractInteractions, ...walletInteractions]
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

export default initLatestInteractions
