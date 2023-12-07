import {
    logger,
    StringKeyMap,
    getEventVersionsInNsp,
    getContractInstancesInNamespace,
    toNamespacedVersion,
} from '../../../shared'
import { findAndCacheStartBlocksForEvents } from './registerContractInstances'
import chalk from 'chalk'

export async function resetEventStartBlocks(group: string) {
    logger.info(chalk.cyanBright(`[${group}] Starting resetEventStartBlocks...`))

    // Get all event versions in this contract group's namespace.
    const eventVersions = await getEventVersionsInNsp(group)
    if (!eventVersions?.length) {
        logger.warn(chalk.yellow(`No event versions found in namespace ${group}. Stopping.`))
        return
    }
    if (!eventVersions.length) return
    const eventVersionNamespaces = eventVersions.map(ev => toNamespacedVersion(
        ev.nsp, ev.name, ev.version,
    ))

    // Get all existing contract instances in this group.
    const existingContractInstances = await getContractInstancesInNamespace(group)
    if (existingContractInstances === null) return

    const addressesByChainId = {}
    for (const { chainId, address } of existingContractInstances) {
        addressesByChainId[chainId] = addressesByChainId[chainId] || []
        addressesByChainId[chainId].push(address)
    }

    await findAndCacheStartBlocksForEvents(eventVersionNamespaces, addressesByChainId)
    logger.info(chalk.cyanBright(`[${group}] Finished resetEventStartBlocks.`))
}

export default function job(params: StringKeyMap) {
    return {
        perform: async () => resetEventStartBlocks(params.group)
    }
}