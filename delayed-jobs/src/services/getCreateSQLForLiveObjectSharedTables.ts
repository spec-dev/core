import { execSync } from 'node:child_process'
import path from 'path'
import {
    StringKeyMap,
} from '../../../shared'


export async function getCreateSQLForLiveObjectSharedTables(
    nsp: string,
    tableName: string,
    pathToRepo: string
) {
    // // Get all Live Object specs inside the given parent folders.
    // const liveObjects = await getLiveObjectSpecs()
    // if (!liveObjects.length) return

    await runDenoFile()
}

async function runDenoFile() {
    const testLiveObjectFilePath = path.resolve(__dirname, '..', 'files', 'testLiveObject.ts')
    // /Users/michaelreeder/Development/spec/cli/dist/files/testLiveObject.ts

    // const cmdArgs = [
    //     '--cached-only',
    //     '--allow-env',
    //     '--allow-net',
    //     '--allow-read',
    //     // '--importmap=imports.json',
    //     testLiveObjectFilePath,
    //     // liveObjectFolderName,
    //     // localSharedTablesDbUrl,
    //     // constants.SPEC_API_ORIGIN,
    //     // recent ? recent.toString() : 'false',
    //     // from ? from.toISOString() : 'null',
    //     // fromBlock ? fromBlock.toString() : 'null',
    //     // to ? to.toISOString() : 'null',
    //     // toBlock ? toBlock.toString() : 'null',
    //     // chains ? chains.toString() : 'null',
    //     // allTime ? allTime.toString() : 'false',
    //     // keepData ? keepData.toString() : 'false',
    //     // port ? port.toString() : 'null',
    //     // apiKey ? apiKey.toString() : 'null',
    // ]

    // try {
    //     execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'inherit' })
    // } catch (error) {
    //     return { error }
    // }
    // return { error: null }
}

// export async function testLiveObject(
//     liveObjectFolderName: string,
//     options: StringKeyMap,
//     apiKey: string
// ): Promise<StringKeyMap> {
//     const { data: user } = getCurrentDbUser()

//     if (!user) {
//         return { error: `No current DB user could be found.` }
//     }

//     hasCachedDenoTestFile() || cacheDenoTestFile()

//     const localSharedTablesDbUrl = `postgres://${user}:@localhost:5432/${constants.SHARED_TABLES_DB_NAME}`

//     const { recent, from, fromBlock, to, toBlock, chains, allTime, keepData, port } = options

//     const cmdArgs = [
//         '--cached-only',
//         '--allow-env',
//         '--allow-net',
//         '--allow-read',
//         '--importmap=imports.json',
//         testLiveObjectFilePath,
//         liveObjectFolderName,
//         localSharedTablesDbUrl,
//         constants.SPEC_API_ORIGIN,
//         recent ? recent.toString() : 'false',
//         from ? from.toISOString() : 'null',
//         fromBlock ? fromBlock.toString() : 'null',
//         to ? to.toISOString() : 'null',
//         toBlock ? toBlock.toString() : 'null',
//         chains ? chains.toString() : 'null',
//         allTime ? allTime.toString() : 'false',
//         keepData ? keepData.toString() : 'false',
//         port ? port.toString() : 'null',
//         apiKey ? apiKey.toString() : 'null',
//     ]

//     process.env.SHARED_TABLES_ORIGIN = `http://localhost:${options.port}`

//     try {
//         execSync(`deno run ${cmdArgs.join(' ')}`, { stdio: 'inherit' })
//     } catch (error) {
//         return { error }
//     }
//     return { error: null }
// }

