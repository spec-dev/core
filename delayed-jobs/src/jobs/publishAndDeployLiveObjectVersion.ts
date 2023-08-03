import path, { parse } from 'path'
import os from 'os'
import fs from 'fs'
import git from 'nodegit'
import uuid4 from 'uuid4'
import {
    StringKeyMap,
    logger,
    SharedTables,
    CoreDB,
    Namespace
} from '../../../shared'
import { getTableMigrationAndLiveObjectSpec } from '../services/getTableMigrationAndLiveObjectSpec'
import { getTriggersMigration } from '../services/getTriggersMigration'
import { getSchemaOpsMigration } from '../services/getSchemaOpsMigration'
import { getOpsMigration } from '../services/getOpsMigration'

const namespaceRepo = () => CoreDB.getRepository(Namespace)
const sharedTablesManager = SharedTables.manager

export async function publishAndDeployLiveObjectVersion(
    nsp: string,
    objectName: string,
    folder: string
) {
    // get codeUrl from namespace
    const codeUrl = await getCodeUrl(nsp)
    if (!codeUrl) {
        logger.error(`Error retreiving code url from ${nsp}`)
        return
    }

    let tableName, pathToObject
    // clone LiveObject repo from github and parse manifest.json
    try {
        const pathToRepo = await cloneRepo(codeUrl, uuid4())
        if (!pathToRepo) {
            logger.error(`Error cloning repo ${codeUrl}`)
            return
        }
        const { namespace, name } = parseManifest(pathToRepo, folder)
        if (namespace !== nsp) {
            throw Error(`Namespace mismatch between request (${nsp}) and code url manifest (${namespace})`)
        }
        if (objectName !== name) {
            throw Error(`Object name mismatch between folder (${folder}) and object name (${objectName})`)
        }
        pathToObject = path.join(pathToRepo, name)
        tableName = name.toLowerCase()
    } catch (error) {
        logger.error(`Error parsing manifest from repo ${codeUrl}: ${error}`)
        return
    }

    // check if table exists
    try {
        const tableDoesExist = await doesTableExist(nsp, tableName)
        if (tableDoesExist) {
            logger.error(`Table ${nsp}.${tableName} already exists. Aborting`)
            return
        }
    } catch (error) {
        logger.error(`Error checking if table exists (${nsp}.${tableName}): ${error}`)
        return
    }

    let migrationTxs = []
    
    // get sql for given table
    const { error: resolveErrorMigrationError, tableMigration, liveObjectSpec } = await getTableMigrationAndLiveObjectSpec(pathToObject)
    if (resolveErrorMigrationError) {
        logger.error(
            `Failed to generate migrations for ${tableName}: ${resolveErrorMigrationError}`
        )
        return
    }
    migrationTxs = migrationTxs.concat(tableMigration)

    const { error: triggersMigrationError, triggerMigrations } = await getTriggersMigration(nsp, tableName)
    if (triggersMigrationError) {
        logger.error(
            `Failed to generate trigger migrations for schema: ${nsp}: ${triggersMigrationError}`
        )
        return
    }
    migrationTxs = migrationTxs.concat(triggerMigrations)

    const { error: opsSchemaMigrationError, schemaOpsMigration } = await getSchemaOpsMigration(nsp, tableName)
    if (opsSchemaMigrationError) {
        logger.error(
            `Failed to generate schema ops migrations for schema: ${nsp}: ${triggersMigrationError}`
        )
        return
    }
    migrationTxs = migrationTxs.concat(schemaOpsMigration)
    
    const { error: opsMigrationError, opsMigration } = await getOpsMigration(nsp, tableName, liveObjectSpec.chains)
    if (opsMigrationError) {
        logger.error(
            `Failed to generate ops migrations for table: ${nsp}.${tableName}: ${triggersMigrationError}`
        )
        return
    }
    migrationTxs = migrationTxs.concat(opsMigration)

    try {
        await SharedTables.manager.transaction(async (tx) => {
            for (const { sql, bindings } of migrationTxs) {
                await tx.query(sql, bindings)
            }
        })
    } catch (error) {
        throw error
    }

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

async function getCodeUrl(nsp: string) {
    let namespace
    try {
        namespace = await namespaceRepo().findOne({ where: { name: nsp } })    
    } catch (error) {
        return null
    }
    return namespace.codeUrl
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
    const nsp = params.nsp || ''
    const name = params.name || ''
    const folder = params.folder || ''

    return {
        perform: async () => publishAndDeployLiveObjectVersion(
            nsp,
            name,
            folder
        )
    }
}
