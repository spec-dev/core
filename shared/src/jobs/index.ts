import createNamespace from './createNamespace'
import createLiveObject from './createLiveObject'
import createLiveObjectVersion from './createLiveObjectVersion'
import getFailedIndexedBlocks from './getFailedIndexedBlocks'
import createEvent from './createEvent'
import createEventVersion from './createEventVersion'
import createLiveEventVersion from './createLiveEventVersion'
import createUser from './createUser'
import createNamespaceUser from './createNamespaceUser'
import createNamespaceAccessToken from './createNamespaceAccessToken'
import createProject from './createProject'
import createProjectRole from './createProjectRole'
import createContract from './createContract'
import createContractInstance from './createContractInstance'
import getProjects from './getProjects'
import getEventVersions from './getEventVersions'
import getAbi from './getAbi'
import saveAbi from './saveAbi'
import custom from './custom'
import updateLiveObjectVersionProperties from './updateLiveObjectVersionProperties'
import updateLiveObjectVersionExample from './updateLiveObjectVersionExample'
import removeNamespaceAsFailed from './removeNamespaceAsFailed'
import removeKeys from './removeKeys'
import { argv } from 'process'
import logger from '../lib/logger'

const jobs = {
    createNamespace,
    createLiveObject,
    createLiveObjectVersion,
    getFailedIndexedBlocks,
    createEvent,
    createEventVersion,
    createLiveEventVersion,
    createUser,
    createNamespaceUser,
    createNamespaceAccessToken,
    createProject,
    createProjectRole,
    createContract,
    createContractInstance,
    getProjects,
    getEventVersions,
    getAbi,
    saveAbi,
    custom,
    updateLiveObjectVersionProperties,
    updateLiveObjectVersionExample,
    removeKeys,
    removeNamespaceAsFailed,
}

async function run() {
    const processArgs = argv.slice(2) || []
    const jobName = processArgs[0]
    const jobArgs = processArgs.slice(1) || []
    const job = jobs[jobName]
    if (!job) {
        logger.error(`Job not found for name: ${jobName}`)
        return
    }
    await job(...jobArgs)
}

run()
