interface EdgeFunctionComps {
    nsp?: string
    functionName?: string
    version?: string | null
}

export function parseEdgeFunctionCompsFromUrl(url: string): EdgeFunctionComps {
    const path = url.split('/')[1]
    if (!path) return {}

    let nsp, functionName, version, functionSplitComps
    if (path.includes('@')) {
        const versionSplitComps = path.split('@')
        if (versionSplitComps.length !== 2) return {}
        functionName = versionSplitComps[0]
        version = versionSplitComps[1]
        functionSplitComps = functionName.split('.')
    } else {
        functionSplitComps = path.split('.')
    }

    if (functionSplitComps.length !== 2) return {}
    nsp = functionSplitComps[0]
    functionName = functionSplitComps[1]    

    return { nsp, functionName, version: version || null }
}