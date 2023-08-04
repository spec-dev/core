import path, { parse } from 'path'
import os from 'os'
import fs from 'fs'
import git from 'nodegit'
import uuid4 from 'uuid4'
import {
    StringKeyMap,
    logger,
    SharedTables,
    getNamespace,
    publishLiveObjectVersion,
    PublishLiveObjectVersionPayload
} from '../../../shared'
import { getTableMigrationAndLiveObjectSpec } from '../services/getTableMigrationAndLiveObjectSpec'
import { getTriggersMigration } from '../services/getTriggersMigration'
import { getSchemaOpsMigration } from '../services/getSchemaOpsMigration'
import { getOpsMigration } from '../services/getOpsMigration'
import { getUserPermissionsMigration } from '../services/getUserPermissionsMigration'
import { indexLiveObjectVersions } from './indexLiveObjectVersions'

const sharedTablesManager = SharedTables.manager

export async function publishAndDeployLiveObjectVersion(
    nsp: string,
    objectName: string,
    folder: string
) {
    // get namespace values from db
    const namespace = await getNamespace(nsp)
    if (!namespace || !namespace?.codeUrl) {
        logger.error(`Error retreiving code url from ${nsp}`)
        return
    }

    console.log('namespace?.codeUrl', namespace?.codeUrl)

    // get manifest from namespace code_url
    const { error: cloneRepoError, manifest, objectFolderPath } = await cloneNamespaceRepo(namespace, objectName, folder)
    if (cloneRepoError) {
        logger.error(`Error getting manifest from repo: ${objectName} ${cloneRepoError}`)
        return
    }
    // normalize schema table name
    const schemaTableName = manifest.name.toLowerCase()

    // check if schema table exists
    try {
        const tableDoesExist = await doesTableExist(nsp, schemaTableName)
        if (tableDoesExist) {
            logger.error(`Table ${nsp}.${schemaTableName} already exists. Aborting`)
            return
        }
    } catch (error) {
        logger.error(`Error checking if table exists (${nsp}.${schemaTableName}): ${error}`)
        return
    }

    // init migration txs sequence
    const { error: migrationError, migrationTxs, liveObjectSpec } = await getMigrationTxs(namespace.name, schemaTableName, objectFolderPath)
    if (migrationError) {
        logger.error(`Error creating migrations: ${migrationError}`)
        return
    }

    // run migrations
    try {
        await SharedTables.manager.transaction(async (tx) => {
            for (const { sql, bindings } of migrationTxs) {
                await tx.query(sql, bindings)
            }
        })
    } catch (error) {
        throw error
    }

    // publish live object version to CoreDB
    const wasPublished = await publishLiveObjectVersion(
        namespace,
        null,
        liveObjectSpec as PublishLiveObjectVersionPayload
    )
    if (!wasPublished) return


    // Replace @spec.dev/core with the full url import from esm.sh at the top of spec.ts
    // !! *** might not need to do this b/c we can use --import-map during deploy step
    let replaceCmd = `fs.replace("${objectFolderPath}/spec.ts", "@spec.dev/core", "https://esm.sh/@spec")`

    // Copy core/live-object-entrypoint.ts into the live object folder at index.ts
    let cpyCmd = `fs.cp("./core/live-object-entrypoint.ts", "${objectFolderPath}/index.ts")`

    // Run deployctl deploy --project=event-generators index.ts
    //   Looks like we can use deplyctl with the --import-map flag
    //   --import-map=<FILE>   Use import map file // https://github.com/denoland/deployctl/blob/main/src/subcommands/deploy.ts
    let denoUrl = 'execSync  deployctl deploy  --import-map=<FILE> --project=event-generators index.ts'
    
    // Update the live object version's url column with the url of the Deno function just created.
    let updateLiveObjectVersion = `liveObjectVersion.update({ liveObjectId, ${denoUrl} })`

    // Hit /admin/live-object-version/index to kick off the indexLiveObjectVersion delayed job. This will index all data for the live object up til now.
    const params = {
        lovIds: '',
        lovTables: '',
        startTimestamp: '',
        iteration: '',
        maxIterations: '',
        maxJobTime: '',
        targetBatchSize: '',
        shouldGenerateEvents: '',
        updateOpTrackingFloor: '',
        setLovToIndexingBefore: '',
        setLovToLiveAfter: '',
    }
    await doIndexLiveObjectVersions(params)

    // Manually add any other Postgres indexes to the live object table that might speed up lookups (will be configurable by our end users in the future).
    let updateIndexes = `liveObject.update({ indexibleValues: [...] })`
}

