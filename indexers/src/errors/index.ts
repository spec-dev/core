import { StringKeyMap } from '../../../shared'

export function shouldRetryOnWeb3ProviderError(error: StringKeyMap): boolean {
    const message = (error.message || '').toLowerCase()
    if (!message) return false

    return !!message.match(
        /(being processed|getaddrinfo enotfound|timedout|internal server error)/gi
    )
}
