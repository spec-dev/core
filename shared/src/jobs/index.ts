import createNamespace from './createNamespace'
import createLiveObject from './createLiveObject'
import createLiveObjectVersion from './createLiveObjectVersion'
import createEdgeFunction from './createEdgeFunction'
import createEdgeFunctionVersion from './createEdgeFunctionVersion'
import createLiveEdgeFunctionVersion from './createLiveEdgeFunctionVersion'
import getEdgeFunctions from './getEdgeFunctions'
import getEdgeFunctionVersions from './getEdgeFunctionVersions'
import deleteEdgeFunctionVersions from './deleteEdgeFunctionVersions'
import deleteLiveEdgeFunctionVersions from './deleteLiveEdgeFunctionVersions'
import getFailedIndexedBlocks from './getFailedIndexedBlocks'
import createEvent from './createEvent'
import createEventVersion from './createEventVersion'
import createLiveEventVersion from './createLiveEventVersion'
import createUser from './createUser'
import createOrg from './createOrg'
import createOrgUser from './createOrgUser'
import createProject from './createProject'
import createProjectRole from './createProjectRole'
import createContract from './createContract'
import createContractInstance from './createContractInstance'
import getProjects from './getProjects'
import getEventVersions from './getEventVersions'
import lrq from './lrq'
import getAbi from './getAbi'
import saveAbi from './saveAbi'
import custom from './custom'
import setEdgeFunctionVersionUrl from './setEdgeFunctionVersionUrl'
import updateLiveObjectVersionProperties from './updateLiveObjectVersionProperties'
import updateLiveObjectVersionExample from './updateLiveObjectVersionExample'
import { argv } from 'process'
import logger from '../lib/logger'

const jobs = {
    createNamespace,
    createLiveObject,
    createLiveObjectVersion,
    createEdgeFunction,
    createEdgeFunctionVersion,
    createLiveEdgeFunctionVersion,
    getEdgeFunctions,
    getEdgeFunctionVersions,
    deleteEdgeFunctionVersions,
    deleteLiveEdgeFunctionVersions,
    getFailedIndexedBlocks,
    createEvent,
    createEventVersion,
    createLiveEventVersion,
    createUser,
    createOrg,
    createOrgUser,
    createProject,
    createProjectRole,
    createContract,
    createContractInstance,
    lrq,
    getProjects,
    getEventVersions,
    getAbi,
    saveAbi,
    custom,
    setEdgeFunctionVersionUrl,
    updateLiveObjectVersionProperties,
    updateLiveObjectVersionExample,
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
