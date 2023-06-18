import { ContractEventViewSpec } from '../types'
import { literal, ident } from 'pg-format'
import logger from '../logger'
import { CONTRACT_ADDRESS_COL, CONTRACT_NAME_COL, CHAIN_ID_COL } from '../utils/liveObjects'
import { SharedTables } from '../shared-tables/db/dataSource'

export async function upsertContractEventView(
    viewSpec: ContractEventViewSpec,
    chainId: string
): Promise<boolean> {
    const { schema, name, columnNames, numEventArgs, contractInstances, eventSig } = viewSpec

    logger.info(`Upserting view ${schema}.${name}`)

    const contractNameOptions = [
        ...contractInstances.map(
            (ci) => `when address = ${literal(ci.address)} then ${literal(ci.name)}`
        ),
        `else 'unknown'`,
    ]
        .map((l) => `        ${l}`)
        .join('\n')

    const selectLines = []
    for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i]
        const isEventArgColumn = i < numEventArgs
        let line = columnName

        if (isEventArgColumn) {
            line = `event_args -> ${i} -> 'value' as ${ident(columnName)}`
        } else if (columnName === CONTRACT_NAME_COL) {
            line = `case\n${contractNameOptions}\n    end ${ident(columnName)}`
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
    const addresses = contractInstances.map((ci) => ci.address)
    const upsertViewSql = `create or replace view ${ident(schema)}.${ident(name)} as 
select
${select} 
from ${ident(schema)}."logs" 
where "topic0" = ${literal(eventSig)}
and "address" in (${addresses.map((a) => literal(a)).join(', ')})`

    try {
        await SharedTables.query(upsertViewSql)
    } catch (err) {
        logger.error(`Error upserting view ${schema}.${name}: ${err}`)
        return false
    }

    return true
}
