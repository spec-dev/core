import createNamespace from './createNamespace'
import createLiveObject from './createLiveObject'
import createLiveObjectVersion from './createLiveObjectVersion'
import createEdgeFunction from './createEdgeFunction'
import createEdgeFunctionVersion from './createEdgeFunctionVersion'
import createLiveEdgeFunctionVersion from './createLiveEdgeFunctionVersion'
import { argv } from 'process'
import logger from '../lib/logger'

const jobs = {
    createNamespace,
    createLiveObject,
    createLiveObjectVersion,
    createEdgeFunction,
    createEdgeFunctionVersion,
    createLiveEdgeFunctionVersion,
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