import { Queue } from 'bullmq'
import config from '../config'
import { StringKeyMap } from '../types'
import chainIds from './chainIds'

const queueKeys = {
    [chainIds.ETHEREUM]: 'eth-hrq',
    [chainIds.GOERLI]: 'goerli-hrq',
    [chainIds.POLYGON]: 'poly-hrq4',
    [chainIds.MUMBAI]: 'mumbai-hrq',
    [chainIds.BASE]: 'base-hrq',
    [chainIds.OPTIMISM]: 'op-hrq',
    [chainIds.ARBITRUM]: 'arb-hrq2',
    [chainIds.PGN]: 'pgn-hrq',
    [chainIds.CELO]: 'celo-hrq',
    [chainIds.LINEA]: 'linea-hrq',
    [chainIds.SEPOLIA]: 'sepolia-hrq',
}

export async function enqueueBlock(
    chainId: string,
    blockNumber: number,
    replace: boolean,
    force: boolean
): Promise<StringKeyMap> {
    try {
        let queue = new Queue(queueKeys[chainId], {
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            },
            defaultJobOptions: {
                attempts: config.INDEX_JOB_MAX_ATTEMPTS,
                removeOnComplete: true,
                removeOnFail: 50,
                backoff: {
                    type: 'fixed',
                    delay: config.JOB_DELAY_ON_FAILURE,
                },
            },
        })

        const head = {
            chainId,
            blockNumber,
            blockHash: null,
            replace,
            force,
        }

        await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
            priority: head.blockNumber,
        })

        queue = null
    } catch (error) {
        return { error }
    }

    return { error: null }
}
