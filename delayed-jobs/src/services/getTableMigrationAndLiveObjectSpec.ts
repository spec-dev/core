import { execSync } from 'node:child_process'
import path from 'path'
import fs from 'fs'
import {
    StringKeyMap,
    PublishLiveObjectVersionPayload,
    resolveCallVersionNames,
    resolveEventVersionNames,
    namespaceForChainId
} from '../../../shared'

interface LiveObjectSpec extends PublishLiveObjectVersionPayload {
    chains: string[]
}

interface MigrationSpec {
    liveObjectSpec: LiveObjectSpec,
    migrations: StringKeyMap[]
}

export async function getTableMigrationAndLiveObjectSpec(
    folder: string,
    objectFolderPath: string,
    pathToRepo: string,
): Promise<{ 
    error?: Error | null, 
    tableMigration?: StringKeyMap[], 
    liveObjectSpec?: LiveObjectSpec | null,
    pkColumnName?: string
}> {
    // get raw values from deno file and manually set spec config folder name
    const { 
        error: getMigrationError,
        tableMigration,
        liveObjectSpec,
        inputEventNames,
        pkColumnName,
    } = await getTableMigrationAndSpecFromDeno(objectFolderPath, pathToRepo)
    if (getMigrationError) return { error: getMigrationError }
    liveObjectSpec.config.folder = folder

    // Check to see if the live object is ever adding contracts to a group dynamically.
    let isContractFactory = false
    try {
        const liveObjectFileContents = fs.readFileSync(path.join(objectFolderPath, 'spec.ts'), 'utf8')
        isContractFactory = liveObjectFileContents.includes('this.addContractToGroup(')
    } catch (err) {
        return { error: err }
    }
    liveObjectSpec.config.isContractFactory = isContractFactory

    // Resolve input events with full version names.
    const { error: resolveEventError, inputEvents } = await resolveEventVersions(inputEventNames)
    if (resolveEventError) return { error: resolveEventError }
    
    if (!inputEvents.length) {
        return { error: new Error('No input events found') }
    }

    liveObjectSpec.inputEvents = inputEvents
    liveObjectSpec.inputCalls = []

    return { tableMigration, liveObjectSpec, pkColumnName }
}

async function resolveEventVersions(inputEventNames: string[]): Promise<StringKeyMap> {
    // resolve event versions for given inputs
    const { data: resolvedEventInputs, error } = await resolveEventVersionNames(inputEventNames)
    if (error) return { error, inputEvents: null }

    // check if any ambigious event or call versions were returned
    const resolvedInputNames = Object.values(resolvedEventInputs)
    if (resolvedInputNames.findIndex((v: string) => v.includes('Ambigious')) > -1) {
        return { error: new Error(`Ambigious event version found in: ${resolvedInputNames}`), inputEvents: null }
    }

    return { error: null, inputEvents: resolvedInputNames }
}

async function getTableMigrationAndSpecFromDeno(
    objectFolderPath: string,
    pathToRepo: string,
): Promise<{ 
    error?: Error | null, 
    tableMigration?: StringKeyMap[], 
    liveObjectSpec?: LiveObjectSpec,
    pkColumnName?: string,
    inputEventNames?: string[]
}> {
    // get path to local deno file and imports.json from target folder
    const extractLiveObjectSpecDenoFilePath = path.resolve(__dirname, '../..', 'deno', 'extractLiveObjectSpec.ts')
    const importsPath = path.join(pathToRepo, 'imports.json')

    // run deno file with args
    const cmdArgs = [
        '--allow-env',
        '--allow-read',
        '--allow-net',
        `--importmap=${importsPath}`,
        extractLiveObjectSpecDenoFilePath,
        objectFolderPath,
    ]

    let data
    try {
        // stdio: 'pipe' prevents error logs from being printed from the deno file. 
        const stdout = execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'pipe' })
        if (!stdout) throw 'Failed to get table migrations'

        data = JSON.parse(stdout.toString())
        if (!data) throw 'Failed to get table migrations'

        if (data.error) throw data.error
    } catch (error) {
        return { error }
    }
    data = data as MigrationSpec

    return { 
        tableMigration: data.migrations, 
        liveObjectSpec: data.liveObjectSpec,
        pkColumnName: data.pkColumnName,
        inputEventNames: data.inputEventNames || []
    }
}
