import { 
    getEdgeFunctionVersion, 
    getLatestEdgeFunctionVersion,
    getEdgeFunctionUrl as getEdgeFunctionUrlFromRedis,
    setEdgeFunctionUrl as setEdgeFunctionUrlToRedis,
    formatEdgeFunctionVersionStr,
} from 'shared'
import { edgeFunctionUrls } from '../utils/lru'

async function getEdgeFunctionUrl(nsp: string, functionName: string, version: string | null): Promise<string | null> {
    const key = formatEdgeFunctionVersionStr(nsp, functionName, version)

    // Check LRU cache first.
    let url = edgeFunctionUrls.get(key)
    if (url) return url

    // Check redis second.
    url = await getEdgeFunctionUrlFromRedis(nsp, functionName, version)
    if (url) {
        // Add to LRU cache.
        edgeFunctionUrls.set(key, url)
        return url
    }

    // Check Core DB last.
    const edgeFunctionVersion = version 
        ? await getEdgeFunctionVersion(nsp, functionName, version)
        : await getLatestEdgeFunctionVersion(nsp, functionName)
    if (edgeFunctionVersion) {
        url = edgeFunctionVersion.url

        if (version) {
            await setEdgeFunctionUrlToRedis(url, nsp, functionName, version)
            edgeFunctionUrls.set(key, url)
        } else {
            await Promise.all([
                setEdgeFunctionUrlToRedis(url, nsp, functionName, edgeFunctionVersion.version),
                setEdgeFunctionUrlToRedis(url, nsp, functionName),
            ])
            edgeFunctionUrls.set(formatEdgeFunctionVersionStr(nsp, functionName, edgeFunctionVersion.version), url)
            edgeFunctionUrls.set(key, url)
        }
        
        return url    
    }

    return null
}

export default getEdgeFunctionUrl