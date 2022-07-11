import { ExternalEthTrace } from '../types'
import { EthTrace } from 'shared'

export function externalToInternalTraces(externalTraces: ExternalEthTrace[], chainId: number): EthTrace[] {
    return externalTraces.map(t => externalToInternalTrace(t, chainId))
}

export function externalToInternalTrace(externalTrace: ExternalEthTrace, chainId: number): EthTrace {
    const trace = new EthTrace()

    // TODO: Lots of hard logic...

    return trace
}