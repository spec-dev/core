import path from 'path'
import os from 'os'
import fs from 'fs'
import git from 'nodegit'
import uuid4 from 'uuid4'
import {
    StringKeyMap,
    logger,
    ChainTables,
    getNamespace,
    publishLiveObjectVersion,
    PublishLiveObjectVersionPayload,
    createPublishAndDeployLiveObjectVersionJob,
    updatePublishAndDeployLiveObjectVersionJobStatus,
    publishAndDeployLiveObjectVersionJobFailed,
    PublishAndDeployLiveObjectVersionJobStatus,
    enqueueDelayedJob,
    toNamespacedVersion,
    updateLiveObjectVersionUrl,
    getLiveObjectVersionsByNamespacedVersions,
    parseUrls,
    fromNamespacedVersion,
    getContractGroupAbi,
    getLiveObjectForLov,
    updatePublishAndDeployLiveObjectVersionJobMetadata,
    getLiveObject,
} from '../../../shared'
import { getTableMigrationAndLiveObjectSpec } from '../services/getTableMigrationAndLiveObjectSpec'
import { getTriggersMigration } from '../services/getTriggersMigration'
import { getSchemaOpsMigration } from '../services/getSchemaOpsMigration'
import { getOpsMigration } from '../services/getOpsMigration'
import { getUserPermissionsMigration } from '../services/getUserPermissionsMigration'
import { execSync } from 'node:child_process'

const errors = {
    GENERAL: 'Error publishing Live Table.',
    LIVE_OBJECT_RETRIEVAL_FAILED : 'Failed to retrieve Live Table files.',
    LIVE_OBJECT_SHARED_TABLE_FAILED: 'Failed to create Live Table.',
    LIVE_OBJECT_PUBLISH_FAILED: 'Failed to publish Live Table.',
    DENO_DEPLOY_FAILED: 'Failed to deploy Live Table.'
}

