import { StringKeyMap, ValidatedPayload } from '../../../types'

export interface FeaturedNamespacePayload {
    namespaceSlugs: string[]
}

export function parsePostFeaturedNamespacePayload(data: StringKeyMap): ValidatedPayload<FeaturedNamespacePayload> {
    const namespaceSlugs = data?.slugs || []
    return {
        isValid: true,
        payload: { namespaceSlugs },
    }
}