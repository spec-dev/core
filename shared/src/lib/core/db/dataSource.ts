import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { Namespace } from './entities/Namespace'
import { EdgeFunction } from './entities/EdgeFunction'
import { EdgeFunctionVersion } from './entities/EdgeFunctionVersion'
import { Contract } from './entities/Contract'
import { ContractInstance } from './entities/ContractInstance'
import { EventGenerator } from './entities/EventGenerator'
import { Event } from './entities/Event'
import { EventVersion } from './entities/EventVersion'
import { initDb1658282747359 } from './migrations/1658282747359-init-db'
import { createEventGeneratorTable1658285708985 } from './migrations/1658285708985-create-event-generator-table'
import { createEventTables1658457806801 } from './migrations/1658457806801-create-event-tables'

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
        Event,
        EventVersion,
    ],
    migrations: [
        initDb1658282747359,
        createEventGeneratorTable1658285708985,
        createEventTables1658457806801,
    ],
    subscribers: [],
})
