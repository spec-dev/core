import { getEdgeFunctions } from '../lib/core/db/services/edgeFunctionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    await CoreDB.query(`update edge_function_versions set url = 'https://functions-dev-5zgtj36vh36g.deno.dev' where name = 'smartWallets'`)
    exit(0)
}

export default perform