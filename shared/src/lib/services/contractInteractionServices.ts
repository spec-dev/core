import ChainTables from '../chain-tables/ChainTables'
import { identPath, toChunks } from '../utils/formatters'
import { ident } from 'pg-format'
import { StringKeyMap } from '../types'
import { schemaForChainId } from '../utils/chainIds'

export async function findStartBlockForAddresses(
    schema: string,
    address: string
): Promise<number | null> {
    const blockNumbers = await Promise.all([
        findEarliestInteraction(schema, 'transactions', 'to', address),
        findEarliestInteraction(schema, 'logs', 'address', address),
    ])
    const notNullBlockNumbers = blockNumbers.filter((n) => n !== null)
    return notNullBlockNumbers.length ? Math.min(...notNullBlockNumbers) : null
}

export async function findStartBlocksForEvent(
    topic0: string,
    addressesByChainId: StringKeyMap
): Promise<StringKeyMap> {
    const startBlocksByChainId = {}
    for (const chainId in addressesByChainId) {
        const schema = schemaForChainId[chainId]
        const addresses = addressesByChainId[chainId]
        if (!addresses.length) continue

        const chunks = toChunks(addresses, 10)
        let startBlocks = []
        for (const chunk of chunks) {
            startBlocks.push(
                ...(await Promise.all(
                    chunk.map((address) =>
                        findEarliestEventBlockFromAddress(schema, address, topic0)
                    )
                ))
            )
        }
        startBlocks = startBlocks.filter((n) => n !== null)
        if (!startBlocks.length) continue

        startBlocksByChainId[chainId] = Math.min(...startBlocks)
    }
    return startBlocksByChainId
}

async function findEarliestInteraction(
    schema: string,
    table: string,
    column: string,
    address: string
): Promise<number | null> {
    try {
        const results =
            (await ChainTables.query(
                schema,
                `select "block_number" from ${identPath([schema, table].join('.'))} where ${ident(
                    column
                )} = $1 order by "block_number" asc limit 1`,
                [address]
            )) || []
        const number = Number((results[0] || {}).block_number)
        return Number.isNaN(number) ? null : number
    } catch (err) {
        throw `Failed to query ${table} while looking for earliest block interaction: ${JSON.stringify(
            err
        )}`
    }
}

async function findEarliestEventBlockFromAddress(
    schema: string,
    address: string,
    topic0: string
): Promise<number | null> {
    try {
        const results =
            (await ChainTables.query(
                schema,
                `select "block_number" from ${identPath(
                    [schema, 'logs'].join('.')
                )} where "address" = $1 and "topic0" = $2 order by "block_number" asc limit 1`,
                [address, topic0]
            )) || []
        const number = Number((results[0] || {}).block_number)
        return Number.isNaN(number) ? null : number
    } catch (err) {
        throw `Failed to query ${schema} logs while looking for earliest event (${topic0}): ${JSON.stringify(
            err
        )}`
    }
}
