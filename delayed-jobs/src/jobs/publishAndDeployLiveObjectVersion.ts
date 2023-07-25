import path, { parse } from 'path'
import os from 'os'
import fs from 'fs'
import git from 'nodegit'
import uuid4 from 'uuid4'

import {
    StringKeyMap,
    logger,
    getLovInputGenerator,
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    newTablesJWT,
    sleep,
    enqueueDelayedJob,
    DEFAULT_TARGET_BLOCK_BATCH_SIZE,
    CoreDB,
    LiveObjectVersion,
    TokenTransfer,
    In,
    unique,
    SharedTables,
    getGeneratedEventsCursors,
    addContractInstancesToGroup,
    isValidAddress,
    supportedChainIds,
} from '../../../shared'

import { getCreateSQLForLiveObjectSharedTables } from '../services/getCreateSQLForLiveObjectSharedTables'

const DEFAULT_MAX_JOB_TIME = 60000

const lovsRepo = () => CoreDB.getRepository(LiveObjectVersion)
const sharedTablesManager = SharedTables.manager

export async function publishAndDeployLiveObjectVersion(
    objectName: string,
    codeUrl: string,
) {
    let tableName, nsp, pathToRepo

    // clone LiveObject repo from github and parse manifest.json
    try {
        pathToRepo = await cloneRepo(codeUrl, uuid4())
        const { namespace, name } = parseManifest(pathToRepo, objectName)
        nsp = namespace
        tableName = name.toLowerCase()
    } catch (error) {
        logger.error(`Error cloning repo ${codeUrl}: ${error}`)
        return
    }

    // // check if table exists
    // try {
    //     const tableDoesExist = await doesTableExist(nsp, tableName)
    //     if (tableDoesExist) {
    //         logger.error(`Table ${nsp}.${tableName} already exists`)
    //         return
    //     }        
    // } catch (error) {
    //     logger.error(`Error checking if table exists (${nsp}.${tableName}): ${error}`)
    //     return
    // }

    // get sql for given table
    await getCreateSQLForLiveObjectSharedTables(nsp, tableName, pathToRepo)

    // Enqueue next job in series.
    // await enqueueDelayedJob('decodeContractInteractions', {
    //     chainId,
    //     contractAddresses,
    //     initialBlock,
    //     startBlock: endCursor,
    //     queryRangeSize,
    //     jobRangeSize,
    //     registrationJobUid,
    // })
}

async function doesTableExist(schemaName: string, tableName: string): Promise<boolean> {
    const query = {
        sql: `select count(*) from pg_tables where schemaname = $1 and tablename in ($2, $3)`,
        bindings: [schemaName, tableName, `"${tableName}"`],
    }

    let rows = []
    try {
        rows = await sharedTablesManager.query(query.sql, query.bindings);
    } catch (err) {
        throw err
    }

    const count = rows ? Number((rows[0] || {}).count || 0) : 0
    return count > 0
}

async function cloneRepo(url: string, uid: string): Promise<string | null> {
    // Create unique tmp dir to clone repo into.
    const dst = path.join(os.tmpdir(), uid)

    // Clone repo.
    try {
        await git.Clone(url, dst)
    } catch (err) {
        logger.error(`Error cloning ${url} into ${dst}: ${err}`)
        return null
    }

    // Ensure folder exists now.
    if (!fs.existsSync(dst)) {
        logger.error(`Cloning ${url} failed - No folder found at ${dst}`)
        return null
    }

    return dst
}

function parseManifest(
    pathToRepo: string,
    objectName: string
): StringKeyMap {
    return require(`${pathToRepo}/${objectName}/manifest.json`)
}

export default function job(params: StringKeyMap) {
    const objectName = 'something'
    const codeUrl = 'something'

    return {
        perform: async () => publishAndDeployLiveObjectVersion(
            objectName,
            codeUrl,
        )
    }
}