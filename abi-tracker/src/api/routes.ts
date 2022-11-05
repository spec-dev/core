import config from '../config'

const prefix = {
    ADMIN: 'admin',
}

export const routes = {
    UPSERT_ABIS: [config.CORE_API_ORIGIN, prefix.ADMIN, 'abis'].join('/'),
}