async function getMigrationTxs(
    nsp: string,
    schemaTableName: string,
    objectFolderPath: string
): Promise<{ error: Error | null, migrationTxs: StringKeyMap[] | null, liveObjectSpec: StringKeyMap | null }> {
    // init migration txs sequence
    let migrationTxs = []

    // get sql for given table
    const { error: resolveErrorMigrationError, tableMigration, liveObjectSpec } = await getTableMigrationAndLiveObjectSpec(objectFolderPath)
    if (resolveErrorMigrationError) {
        return {
            error: new Error(`Failed to generate migrations for ${schemaTableName}: ${resolveErrorMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(tableMigration)

    // create table triggers
    const { error: triggersMigrationError, triggerMigrations } = await getTriggersMigration(nsp, schemaTableName)
    if (triggersMigrationError) {
        return {
            error: new Error(`Failed to generate trigger migrations for schema: ${nsp}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(triggerMigrations)

    // create schema opts table
    const { error: opsSchemaMigrationError, schemaOpsMigration } = await getSchemaOpsMigration(nsp, schemaTableName)
    if (opsSchemaMigrationError) {
        return {
            error: new Error(`Failed to generate schema ops migrations for schema: ${nsp}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(schemaOpsMigration)

    // create op_tracking table
    const { error: opsMigrationError, opsMigration } = await getOpsMigration(nsp, schemaTableName, liveObjectSpec.chains)
    if (opsMigrationError) {
        return {
            error: new Error(`Failed to generate ops migrations for table: ${nsp}.${schemaTableName}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(opsMigration)

    // create schema user permissions
    const { error: userMigrationError, userPermissionsMigration } = await getUserPermissionsMigration(nsp)
    if (userMigrationError) {
        return {
            error: new Error(`Failed to generate user permissions for ${nsp}: ${userMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(userPermissionsMigration)

    return {
        error: null,
        migrationTxs,
        liveObjectSpec
    }
}

async function cloneNamespaceRepo(
    namespace: StringKeyMap,
    objectName: string,
    folder: string
): Promise<{ error: Error | null, manifest: StringKeyMap | null, objectFolderPath: string | null }>  {
    const { name: nsp, codeUrl } = namespace

    let objectFolderPath, manifest
    try {
        // clone LiveObject repo from github and parse manifest.json
        const pathToRepo = await cloneRepo(codeUrl, uuid4())
        if (!pathToRepo) {
            return { error: new Error(`Error cloning repo ${codeUrl}`), manifest: null, objectFolderPath: null }
        }

        // parse manifest JSON
        manifest = parseManifest(pathToRepo, folder)
        const { namespace, name } = manifest

        // validate given values match the cloned manifest values
        if (namespace !== nsp) {
            return {
                error: new Error(`Namespace mismatch between request (${nsp}) and code url manifest (${namespace})`),
                manifest: null,
                objectFolderPath: null
            }
        }
        if (objectName !== name) {
            return {
                error: new Error(`Object name mismatch between folder (${folder}) and object name (${objectName})`),
                manifest: null,
                objectFolderPath: null
            }
        }

        // normalize manifest values
        objectFolderPath = path.join(pathToRepo, name)

    } catch (error) {
        return {
            error: new Error(`Error parsing manifest from repo ${codeUrl}: ${error}`),
            manifest: null,
            objectFolderPath: null
        }
    }

    // return raw values returned from db and cloned repo mandifest
    return {
        error: null,
        objectFolderPath,
        manifest
    }
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

async function doIndexLiveObjectVersions(params: StringKeyMap) {
    return
    const lovIds = params.lovIds || []
    const lovTables = params.lovTables || []
    const startTimestamp = params.startTimestamp
    const iteration = params.iteration || 1
    const maxIterations = params.maxIterations || null
    // const maxJobTime = params.maxJobTime || DEFAULT_MAX_JOB_TIME
    const maxJobTime = params.maxJobTime
    const targetBatchSize = params.targetBatchSize || 100
    const shouldGenerateEvents = params.shouldGenerateEvents === true
    const updateOpTrackingFloor = params.updateOpTrackingFloor !== false

    // TODO: Whether to flip status of lov to indexing/live
    const setLovToIndexingBefore = params.setLovToIndexingBefore !== false
    const setLovToLiveAfter = params.setLovToLiveAfter !== false

    await indexLiveObjectVersions(
        lovIds,
        lovTables,
        startTimestamp,
        iteration,
        maxIterations,
        maxJobTime,
        targetBatchSize,
        shouldGenerateEvents,
        updateOpTrackingFloor,
        setLovToIndexingBefore,
        setLovToLiveAfter,
    )
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