export async function publishAndDeployLiveObjectVersion(
    nsp: string,
    name: string,
    version: string,
    folder: string,
    uid?: string | null,
) {
    const namespacedVersion = toNamespacedVersion(nsp, name, version)
    logger.info(`Starting publish job for ${namespacedVersion}...`)

    // Create new registration job to track progress.
    try {
        uid = uid || uuid4()
        await createPublishAndDeployLiveObjectVersionJob(
            nsp,
            name,
            folder,
            version,
            uid
        )
    } catch (err) {
        logger.error(err)
        return
    }

    // Get the full namespace record.
    const namespace = await getNamespace(nsp)
    if (!namespace || !namespace?.codeUrl) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.GENERAL)
        logger.error(`Error retreiving code url from ${nsp}`)
        return
    }

    // Clone the namespace's git repo.
    logger.info(`[${namespacedVersion}] Cloning repo...`)
    const { 
        error: cloneRepoError, 
        manifest, 
        objectFolderPath,
        pathToRepo
    } = await cloneNamespaceRepo(namespace, name, folder)
    if (cloneRepoError) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.LIVE_OBJECT_RETRIEVAL_FAILED)
        logger.error(`Error getting manifest from repo: ${name} ${cloneRepoError}`)
        return
    }

    // Generate all the migrations for this new live object table.
    logger.info(`[${namespacedVersion}] Generating migrations...`)
    const { error: migrationError, migrationTxs, liveObjectSpec } = await getMigrationTxs(
        manifest.name, 
        folder,
        objectFolderPath,
        pathToRepo,
    )
    if (migrationError) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.LIVE_OBJECT_SHARED_TABLE_FAILED)
        logger.error(`Error creating migrations: ${migrationError}`)
        return
    }

    // Ensure table doesn't already exist.
    const [schemaName, tableName] = liveObjectSpec.config.table.split('.')
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

    // Run migrations.
    logger.info(`[${namespacedVersion}] Running migrations...`)
    await updatePublishAndDeployLiveObjectVersionJobStatus(uid, PublishAndDeployLiveObjectVersionJobStatus.Migrating)
    try {
        await ChainTables.transaction(null, async (tx) => {
            for (const { sql, bindings } of migrationTxs) {
                await tx.query(sql, bindings)
            }
        })
    } catch (error) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.LIVE_OBJECT_SHARED_TABLE_FAILED)
        logger.error(`Error running migrations for (${schemaName}.${tableName}): ${error}`)
        return
    }

    // Insert all CoreDB values into all tables:
    // live_objects, live_object_versions, events, event_versions, live_event_versions, live_call_handlers
    logger.info(`[${namespacedVersion}] Publishing...`)
    await updatePublishAndDeployLiveObjectVersionJobStatus(uid, PublishAndDeployLiveObjectVersionJobStatus.Publishing)
    const liveObject = await getLiveObject(namespace.id, name)
    const wasPublished = await publishLiveObjectVersion(
        namespace,
        liveObject?.id || null,
        liveObjectSpec as PublishLiveObjectVersionPayload
    )
    if (!wasPublished) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.LIVE_OBJECT_PUBLISH_FAILED)
        logger.error(`Failed to publish Live Object: ${liveObjectSpec.namespace} ${liveObjectSpec.name} ${liveObjectSpec.version}`)
        return
    }
    const liveObjectUid = (await getLiveObjectForLov(namespacedVersion))?.uid
    if (!liveObjectUid) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.LIVE_OBJECT_PUBLISH_FAILED)
        logger.error(`Failed to find Live Object for new lov ${namespacedVersion}.`)
        return
    }
    await updatePublishAndDeployLiveObjectVersionJobMetadata(uid, { liveObjectUid })
 
    // Get live_object_versions entry.
    const namespaceVersion = toNamespacedVersion(liveObjectSpec.namespace, liveObjectSpec.name, liveObjectSpec.version)
    const lovs = await getLiveObjectVersionsByNamespacedVersions([namespaceVersion])
    const lov = lovs[0]
    const liveObjectEntrypointFilePath = path.resolve(__dirname, '../..', 'deno', 'live-object-entrypoint.ts')

    // Get/build map of input group ABIs.
    const uniqueContractGroups = new Set<string>()
    for (const inputEvent of liveObjectSpec.inputEvents) {
        const { nsp } = fromNamespacedVersion(inputEvent)
        uniqueContractGroups.add(nsp)
    }
    const contractGroupNames: string[] = Array.from(uniqueContractGroups)
    const groupAbis = {}
    for (const group of contractGroupNames) {
        groupAbis[group] = await getContractGroupAbi(group)
    }

    // Copy over _abis.ts
    try {
        fs.writeFileSync(
            path.join(objectFolderPath, '_abis.ts'),
            'export default ' + JSON.stringify(groupAbis)
        )
    } catch (err) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.DENO_DEPLOY_FAILED)
        logger.error(`Error saving _abis.ts file: ${err}`)
        return
    }

    // Copy over entrypoint
    try {
        fs.copyFileSync(liveObjectEntrypointFilePath, path.join(objectFolderPath, 'index.ts'))
    } catch (error) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.DENO_DEPLOY_FAILED)
        logger.error(`Error copying deno server file to object folder: ${error}`)
        return
    }

    // Deploy to Deno.
    let denoUrl
    try {
        logger.info(`[${namespacedVersion}] Deploying...`)
        const stdout = execSync(
            `deployctl deploy --import-map=imports.json --project=event-generators ${path.join(folder, 'index.ts')}`,
            { cwd: pathToRepo }
        )
        if (!stdout) throw new Error('No stdout returned from deployctl deploy')
        denoUrl = parseDeployedFunctionUrlFromStdout(stdout.toString().trim())
    } catch (error) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.DENO_DEPLOY_FAILED)
        logger.error(`Error deploying deno server from: ${objectFolderPath}: ${error}`)
        return
    }

    // Update the live object version's url column with the url of the Deno function just deployed.
    const didUpdate = await updateLiveObjectVersionUrl(lov.id, denoUrl)
    if (!didUpdate) {
        await publishAndDeployLiveObjectVersionJobFailed(uid, errors.DENO_DEPLOY_FAILED)
        logger.error(`Failed to update url ${denoUrl} on Live Object ${liveObjectSpec.namespace} ${liveObjectSpec.name} ${liveObjectSpec.version}`)
        return
    }

    // Kick off indexing for live object versions
    await enqueueDelayedJob('indexLiveObjectVersions', {
        lovIds: [lov.id],
        publishJobTableUid: uid,
        liveObjectUid,
    })
}

