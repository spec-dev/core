import { EventVersion } from '..'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const eventVersionsRepo = () => CoreDB.getRepository(EventVersion)
    const eventVersions = await eventVersionsRepo().find()
    for (let ev of eventVersions) {
        console.log(ev)
    }
    exit(0)
}

export default perform
