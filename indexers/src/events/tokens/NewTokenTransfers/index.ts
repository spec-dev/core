import { StringKeyMap, TokenTransfer } from '../../../../../shared'

const eventName = 'tokens.NewTokenTransfers@0.0.1'

function NewTokenTransfers(tokenTransfers: TokenTransfer[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = tokenTransfers.map((t) => ({
        transferId: t.transferId,
        transactionHash: t.transactionHash,
        logIndex: t.logIndex,
        tokenAddress: t.tokenAddress,
        tokenName: t.tokenName,
        tokenSymbol: t.tokenSymbol,
        tokenDecimals: t.tokenDecimals,
        tokenStandard: t.tokenStandard,
        tokenId: t.tokenId,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        isMint: t.isMint,
        isNative: t.isNative,
        isBlockReward: t.transactionHash === null,
        value: t.value,
        valueUsd: t.valueUsd,
        valueEth: t.valueEth,
        valueMatic: t.valueMatic,
        blockHash: t.blockHash,
        blockNumber: Number(t.blockNumber),
        blockTimestamp: t.blockTimestamp.toISOString(),
        chainId: t.chainId,
    }))

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewTokenTransfers