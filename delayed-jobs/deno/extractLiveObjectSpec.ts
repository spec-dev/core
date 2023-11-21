import * as path from 'https://deno.land/std/path/mod.ts'
import {
    StringKeyMap,
    LiveTable,
    TableSpec,
    ColumnSpec,
} from 'https://esm.sh/@spec.dev/core@0.0.138'
import {
    ident,
    literal,
} from 'https://esm.sh/@spec.dev/qb@0.0.2'

import short from 'https://esm.sh/short-uuid@4.2.0'

const liveObjectFileNames = {
    SPEC: 'spec.ts',
    MANIFEST: 'manifest.json',
}

const chainIds = {
    ETHEREUM: '1',
    GOERLI: '5',
    POLYGON: '137',
    MUMBAI: '80001',
    BASE: '8453',
    OPTIMISM: '10',
    ARBITRUM: '42161',
    PGN: '424',
    CELO: '42220',
    LINEA: '59144',
    SEPOLIA: '11155111',
}

const chainNamespaces = {
    ETHEREUM: 'eth',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
    OPTIMISM: 'optimism',
    ARBITRUM: 'arbitrum',
    PGN: 'pgn',
    CELO: 'celo',
    LINEA: 'linea',
    SEPOLIA: 'sepolia',
}

const CONTRACTS_EVENT_NSP = 'contracts'

const nspForChainId = {
    [chainIds.ETHEREUM]: chainNamespaces.ETHEREUM,
    [chainIds.GOERLI]: chainNamespaces.GOERLI,
    [chainIds.POLYGON]: chainNamespaces.POLYGON,
    [chainIds.MUMBAI]: chainNamespaces.MUMBAI,
    [chainIds.BASE]: chainNamespaces.BASE,
    [chainIds.OPTIMISM]: chainNamespaces.OPTIMISM,
    [chainIds.ARBITRUM]: chainNamespaces.ARBITRUM,
    [chainIds.PGN]: chainNamespaces.PGN,
    [chainIds.CELO]: chainNamespaces.CELO,
    [chainIds.LINEA]: chainNamespaces.LINEA,
    [chainIds.SEPOLIA]: chainNamespaces.SEPOLIA,
}

const logError = error => console.error(JSON.stringify({ error }))

const typeIdent = (type: string): string => {
    return type.endsWith('[]') ? `${ident(type.slice(0, -2))}[]` : ident(type)
}

const newConstraintName = (prefix: string): string => `${prefix}_${short.generate().toLowerCase()}`

function isValidPath(path: string): boolean {
    if (!path) return false
    const regex = /^(\/[^\/ ]*)+\/?$/;
    return regex.test(path);
}

function isNull(val: any): boolean {
    return val === null || val === 'null'
}

function parseOptions(): StringKeyMap {
    const values = Deno.args || []
    const options = {
        objectFolderPath: isNull(values[0]) ? null : values[0],
        apiKey: isNull(values[1]) ? null : values[1],
    }
    return options
}

function parse(value: any, fallback: any = {}): any {
    try {
        return JSON.parse(value)
    } catch (err) {
        return fallback
    }
}

async function getLiveObjectSpecPath(objectFolderPath: string): Promise<string | null> {
    const files = []
    for await (const entry of Deno.readDir(objectFolderPath)) {
        files.push(entry)
    }

    const isLiveObject =
        files.find((f) => f.isFile && f.name === liveObjectFileNames.SPEC) &&
        files.find((f) => f.isFile && f.name === liveObjectFileNames.MANIFEST)
    if (!isLiveObject) {
        return null
    }

    return path.join(objectFolderPath, liveObjectFileNames.SPEC)
}

async function resolveLiveObject(
    specFilePath: string
): Promise<StringKeyMap | null> {
    const LiveObjectClass = await importLiveObject(specFilePath)
    const liveObjectInstance = new LiveObjectClass()
    const chainNsps = await getLiveObjectChainNamespaces(specFilePath)
    const inputEventNames = await resolveInputsForLiveObject(
        liveObjectInstance._eventHandlers,
        chainNsps
    )
    return {
        LiveObjectClass,
        liveObjectInstance,
        inputEventNames,
        inputCallNames: [],
        liveObjectSpec: await liveObjectInstance.liveObjectSpec(),
    }
}

