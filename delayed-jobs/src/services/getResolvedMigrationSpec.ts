import { execSync } from 'node:child_process'
import path from 'path'
import {
    StringKeyMap,
    PublishLiveObjectVersionPayload,
    resolveCallVersionNames,
    resolveEventVersionNames,
    supportedChainIds,
    contractNamespaceForChainId,
    namespaceForChainId,
    chainIds
} from '../../../shared/dist/main'

interface MigrationSpec {
    liveObjectSpec: PublishLiveObjectVersionPayload,
    migrations: StringKeyMap[]
}

export async function getResolvedMigrationSpec(
    pathToObject: string
): Promise<{error: Error | null, migrationSpec: MigrationSpec | null}> {

    // get raw values from deno file and manually set spec config folder name
    const { error: getMigrationError, rawMigrationSpec: migrationSpec } = await getRawMigrationSpecFromDeno(pathToObject)
    if (getMigrationError) return { error: getMigrationError, migrationSpec: null }
    migrationSpec.liveObjectSpec.config.folder = path.parse(pathToObject).base

    // resolve input events with full version names
    const { error: resolveEventError, inputEvents } = await resolveVersions(migrationSpec.liveObjectSpec.inputEvents)
    if (resolveEventError) return { error: resolveEventError, migrationSpec: null }
    migrationSpec.liveObjectSpec.inputEvents = inputEvents

    // resolve input calls with full version names
    const { error: resolveCallError, inputCalls } = await resolveVersions(migrationSpec.liveObjectSpec.inputCalls)
    if (resolveCallError) return { error: resolveCallError, migrationSpec: null }
    migrationSpec.liveObjectSpec.inputCalls = inputCalls

    return { error: null, migrationSpec }
}

async function resolveVersions(givenInputNames: string[]): Promise<StringKeyMap> {
    const CONTRACTS_EVENT_NSP = 'contracts'
    
    const chainNsps = Object.values(chainIds).map(id => namespaceForChainId[id])

    // format given inputs into full namespaces
    const inputNames = []
    for (const givenName of givenInputNames) {
        let fullName = givenName

        if (givenName.split('.').length === 3) {
            fullName = `${CONTRACTS_EVENT_NSP}.${fullName}`
        }

        if (fullName.startsWith(`${CONTRACTS_EVENT_NSP}.`)) {
            for (const nsp of chainNsps) {
                inputNames.push([nsp, fullName].join('.'))
            }
        } else {
            inputNames.push(fullName)
        }
    }
    if (!inputNames.length) return { error: null, inputEvents: [] }

    // resolve event versions for given inputs
    const { data, error } = await resolveEventVersionNames(inputNames)
    if (error) return { error, inputEvents: null }

    // check if any ambigious event versions were returned
    const resolvedInputNames = Object.values(data)
    if (resolvedInputNames.findIndex((v: string) => v.includes('Ambigious')) > -1) {
        return { error: new Error(`Ambigious event version found in: ${resolvedInputNames}`), inputEvents: null }
    }

    return { error: null, inputEvents: resolvedInputNames }
}

async function getRawMigrationSpecFromDeno(
    pathToObject: string
): Promise<{ error: Error | null, rawMigrationSpec: MigrationSpec | null }> {
    // get path to local deno file and imports.json from target folder
    const extractLiveObjectSpec = path.resolve(__dirname, '..', 'deno', 'extractLiveObjectSpec.ts') // TODO: this path will be wrong after build
    const importsPath = path.resolve(pathToObject, '..', 'imports.json')

    // run deno file with args
    const cmdArgs = [
        '--allow-env',
        '--allow-read',
        '--allow-net',
        `--importmap=${importsPath}`,
        extractLiveObjectSpec,
        pathToObject,
    ]
    const { error, stdout } = await runDenoFile(cmdArgs)

    // parse stdout
    if (error) return { error, rawMigrationSpec: null }
    const migrationSpec: MigrationSpec = JSON.parse(stdout.toString())

    return { error: null, rawMigrationSpec: migrationSpec }
}

async function runDenoFile(
    cmdArgs: string[],
): Promise<{ error: Error | null, stdout: StringKeyMap | null }> {
    try {
        // stdio: 'pipe' prevents error logs from being printed from the deno file. 
        const stdout = execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'pipe' })
        return { error: null, stdout }
    } catch (error) {
        return { error, stdout: null }
    }
}
