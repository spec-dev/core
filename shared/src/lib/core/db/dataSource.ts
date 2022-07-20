import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { Namespace } from './entities/Namespace'
import { EdgeFunction } from './entities/EdgeFunction'
import { EdgeFunctionVersion } from './entities/EdgeFunctionVersion'
import { Contract } from './entities/Contract'
import { ContractInstance } from './entities/ContractInstance'
import { EventGenerator } from './entities/EventGenerator'
import { initDb1658282747359 } from './migrations/1658282747359-init-db'
import { createEventGeneratorTable1658285708985 } from './migrations/1658285708985-create-event-generator-table'

export const CoreDB = new DataSource({
    type: 'postgres',
    host: config.CORE_DB_HOST,
    port: config.CORE_DB_PORT,
    username: config.CORE_DB_USERNAME,
    password: config.CORE_DB_PASSWORD,
    database: 'core',
    synchronize: false,
    logging: false,
    entities: [
        Namespace,
        EdgeFunction,
        EdgeFunctionVersion,
        Contract,
        ContractInstance,
        EventGenerator,
    ],
    migrations: [initDb1658282747359, createEventGeneratorTable1658285708985],
    subscribers: [],
})