async function importLiveObject(specFilePath: string) {
    try {
        const module = await import(specFilePath)
        return module?.default || null
    } catch (err) {
        logError(`Failed to import Live Object at path ${specFilePath}`, err)
        throw err
    }
}

async function getLiveObjectChainNamespaces(specFilePath: string): Promise<string[]> {
    const { chains } = (await readManifest(specFilePath)) || {}
    return chains.map((id: any) => nspForChainId[id]).filter((v: any) => !!v)
}

async function readTextFile(path: string): Promise<string> {
    const decoder = new TextDecoder('utf-8')
    const data = await Deno.readFile(path)
    return decoder.decode(data)
}

async function readJsonFile(path: string): Promise<StringKeyMap | StringKeyMap[]> {
    return parse(await readTextFile(path))
}

async function readManifest(liveObjectSpecPath: string): Promise<StringKeyMap> {
    let splitSpecConfigDirPath = liveObjectSpecPath.split('/')
    splitSpecConfigDirPath.pop()
    return await readJsonFile(`${splitSpecConfigDirPath.join('/')}/${liveObjectFileNames.MANIFEST}`)
}

async function resolveInputsForLiveObject(
    registeredHandlers: StringKeyMap,
    chainNsps: string[],
): Promise<string[] | null> {
    const inputNames = []
    for (const givenName in registeredHandlers) {
        let fullName = givenName

        // Add a missing "contracts." prefix if missing.
        if (givenName.split('.').length === 3) {
            fullName = `${CONTRACTS_EVENT_NSP}.${fullName}`
        }

        // Subscribe to inputs on all chains the live object
        // is associated with if chain is not specified.
        if (fullName.startsWith(`${CONTRACTS_EVENT_NSP}.`)) {
            for (const nsp of chainNsps) {
                inputNames.push([nsp, fullName].join('.'))
            }
        } else {
            inputNames.push(fullName)
        }
    }
    if (!inputNames.length) return []

    return inputNames
}


function buildColumnSql(column: ColumnSpec): string {
    // Serial
    if (column.isSerial) {
        return `${ident(column.name)} serial`
    }

    // Name & Type
    const comps = [ident(column.name), typeIdent(column.type)]

    // Not null.
    if (column.notNull || column.isPrimaryKey) {
        comps.push('not null')
    }

    // Default value.
    const defaultValue = column.default
    if (defaultValue) {
        const defaultClause = defaultValue.includes('(')
            ? `default ${defaultValue}`
            : `default ${literal(defaultValue)}`
        comps.push(defaultClause)
    }

    return comps.join(' ')
}

function buildTableSql(schemaName: string, tableName: string, columns: ColumnSpec[]): string {
    const columnStatements = columns.map((c) => buildColumnSql(c))
    return `create table ${ident(schemaName)}.${ident(tableName)} (${columnStatements.join(', ')})`
}

function buildPrimaryKeySql(schemaName: string, tableName: string, columnNames: string[]): string {
    const constraintName = newConstraintName('pk')
    return [
        `alter table ${ident(schemaName)}.${ident(tableName)}`,
        `add constraint ${ident(constraintName)}`,
        `primary key (${columnNames.map(ident).join(', ')})`,
    ].join(' ')
}

function buildIndexSql(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    unique: boolean = false
): string {
    const indexName = newConstraintName('idx')
    const command = unique ? `create unique index` : `create index`
    return `${command} ${ident(indexName)} on ${ident(schemaName)}.${ident(
        tableName
    )} (${columnNames.map(ident).join(', ')})`
}

function createUpdateSchemaFromSpec(schemaName: string): StringKeyMap[] {
    return [{
        sql: `create schema if not exists ${ident(schemaName)}`,
        bindings: [],
    }]
}

