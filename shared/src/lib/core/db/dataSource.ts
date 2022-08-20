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
import { PublishedEvent } from './entities/PublishedEvent'
import { LiveObject } from './entities/LiveObject'
import { LiveObjectVersion } from './entities/LiveObjectVersion'
import { LiveEventVersion } from './entities/LiveEventVersion'
import { LiveEdgeFunctionVersion } from './entities/LiveEdgeFunctionVersion'
import { initDb1658282747359 } from './migrations/1658282747359-init-db'
import { createEventGeneratorTable1658285708985 } from './migrations/1658285708985-create-event-generator-table'
import { createEventTables1658457806801 } from './migrations/1658457806801-create-event-tables'
import { removeEventTopic1658603848781 } from './migrations/1658603848781-remove-event-topic'
import { addPublishedEventsTable1658773500868 } from './migrations/1658773500868-add-published-events-table'
import { changePublishedEventsTimestampType1658776833768 } from './migrations/1658776833768-change-published-events-timestamp-type'
import { addLiveObjectTables1658872322539 } from './migrations/1658872322539-add-live-object-tables'
import { addNewPrimaryIdToPublishedEvents1659037328993 } from './migrations/1659037328993-add-new-primary-id-to-published-events'
import { breakOutPublishedEventIntoMoreCols1659038117238 } from './migrations/1659038117238-break-out-published-event-into-more-cols'
import { addArgRelatedJsonColsFunctionTables1659688394379 } from './migrations/1659688394379-add-arg-related-json-cols-function-tables'
import { addArgsToLiveEdgeFunctionVersion1661024277521 } from './migrations/1661024277521-add-args-to-live-edge-function-version'

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
        // Public schema.
        Namespace,
        EdgeFunction,
        EdgeFunctionVersion,
        Contract,
        ContractInstance,
        EventGenerator,
        Event,
        EventVersion,
        LiveObject,
        LiveObjectVersion,
        LiveEventVersion,
        LiveEdgeFunctionVersion,

        // Instances schema.
        PublishedEvent,
    ],
    migrations: [
        initDb1658282747359,
        createEventGeneratorTable1658285708985,
        createEventTables1658457806801,
        removeEventTopic1658603848781,
        addPublishedEventsTable1658773500868,
        changePublishedEventsTimestampType1658776833768,
        addLiveObjectTables1658872322539,
        addNewPrimaryIdToPublishedEvents1659037328993,
        breakOutPublishedEventIntoMoreCols1659038117238,
        addArgRelatedJsonColsFunctionTables1659688394379,
        addArgsToLiveEdgeFunctionVersion1661024277521,
    ],
    subscribers: [],
})
