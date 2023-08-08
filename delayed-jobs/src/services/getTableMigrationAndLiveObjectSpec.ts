import { execSync } from 'node:child_process'
import path from 'path'
import {
    StringKeyMap,
    PublishLiveObjectVersionPayload,
    resolveCallVersionNames,
    resolveEventVersionNames,
    namespaceForChainId
} from '../../../shared/dist/main'

interface LiveObjectSpec extends PublishLiveObjectVersionPayload {
    chains: string[]
}

interface MigrationSpec {
    liveObjectSpec: LiveObjectSpec,
    migrations: StringKeyMap[]
}

export async function getTableMigrationAndLiveObjectSpec(
    pathToObject: string
): Promise<{ error: Error | null, tableMigration: StringKeyMap[], liveObjectSpec: LiveObjectSpec | null}> {

    // get raw values from deno file and manually set spec config folder name
    const { error: getMigrationError, tableMigration, liveObjectSpec } = await getTableMigrationAndSpecFromDeno(pathToObject)
    if (getMigrationError) return { error: getMigrationError, tableMigration: null, liveObjectSpec: null }
    liveObjectSpec.config.folder = path.parse(pathToObject).base

    // resolve input events with full version names
    const { error: resolveEventError, inputEvents } = await resolveEventVersions(liveObjectSpec)
    if (resolveEventError) return { error: resolveEventError, tableMigration: null, liveObjectSpec: null }
    liveObjectSpec.inputEvents = inputEvents

    // resolve input calls with full version names
    const { error: resolveCallError, inputCalls } = await resolveCallVersions(liveObjectSpec)
    if (resolveCallError) return { error: resolveCallError, tableMigration: null, liveObjectSpec: null }
    liveObjectSpec.inputCalls = inputCalls

    return { error: null, tableMigration, liveObjectSpec }
}

async function resolveEventVersions({ inputEvents, chains }): Promise<StringKeyMap> {
    const inputFullNames = resolveVersionNames(inputEvents, chains)

    // resolve event versions for given inputs
    const { data: resolvedEventInputs, error } = await resolveEventVersionNames(inputFullNames)
    if (error) return { error, inputEvents: null }

    // check if any ambigious event or call versions were returned
    const resolvedInputNames = Object.values(resolvedEventInputs)
    if (resolvedInputNames.findIndex((v: string) => v.includes('Ambigious')) > -1) {
        return { error: new Error(`Ambigious event version found in: ${resolvedInputNames}`), inputEvents: null }
    }

    return { error: null, inputEvents: resolvedInputNames }
}

async function resolveCallVersions({ inputCalls, chains }): Promise<StringKeyMap> {
    const inputFullNames = resolveVersionNames(inputCalls, chains)

    // resolve event versions for given inputs
    const { data: resolvedCallInputs, error } = await resolveCallVersionNames(inputFullNames)
    if (error) return { error, inputCalls: null }

    // check if any ambigious event or call versions were returned
    const resolvedInputNames = Object.values(resolvedCallInputs)
    if (resolvedInputNames.findIndex((v: string) => v.includes('Ambigious')) > -1) {
        return { error: new Error(`Ambigious event version found in: ${resolvedInputNames}`), inputCalls: null }
    }

    return { error: null, inputCalls: resolvedInputNames }
}

function resolveVersionNames(givenInputNames: string[], chains: string[]): string[] {
    const CONTRACTS_EVENT_NSP = 'contracts'

    // The chainIds here should be coming from the Spec right? might need to change
    const chainNsps = chains.map(id => namespaceForChainId[id])

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
    return inputNames
}

async function getTableMigrationAndSpecFromDeno(
    pathToObject: string
): Promise<{ error: Error | null, tableMigration: StringKeyMap[], liveObjectSpec: LiveObjectSpec }> {
    // get path to local deno file and imports.json from target folder
    const extractLiveObjectSpec = path.resolve(__dirname, '../..', 'deno', 'extractLiveObjectSpec.ts')
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
    if (error) return { error, tableMigration: null, liveObjectSpec: null }
    const migrationSpec: MigrationSpec = JSON.parse(stdout)

    return { error: null, tableMigration: migrationSpec.migrations, liveObjectSpec: migrationSpec.liveObjectSpec }
}

async function runDenoFile(
    cmdArgs: string[],
): Promise<{ error: Error | null, stdout: string | null }> {
    try {
        // stdio: 'pipe' prevents error logs from being printed from the deno file. 
        const stdout = execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'pipe' })
        return { error: null, stdout: stdout.toString() }
    } catch (error) {
        return { error, stdout: null }
    }
}