async function createTableFromSpec(tableSpec: TableSpec) {
    const { schemaName, tableName } = tableSpec
    const columns = tableSpec.columns || []
    const uniqueBy = tableSpec.uniqueBy || []
    const indexBy = tableSpec.indexBy || []
    const hasIdColumn = columns.find((c) => c.name === 'id')
    const pkColumnName = hasIdColumn ? '_id' : 'id'

    // Force-set the primary unique constraint columns to not-null.
    const primaryUniqueColGroup = uniqueBy[0] || []
    const primaryUniqueColGroupSet = new Set(primaryUniqueColGroup)
    columns.forEach((column) => {
        if (primaryUniqueColGroupSet.has(column.name)) {
            column.notNull = true
        }
    })

    // Create new table.
    const createTableSql = buildTableSql(schemaName, tableName, [
        { name: pkColumnName, isSerial: true },
        ...columns,
    ])

    // Add primary keys.
    const addPrimaryKeySql = buildPrimaryKeySql(schemaName, tableName, [pkColumnName])

    // Add unique constraints.
    const uniqueIndexSqlStatements = uniqueBy
        .filter((v) => !!v.length)
        .map((columnNames) => buildIndexSql(schemaName, tableName, columnNames, true))

    // Add other indexes.
    const indexSqlStatements = indexBy
        .filter((v) => !!v.length)
        .map((columnNames) => buildIndexSql(schemaName, tableName, columnNames))

    const txStatements = [
        createTableSql,
        addPrimaryKeySql,
        ...uniqueIndexSqlStatements,
        ...indexSqlStatements,
    ].map((sql) => ({ sql, bindings: [] }))

    return { txs: txStatements, pkColumnName }
}

async function getSqlForLiveObjectSharedTable(liveObject: LiveTable): Promise<StringKeyMap> {
    // Get the new table spec for this Live Object.
    const newTableSpec = await liveObject.tableSpec()
    if (!newTableSpec) return {}

    // Force-set the primary unique constraint columns to not-null.
    const primaryUniqueColGroupSet = new Set(newTableSpec.uniqueBy[0] || [])
    newTableSpec.columns.forEach((column) => {
        if (primaryUniqueColGroupSet.has(column.name)) {
            column.notNull = true
        }
    })

    // Filter any empty index specs.
    newTableSpec.uniqueBy = newTableSpec.uniqueBy.filter((group) => !!group.length)
    newTableSpec.indexBy = newTableSpec.indexBy.filter((group) => !!group.length)

    // Create tx sequence for creating schema and table
    const txArray = createUpdateSchemaFromSpec(newTableSpec.schemaName)
    const { txs, pkColumnName } = await createTableFromSpec(newTableSpec)
    txArray.push(...txs)

    return { txs: txArray, pkColumnName }
}

async function run() {
    const options = parseOptions()

    if (!isValidPath(options.objectFolderPath)) { // this could be better, also makes it less usable
        logError(`Invalid object folder path: ${options.objectFolderPath}`)
        Deno.exit()
        return
    }

    const specFilePath = await getLiveObjectSpecPath(options.objectFolderPath)
    if (!specFilePath) {
        logError(`No Live Object found inside ${options.objectFolderPath}.`)
        Deno.exit()
        return
    }

    const { 
        liveObjectInstance,
        inputEventNames,
        liveObjectSpec,
    } = await resolveLiveObject(specFilePath)
    if (!inputEventNames.length) {
        logError(`No input events found for object`)
        Deno.exit()
        return
    }

    const { txs: migrations, pkColumnName } = await getSqlForLiveObjectSharedTable(liveObjectInstance)
    if (!migrations) {
        logError(`No tx sql generated`)
        Deno.exit()
        return
    }

    console.log(JSON.stringify({
        liveObjectSpec: liveObjectSpec,
        inputEventNames,
        migrations,
        pkColumnName,
    }))

    Deno.exit()
}

run()