import { execSync } from 'node:child_process'
import path from 'path'
import {
    StringKeyMap,
    PublishLiveObjectVersionPayload,
    resolveCallVersionNames,
    resolveEventVersionNames,
    supportedChainIds,
    contractNamespaceForChainId
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
    const { error: resolveEventError, inputEvents } = await resolveEventVersions(migrationSpec.liveObjectSpec.inputEvents)
    if (resolveEventError) return { error: resolveEventError, migrationSpec: null }
    migrationSpec.liveObjectSpec.inputEvents = inputEvents

    // resolve input calls with full version names
    const { error: resolveCallError, inputCalls } = await resolveCallVersions(migrationSpec.liveObjectSpec.inputCalls)
    if (resolveCallError) return { error: resolveCallError, migrationSpec: null }
    migrationSpec.liveObjectSpec.inputCalls = inputCalls

    return { error: null, migrationSpec }
}

async function resolveEventVersions(inputEvents: string[]): Promise<StringKeyMap> {
    const fullNamespaceNames = getFullNamespaceNamesForInputs(inputEvents)
    const { data, error } = await resolveEventVersionNames(fullNamespaceNames)
    return {
        error,
        inputEvents: data && Object.entries(data).map(([, value]) => value) as string[],
    }
}

async function resolveCallVersions(inputCalls: string[]): Promise<StringKeyMap> {
    const fullNamespaceNames = getFullNamespaceNamesForInputs(inputCalls)
    const { data, error } = await resolveCallVersionNames(fullNamespaceNames)

    return {
        error,
        inputCalls: data && Object.entries(data).map(([k, value]) => value) as string[]
    }
}

function getFullNamespaceNamesForInputs(
    inputs: string[]
): string[] {
    const fullNamespaceNames = []
    for (const input of inputs) {
        for (const supportedChainId of supportedChainIds) {
            const nspForChainId = contractNamespaceForChainId(supportedChainId)
            const fullPath = `${nspForChainId}.${input}`
            fullNamespaceNames.push(fullPath)
        }
    }
    return fullNamespaceNames
}

async function getRawMigrationSpecFromDeno(
    pathToObject: string
): Promise<{ error: Error | null, rawMigrationSpec: MigrationSpec | null }> {
    // get path to local deno file and imports.json from target folder
    const extractLiveObjectSpec = path.resolve(__dirname, '..', 'deno', 'extractLiveObjectSpec.ts') // TODO: this path will be wrong after build
    const importsPath = path.resolve(pathToObject, '..', 'imports.json')

    // run deno file with args
    const cmdArgs = [
        '--cached-only',
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
    // do we need to check that deno is installed?

    // do we need to do the caching logic here
    // hasCachedDenoTestFile() || cacheDenoTestFile()

    try {
        // stdio: 'pipe' prevents error logs from being printed from the deno file. 
        const stdout = execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'pipe' })
        return { error: null, stdout }
    } catch (error) {
        return { error, stdout: null }
    }
}
