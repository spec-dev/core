import { validate } from 'compare-versions'
import { EdgeFunctionComps } from './types'

export function parseEdgeFunctionCompsFromUrl(url: string): EdgeFunctionComps {
    const path = url.split('/')[1]
    if (!path) return {}

    let nsp, name, version, functionSplitComps
    if (path.includes('@')) {
        const versionSplitComps = path.split('@')
        if (versionSplitComps.length !== 2) return {}
        name = versionSplitComps[0]
        version = versionSplitComps[1]
        functionSplitComps = name.split('.')
    } else {
        functionSplitComps = path.split('.')
    }

    if (functionSplitComps.length !== 2) return {}
    nsp = functionSplitComps[0]
    name = functionSplitComps[1]

    return { nsp, name, version: version || null }
}

export function isValidVersionFormat(version: string): boolean {
    return validate(version)
}
