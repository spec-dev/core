import { upsertNamespaceWithTx } from '../core/db/services/namespaceServices'
import { upsertContractWithTx } from '../core/db/services/contractServices'
import { upsertEventsWithTx } from '../core/db/services/eventServices'
import { upsertEventVersionsWithTx } from '../core/db/services/eventVersionServices'
import { specGithubRepoUrl } from '../utils/url'
import { uniqueByKeys, toNamespacedVersion } from '../utils/formatters'
import { namespaceForChainId, schemaForChainId } from '../utils/chainIds'
import { Contract } from '../core/db/entities/Contract'
import { ContractEventSpec, ContractEventViewSpec } from '../types'
import { Abi } from '../abi/types'
import { ContractInstance } from '../core/db/entities/ContractInstance'
import { literal, ident } from 'pg-format'
import logger from '../logger'
import { CONTRACT_ADDRESS_COL, CONTRACT_NAME_COL, CHAIN_ID_COL } from '../utils/liveObjects'
import { Namespace } from '../core/db/entities/Namespace'
import { PublishLiveObjectVersionPayload } from '../types'
import ChainTables from '../chain-tables/ChainTables'
import { publishLiveObjectVersion } from './publishLiveObjectVersion'

export async function upsertContractAndNamespace(
    tx: any,
    group: string,
    isFactoryGroup?: boolean
): Promise<Contract> {
    const namespace = await upsertNamespaceWithTx(group, tx)
    const contract = await upsertContractWithTx(
        tx,
        namespace.id,
        group.split('.').pop(),
        isFactoryGroup
    )
    contract.namespace = namespace
    return contract
}

export async function upsertContractEvents(
    contract: Contract,
    contractInstances: ContractInstance[],
    eventAbiItems: Abi,
    tx: any
): Promise<ContractEventSpec[]> {
    const namespace = contract.namespace

    // Upsert events for each event abi item.
    const eventsData = uniqueByKeys(
        eventAbiItems.map((abiItem) => ({
            namespaceId: namespace.id,
            name: abiItem.name,
            desc: 'contract event',
            isContractEvent: true,
        })),
        ['name']
    )

    const events = await upsertEventsWithTx(eventsData, tx)
    const eventsMap = {}
    for (const event of events) {
        eventsMap[event.name] = event
    }

    // Upsert event versions for each abi item.
    const eventSpecs = []
    const eventVersionsData = []
    for (const abiItem of eventAbiItems) {
        const event = eventsMap[abiItem.name]
        const data = {
            nsp: namespace.name,
            name: event.name,
            version: abiItem.signature,
            eventId: event.id,
        }
        eventVersionsData.push(data)
        eventSpecs.push({
            eventName: event.name,
            contractName: contract.name,
            contractInstances,
            namespace,
            abiItem,
            namespacedVersion: toNamespacedVersion(data.nsp, data.name, data.version),
        })
    }
    await upsertEventVersionsWithTx(eventVersionsData, tx)

    return eventSpecs
}

export async function upsertContractEventView(
    viewSpec: ContractEventViewSpec,
    log?: boolean
): Promise<boolean> {
    const { chainId, name, columnNames, numEventArgs, contractName, addresses, eventSig } = viewSpec

    const schema = schemaForChainId[chainId]
    log && logger.info(`Upserting view ${schema}.${name}`)

    const selectLines = []
    for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i]
        const isEventArgColumn = i < numEventArgs
        let line = columnName

        if (isEventArgColumn) {
            line = `event_args -> ${i} -> 'value' as ${ident(columnName)}`
        } else if (columnName === CONTRACT_NAME_COL) {
            line = `unnest(array[${literal(contractName)}]) as ${ident(columnName)}`
        } else if (columnName === CHAIN_ID_COL) {
            line = `unnest(array[${literal(chainId)}]) as ${ident(columnName)}`
        } else if (columnName === CONTRACT_ADDRESS_COL) {
            line = `address as ${ident(columnName)}`
        }
        if (i < columnNames.length - 1) {
            line += ','
        }
        selectLines.push(line)
    }

    const select = selectLines.map((l) => `    ${l}`).join('\n')
    const viewAddresses = addresses?.length ? addresses : ['0x']
    const upsertViewSql = `create or replace view ${ident(schema)}.${ident(name)} as 
select
${select} 
from ${ident(schema)}."logs"
where "topic0" = ${literal(eventSig)}
and "address" in (${viewAddresses.map((a) => literal(a)).join(', ')})`

    try {
        await ChainTables.query(schema, upsertViewSql)
    } catch (err) {
        logger.error(`Error upserting view ${schema}.${name}: ${err}`)
        return false
    }

    return true
}

export async function publishContractEventLiveObject(
    namespace: Namespace,
    payload: PublishLiveObjectVersionPayload
): Promise<boolean> {
    try {
        const liveObjectId = null // just let the live object queries happen in the other service.
        return await publishLiveObjectVersion(namespace, liveObjectId, payload, true)
    } catch (err) {
        logger.error(`Failed to publish live object version ${JSON.stringify(payload)}.`)
        return false
    }
}
