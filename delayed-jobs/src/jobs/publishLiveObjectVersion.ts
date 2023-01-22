import {
    logger,
    PublishLiveObjectVersionPayload,
    StringKeyMap,
    toNamespacedVersion,
    getLatestLiveObjectVersion,
    isVersionGt,
    upsertLiveObject,
    createLiveObjectVersionWithTx,
    upsertEdgeFunction,
    createEdgeFunctionVersionWithTx,
    CoreDB,
    lowerCaseCamel,
    LiveEdgeFunctionVersionRole,
    createLiveEdgeFunctionVersionWithTx,
    createLiveEventVersionsWithTx,
    getEventVersionsByNamespacedVersions,
    EventVersion,
} from '../../../shared'
import os from 'os'
import path from 'path'
import fs from 'fs'
import rimraf from 'rimraf'
import git from 'nodegit'
import short from 'short-uuid'
import { MAIN_FUNCTION, EVENT_FUNCTION } from '../templates/deno'
import { deployToDeno } from '../cmds/deno'
import uuid4 from 'uuid4'

const denoProjects = {
    FUNCTIONS: 'functions',
    EVENTS: 'events',
}

const denoFiles = {
    INDEX: 'index.ts',
    UID: '_uid.ts',
}

async function publishLiveObjectVersion(
    namespace: StringKeyMap,
    liveObjectId: number | null,
    payload: PublishLiveObjectVersionPayload,
) {
    // Create nsp.name@version formatted string for live object version.
    const namespacedLiveObjectVersion = toNamespacedVersion(
        namespace.slug,
        payload.name,
        payload.version,
    )
    logger.info(`Publishing live object version: ${namespacedLiveObjectVersion}`)

    // Namespace needs a codeUrl to git-clone.
    if (namespace.codeUrl) {
        logger.error(`Namespace "${namespace.slug}" has no remote git repository.`)
        return
    }

    // Get any event versions explicitly requested.
    const additionalEventVersions = await resolveEventVersions(payload.additionalEventAssociations)
    if (additionalEventVersions === null) return

    // Clone this namespace's remote git repo.
    const uid = short.generate()
    const repoDir = await cloneRepo(namespace.codeUrl, uid)
    if (!repoDir) return

    // Construct full path to live object folder within repo.
    const liveObjectFolderPath = path.join(repoDir, payload.folder)
    if (!fs.existsSync(liveObjectFolderPath)) {
        logger.error(`Specified live object folder is missing: ${payload.folder}`)
        return
    }

    // Ensure the version to publish is greater than the existing version.
    const latestLiveObjectVersion = liveObjectId && await getLatestLiveObjectVersion(liveObjectId)
    if (latestLiveObjectVersion && !isVersionGt(payload.version, latestLiveObjectVersion.version)) {
        logger.error(
            `Can't publish version ${payload.version} when ${latestLiveObjectVersion.version} already exists.`
        )
        return
    }

    // Deploy edge function version to Deno.
    const edgeFunctionVersionUrl = deployLiveObjectMainFunction(
        liveObjectFolderPath,
        uid,
    )
    if (!edgeFunctionVersionUrl) {
        logger.error(`Failed to deploy edge function for ${namespacedLiveObjectVersion}`)
        return
    }

    // --- TODO: Event deployments to deno. ---

    // Create/save all CoreDB data models.
    const saved = await saveDataModels(
        namespace,
        payload,
        liveObjectId,
        edgeFunctionVersionUrl,
        namespacedLiveObjectVersion,
        additionalEventVersions,
    )
    if (!saved) return

    // Clean up.
    deleteDir(repoDir)

    logger.info(`Successfully published live object version: ${namespacedLiveObjectVersion}`)
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

function deployLiveObjectMainFunction(liveObjectFolderPath: string, uid: string): string | null {
    // Save uid file so that deno recognizes a diff.
    if (saveLiveObjectUidFile(liveObjectFolderPath, uid)) return null

    // Save index.ts entrypoint file.
    if (saveIndexFile(liveObjectFolderPath, MAIN_FUNCTION)) return null
    
    // Deploy main function.
    return deployToDeno(
        denoProjects.FUNCTIONS, 
        path.join(liveObjectFolderPath, denoFiles.INDEX),
    )
}

function saveLiveObjectUidFile(liveObjectFolderPath: string, uid: string): boolean {
    try {
        fs.writeFileSync(path.join(liveObjectFolderPath, denoFiles.UID), uid)
    } catch (err) {
        logger.error(`Error saving live object uid file: ${err}`)
        return false
    }
    return true
}

function saveIndexFile(liveObjectFolderPath: string, fileContents: string): boolean {
    try {
        fs.writeFileSync(path.join(liveObjectFolderPath, denoFiles.INDEX), fileContents)
    } catch (err) {
        logger.error(`Error saving live object ${denoFiles.INDEX} file: ${err}`)
        return false
    }
    return true
}

async function saveDataModels(
    namespace: StringKeyMap,
    payload: PublishLiveObjectVersionPayload,
    liveObjectId: number,
    edgeFunctionVersionUrl: string,
    namespacedLiveObjectVersion: string,
    additionalEventVersions: EventVersion[],
): Promise<boolean> {
    try {
        await CoreDB.manager.transaction(async (tx) => {
            // Upsert live object.
            liveObjectId = liveObjectId || await createLiveObject(namespace.id, payload, tx)

            // Create new live object version.
            const liveObjectVersionId = await createLiveObjectVersion(namespace.slug, liveObjectId, payload, tx)

            // Upsert edge function.
            const edgeFunctionId = await createEdgeFunction(namespace.id, payload, tx)

            // Create edge function version with newly deployed deno url.
            const edgeFunctionVersionId = await createEdgeFunctionVersion(
                namespace.slug, 
                edgeFunctionId,
                edgeFunctionVersionUrl,
                payload,
                tx,
            )

            // Create live edge function version to associated function with live object.
            await createLiveEdgeFunctionVersion(liveObjectVersionId, edgeFunctionVersionId, tx)

            // Create any additional live event versions that were explicitly specified.
            additionalEventVersions.length && await createLiveEventVersions(
                liveObjectVersionId,
                additionalEventVersions.map(ev => ev.id),
                tx,
            )
        })
    } catch (err) {
        logger.error(
            `Failed to save data models while publishing ${namespacedLiveObjectVersion}: ${err}`
        )
        return false
    }
    return true
}

function deleteDir(dir: string) {
    try {
        rimraf.sync(dir)
    } catch (err) {
        logger.error(`Failed to delete cloned git repo at ${dir}: ${err}`)
    }
}

async function resolveEventVersions(namespacedVersions: string[]): Promise<EventVersion[] | null> {
    if (!namespacedVersions?.length) return []

    const eventVersions = await getEventVersionsByNamespacedVersions(namespacedVersions)
    if (eventVersions.length !== namespacedVersions.length) {
        logger.error(`Failed to resolve all event versions: ${namespacedVersions.join(', ')}`)
        return null
    }

    return eventVersions
}

async function createLiveObject(
    namespaceId: number, 
    payload: PublishLiveObjectVersionPayload,
    tx: any,
): Promise<number> {
    const liveObject = await upsertLiveObject({
        uid: uuid4(),
        name: payload.name,
        desc: payload.description,
        displayName: payload.displayName,
        namespaceId: namespaceId,
    }, tx)
    return liveObject.id
}

async function createLiveObjectVersion(
    nsp: string, 
    liveObjectId: number, 
    payload: PublishLiveObjectVersionPayload, 
    tx: any,
): Promise<number | null> {
    const liveObjectVersion = await createLiveObjectVersionWithTx({
        uid: uuid4(),
        nsp,
        name: payload.name,
        version: payload.version,
        properties: payload.properties,
        config: payload.config,
        liveObjectId,
    }, tx)
    return liveObjectVersion.id
}

async function createEdgeFunction(
    namespaceId: number, 
    payload: PublishLiveObjectVersionPayload,
    tx: any,
): Promise<number> {
    const edgeFunction = await upsertEdgeFunction({
        name: payload.name,
        desc: `Get ${payload.displayName}`,
        namespaceId: namespaceId,
    }, tx)
    return edgeFunction.id
}

async function createEdgeFunctionVersion(
    nsp: string, 
    edgeFunctionId: number,
    url: string,
    payload: PublishLiveObjectVersionPayload,
    tx: any,
): Promise<number> {
    const edgeFunctionVersion = await createEdgeFunctionVersionWithTx({
        nsp,
        name: lowerCaseCamel(payload.name) + 's',
        version: payload.version,
        edgeFunctionId,
        url,
    }, tx)
    return edgeFunctionVersion.id
}

async function createLiveEdgeFunctionVersion(
    liveObjectVersionId: number,
    edgeFunctionVersionId: number,
    tx: any,
): Promise<number> {
    const liveEdgeFunctionVersion = await createLiveEdgeFunctionVersionWithTx({
        role: LiveEdgeFunctionVersionRole.GetMany,
        liveObjectVersionId,
        edgeFunctionVersionId,
    }, tx)
    return liveEdgeFunctionVersion.id
}

async function createLiveEventVersions(
    liveObjectVersionId: number,
    eventVersionIds: number[],
    tx: any,
) {
    const insertData = eventVersionIds.map(eventVersionId => ({
        liveObjectVersionId,
        eventVersionId,
    }))
    await createLiveEventVersionsWithTx(insertData, tx)
}

export default function job(params: StringKeyMap) {
    const namespace = params.namespace || {}
    const liveObjectId = params.liveObjectId
    const payload = params.payload || {}
    return {
        perform: async () => publishLiveObjectVersion(namespace, liveObjectId, payload)
    }
}