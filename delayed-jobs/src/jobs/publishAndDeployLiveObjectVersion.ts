import path, { parse } from 'path'
import os from 'os'
import fs from 'fs'
import git from 'nodegit'
import uuid4 from 'uuid4'
import {
    StringKeyMap,
    logger,
    SharedTables
} from '../../../shared'
import { getTableMigrationAndLiveObjectSpec } from '../services/getTableMigrationAndLiveObjectSpec'
import { getTriggersMigration } from '../services/getTriggersMigration'
import { getSchemaOpsMigration } from '../services/getSchemaOpsMigration'
import { getOpsMigration } from '../services/getOpsMigration'

const sharedTablesManager = SharedTables.manager

function actualInfo(
    objectName: string,
    userNamespace: string
) {
    // {
    //     namespace: '<namespace from manifest>',
    //         name: '<name from manifest>',
    //             folder: '<input from user>'
    // }

    // do you think we need the user to pass in the namespace as well ? `spec publish object <NameOfObject> --nsp <nsp>` ?
    //     the code_url exists on the `namespaces` table.i see that the `namespace_users` table has a user_id on it
}

export async function publishAndDeployLiveObjectVersion(
    objectName: string,
    codeUrl: string,
) {
    let tableName, nsp, pathToObject
    // clone LiveObject repo from github and parse manifest.json
    try {
        const pathToRepo = await cloneRepo(codeUrl, uuid4())
        if (!pathToRepo) {
            logger.error(`Error cloning repo ${codeUrl}`)
            return
        }
        const { namespace, name } = parseManifest(pathToRepo, objectName)
        nsp = namespace
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

async function getCodeUrl() {

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