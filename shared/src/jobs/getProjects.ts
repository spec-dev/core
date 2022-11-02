import { Project } from '..'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const projectsRepo = () => CoreDB.getRepository(Project)
    const projects = await projectsRepo().find()
    for (let p of projects) {
        console.log(p)
    }
    exit(0)
}

export default perform
