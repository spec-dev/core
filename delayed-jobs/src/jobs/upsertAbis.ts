import { StringKeyMap } from '../../../shared'

async function upsertAbis(addresses: string[]) {

}

export default function job(params: StringKeyMap) {
    const addresses = params.addresses || []
    return {
        perform: async () => upsertAbis(addresses)
    }
}