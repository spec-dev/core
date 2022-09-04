import latestInteractions from './eth/latestInteractions'

const functionsIndex = {
    'eth.latestInteractions': latestInteractions,
    'eth.latestInteractions@0.0.1': latestInteractions,
}

export function getEdgeFunction(nsp: string, name: string, version: string | null) {
    let key = [nsp, name].join('.')
    if (version) {
        key = [key, version].join('@')
    }
    return functionsIndex[key]
}