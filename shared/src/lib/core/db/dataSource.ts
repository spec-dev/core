import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { Namespace } from './entities/Namespace'
import { EdgeFunction } from './entities/EdgeFunction'
import { EdgeFunctionVersion } from './entities/EdgeFunctionVersion'
import { initDb1658196787178 } from './migrations/1658196787178-init-db'

export const CoreDB = new DataSource({
    type: 'postgres',
    host: config.CORE_DB_HOST,
    port: config.CORE_DB_PORT,
    username: config.CORE_DB_USERNAME,
    password: config.CORE_DB_PASSWORD,
    database: 'core',
    synchronize: false,
    logging: false,
    entities: [Namespace, EdgeFunction, EdgeFunctionVersion],
    migrations: [initDb1658196787178],
    subscribers: [],
})
