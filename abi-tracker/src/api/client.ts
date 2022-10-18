import { routes } from './routes'
import { post } from '../utils/request'
import config from '../config'
import { SpecApiResponse, StringMap } from '../types'

const formatAuthHeader = (): StringMap => ({
    [config.ADMIN_AUTH_HEADER_NAME]: config.CORE_API_ADMIN_TOKEN,
})

async function upsertAbis(addresses: string[]): Promise<SpecApiResponse> {
    return await post(routes.UPSERT_ABIS, { addresses }, formatAuthHeader())
}

export const client = {
    upsertAbis,
}