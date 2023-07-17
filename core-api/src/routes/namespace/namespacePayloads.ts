import { StringKeyMap, ValidatedPayload } from '../../types'

export interface GetNamespacePayload {
    slug: string
}

export function parseGetNamespacePayload(data: StringKeyMap): ValidatedPayload<GetNamespacePayload> {
    const slug = data?.slug

    if (!slug || !slug.length) {
        return { isValid: false, error: '"slug" was missing or empty' }
    }

    return {
        isValid: true,
        payload: { slug },
    }
}