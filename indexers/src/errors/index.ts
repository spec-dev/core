import { StringKeyMap } from '../../../shared'

export function shouldRetryOnWeb3ProviderError(error: StringKeyMap): boolean {
    const message = (error.message || '').toLowerCase()
    if (!message) return false
    if (error.code === 429) return true // Throughput-limited
    return !!message.match(
        /(being processed|getaddrinfo enotfound|timedout|internal server error)/gi
    )
}