function parseDeployedFunctionUrlFromStdout(stdout: string): string | null {
    const foundUrls = parseUrls(stdout)
    if (!foundUrls?.length) return null
    return foundUrls.find(url => url.includes('deno')) || null
}

async function getMigrationTxs(
    name: string,
    folder: string,
    objectFolderPath: string,
    pathToRepo: string,
): Promise<{ error: Error | null, migrationTxs: StringKeyMap[] | null, liveObjectSpec: StringKeyMap | null }> {
    let migrationTxs = []

    // get sql for given table
    const { 
        error: resolveMigrationError, 
        tableMigration, 
        liveObjectSpec,
        pkColumnName
    } = await getTableMigrationAndLiveObjectSpec(folder, objectFolderPath, pathToRepo)
    if (resolveMigrationError) {
        return {
            error: new Error(`Failed to generate migrations for ${name}: ${resolveMigrationError}`),
            migrationTxs: null,
            liveObjectSpec: null
        }
    }
    migrationTxs = migrationTxs.concat(tableMigration)

    // get schema and table names from table config
    const [schemaName, tableName] = liveObjectSpec.config.table.split('.')

    // create table triggers
    const triggerMigrations = getTriggersMigration(schemaName, tableName, pkColumnName)
    migrationTxs = migrationTxs.concat(triggerMigrations)

    // create opts table
    const schemaOpsMigration = getSchemaOpsMigration(schemaName, tableName)
    migrationTxs = migrationTxs.concat(schemaOpsMigration)

    // add to op_tracking table
    const { error: opsMigrationError, opsMigration } = await getOpsMigration(schemaName, tableName, liveObjectSpec.chains)
    if (opsMigrationError) {
        return {
            error: new Error(`Failed to generate ops migrations for table: ${schemaName}.${tableName}: ${opsMigrationError}`),
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
    name: string,
    folder: string
): Promise<{ 
    error: Error | null,
    manifest: StringKeyMap | null,
    objectFolderPath: string | null 
    pathToRepo?: string,
}>  {
    const { name: nsp, codeUrl } = namespace

    let objectFolderPath, manifest, pathToRepo
    try {
        // clone LiveObject repo from github and parse manifest.json
        pathToRepo = await cloneRepo(codeUrl, uuid4())
        if (!pathToRepo) {
            return { error: new Error(`Error cloning repo ${codeUrl}`), manifest: null, objectFolderPath: null }
        }        

        objectFolderPath = path.join(pathToRepo, folder)
        const manifestPath = path.join(objectFolderPath, 'manifest.json')
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

        if (manifest.namespace !== nsp) {
            return {
                error: new Error(`Namespace mismatch between request (${nsp}) and sourced manifest (${manifest.namespace})`),
                manifest: null,
                objectFolderPath: null
            }
        }
        if (manifest.name !== name) {
            return {
                error: new Error(`Name mismatch between request (${name}) and sourced manfiest (${manifest.name})`),
                manifest: null,
                objectFolderPath: null
            }
        }

        const dotSpecPath = path.join(pathToRepo, '.spec')
        const abisPath = path.join(pathToRepo, 'abis')
        const pathsToDelete = [dotSpecPath, abisPath]
        for (const dir of pathsToDelete) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        }
    } catch (error) {
        return {
            error: new Error(`Error parsing manifest from repo ${codeUrl}: ${error}`),
            manifest: null,
            objectFolderPath: null
        }
    }

    return {
        error: null,
        objectFolderPath,
        manifest,
        pathToRepo,
    }
}

async function doesTableExist(schemaName: string, tableName: string): Promise<boolean> {
    const query = {
        sql: `select count(*) from pg_tables where schemaname = $1 and tablename in ($2, $3)`,
        bindings: [schemaName, tableName, `"${tableName}"`],
    }

    let rows = []
    try {
        rows = await ChainTables.query(null, query.sql, query.bindings);
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

export default function job(params: StringKeyMap) {
    const nsp = params.nsp || ''
    const name = params.name || ''
    const version = params.version || ''
    const folder = params.folder || ''
    const uid = params.uid || ''

    return {
        perform: async () => publishAndDeployLiveObjectVersion(
            nsp,
            name,
            version,
            folder,
            uid,
        )
    }
}
