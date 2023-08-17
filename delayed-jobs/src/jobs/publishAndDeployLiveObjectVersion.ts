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
    PublishLiveObjectVersionPayload,
    CoreDB,
    LiveObjectVersion,
    toNamespacedVersion,
    updateLiveObjectVersionUrl,
    getLiveObjectVersionsByNamespacedVersions,
    parseUrls
} from '../../../shared'
import { getTableMigrationAndLiveObjectSpec } from '../services/getTableMigrationAndLiveObjectSpec'
import { getTriggersMigration } from '../services/getTriggersMigration'
import { getSchemaOpsMigration } from '../services/getSchemaOpsMigration'
import { getOpsMigration } from '../services/getOpsMigration'
import { getUserPermissionsMigration } from '../services/getUserPermissionsMigration'
import { indexLiveObjectVersions } from './indexLiveObjectVersions'
import { execSync } from 'node:child_process'

const sharedTablesManager = SharedTables.manager

export async function publishAndDeployLiveObjectVersion(
    nsp: string,
    objectName: string,
    folder: string,
    version: string,
    uid?: string | null,
) {

    // TODO: create some db entry to keep track// Create new registration job to track progress.
    // try {
    //     uid = uid || uuid4()
        // await createContractRegistrationJob(
        //     nsp,
        //     objectName,
        //     folder,
        //     version,
        //     uid,
        // )
    // } catch (err) {
    //     logger.error(err)
    //     return
    // }

    // get namespace values from db
    const namespace = await getNamespace(nsp)
    if (!namespace || !namespace?.codeUrl) {
        // await contractRegistrationJobFailed(uid, errors.GENERAL)
        logger.error(`Error retreiving code url from ${nsp}`)
        return
    }
    
    // get manifest from namespace code_url
    const { error: cloneRepoError, manifest, objectFolderPath } = await cloneNamespaceRepo(namespace, objectName, folder)
    if (cloneRepoError) {
        logger.error(`Error getting manifest from repo: ${objectName} ${cloneRepoError}`)
        return
    }

    // init migration txs sequence
    const { error: migrationError, migrationTxs, liveObjectSpec } = await getMigrationTxs(namespace.name, manifest.name, objectFolderPath)
    if (migrationError) {
        logger.error(`Error creating migrations: ${migrationError}`)
        return
    }

    const [schemaName, tableName] = liveObjectSpec.config.table.split('.')

    // check if schema table exists
    try {
        const tableDoesExist = await doesTableExist(schemaName, tableName)
        if (tableDoesExist) {
            logger.error(`Table ${schemaName}.${tableName} already exists. Aborting`)
            return
        }
    } catch (error) {
        logger.error(`Error checking if table exists (${schemaName}.${tableName}): ${error}`)
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
        // throw error should be logger.error TODO::
        throw error
    }

    // insert all CoreDB values into all tables:
    // live_objects, live_object_versions, events, event_versions, live_event_versions, live_call_handlers
    const wasPublished = await publishLiveObjectVersion(
        namespace,
        null,
        liveObjectSpec as PublishLiveObjectVersionPayload
    )
    if (!wasPublished) {
        logger.error(`Failed to publish Live Object: ${liveObjectSpec.namespace} ${liveObjectSpec.name} ${liveObjectSpec.version}`)
        return
    }

    // get live_object_versions entry
    // const namespaceVersion = 'allo.Account@0.0.1'
    const namespaceVersion = toNamespacedVersion(liveObjectSpec.namespace, liveObjectSpec.name, liveObjectSpec.version)
    const lovs = await getLiveObjectVersionsByNamespacedVersions([namespaceVersion])
    const lov = lovs[0]

    // copy deno server file to object folder
    try {
        fs.copyFileSync('./deno/live-object-entrypoint.ts', `${objectFolderPath}/index.ts`)
    } catch (error) {
        // logger.error(`Error checking if table exists (${nsp}.${schemaTableName}): ${error}`)
        throw error
    }

    // deploy live object to deno server
    let denoUrl
    try {
        // TODO:: use Bens old effort
        // deno land
        // project -> event-generators
        // add DENO_LAND_API_KEY .env
        // just make it a hello-world
        const stdout = execSync(`deployctl deploy --import-map=${path.join(objectFolderPath, '..', 'imports.json')} --project=event-generators ${path.join(objectFolderPath, 'index.ts')}`)
        if (!stdout) throw new Error('No stdout returned from deployctl deploy')
        denoUrl = parseDeployedFunctionUrlFromStdout(stdout.toString().trim())

    } catch (error) {
        // logger.error(`Error checking if table exists (${nsp}.${schemaTableName}): ${error}`)
        throw error
    }

    // Update the live object version's url column with the url of the Deno function just deployed.
    const didUpdate = await updateLiveObjectVersionUrl(lov.id, denoUrl)
    if (!didUpdate) {
        logger.error(`Failed to update url ${denoUrl} on Live Object ${liveObjectSpec.namespace} ${liveObjectSpec.name} ${liveObjectSpec.version}`)
        return
    }

    // Kick off indexing for live object versions
    const params = {
        lovIds: [lov.id],
        lovTables: [liveObjectSpec.config.table]
    }
    await doIndexLiveObjectVersions(params)

    // Progress uid FINISHED

    // TODO: include user provided indexing params
}

function parseDeployedFunctionUrlFromStdout(stdout: string): string | null {
    const foundUrls = parseUrls(stdout)
    if (!foundUrls?.length) return null
    return foundUrls.find(url => url.includes('deno')) || null
}

async function getMigrationTxs(
    nsp: string,
    objectName: string,
    objectFolderPath: string
): Promise<{ error: Error | null, migrationTxs: StringKeyMap[] | null, liveObjectSpec: StringKeyMap | null }> {
    // init migration txs sequence
    let migrationTxs = []

    // get sql for given table
    const { error: resolveErrorMigrationError, tableMigration, liveObjectSpec } = await getTableMigrationAndLiveObjectSpec(objectFolderPath)
    if (resolveErrorMigrationError) {
        return {
            error: new Error(`Failed to generate migrations for ${objectName}: ${resolveErrorMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(tableMigration)

    // get schema and table names from table config
    const [schemaName, tableName] = liveObjectSpec.config.table.split('.')

    // create table triggers
    const { error: triggersMigrationError, triggerMigrations } = await getTriggersMigration(schemaName, tableName)
    if (triggersMigrationError) {
        return {
            error: new Error(`Failed to generate trigger migrations for schema: ${nsp}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(triggerMigrations)

    // create schema opts table
    const { error: opsSchemaMigrationError, schemaOpsMigration } = await getSchemaOpsMigration(schemaName, tableName)
    if (opsSchemaMigrationError) {
        return {
            error: new Error(`Failed to generate schema ops migrations for schema: ${nsp}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(schemaOpsMigration)

    // create op_tracking table
    const { error: opsMigrationError, opsMigration } = await getOpsMigration(schemaName, tableName, liveObjectSpec.chains)
    if (opsMigrationError) {
        return {
            error: new Error(`Failed to generate ops migrations for table: ${schemaName}.${tableName}: ${triggersMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(opsMigration)

    // create schema user permissions
    const { error: userMigrationError, userPermissionsMigration } = await getUserPermissionsMigration(schemaName)
    if (userMigrationError) {
        return {
            error: new Error(`Failed to generate user permissions for ${schemaName}: ${userMigrationError}`),
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
    const version = params.version || ''
    const uid = params.uid || ''

    return {
        perform: async () => publishAndDeployLiveObjectVersion(
            nsp,
            name,
            folder,
            version,
            uid,
        )
    }
}
