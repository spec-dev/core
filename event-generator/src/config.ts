import { ev, config, StringKeyMap } from '../../shared'

const eventGeneratorConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: ev('CHAIN_ID'),
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    EVENT_RELAY_HOSTNAME: ev('EVENT_RELAY_HOSTNAME', 'events.spec.dev'),
    EVENT_RELAY_PORT: Number(ev('EVENT_RELAY_PORT', 443)),
    EVENT_GEN_AUTH_HEADER_NAME: 'Spec-Auth-Token',
    EVENT_GENERATORS_JWT: ev('EVENT_GENERATORS_JWT'),
    EVENT_GEN_RESPONSE_TIMEOUT: Number(ev('EVENT_GEN_RESPONSE_TIMEOUT', 60000)),
    TABLES_AUTH_HEADER_NAME: 'Spec-Tables-Auth-Token',
}

export default eventGeneratorConfig