import config from '../config'

const prefix = {
    ADMIN: 'admin',
}

export const routes = {
    UPSERT_ABIS: [config.SPEC_API_ORIGIN, prefix.ADMIN, 'abis'].join('/'),
}