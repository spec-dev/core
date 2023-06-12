import { getContractGroupAbi } from '../abi/redis'
import { AbiItemType } from '../abi/types'
import { StringKeyMap } from '../types'
import { chainIdForContractNamespace, contractNamespaceForChainId } from '../utils/chainIds'
import { unique, fromNamespacedVersion, toNamespacedVersion } from '../utils/formatters'

export async function resolveCallVersionNames(inputs: string[]): Promise<StringKeyMap> {
    const uniqueInputs = unique(inputs).filter((v) => !!v)
    const fakeVersion = 'fake'
    const uniqueChainContractGroupsSet = new Set<string>()
    const inputComps = []
    for (const input of uniqueInputs) {
        const { nsp, name, version } = fromNamespacedVersion(
            input.includes('@') ? input : `${input}@${fakeVersion}`
        )
        if (!nsp || !name || !version) continue

        const chainId = chainIdForContractNamespace(nsp)
        if (!chainId) continue

        const contractGroup = nsp.split('.').slice(2).join('.')

        inputComps.push({
            nsp,
            name,
            version: version === fakeVersion ? '' : version,
        })

        uniqueChainContractGroupsSet.add([chainId, contractGroup].join(':'))
    }

    const uniqueChainContractGroups = Array.from(uniqueChainContractGroupsSet).map((v) => {
        const [chainId, contractGroup] = v.split(':')
        return { chainId, contractGroup }
    })
    if (!uniqueChainContractGroups.length) return {}

    const contractGroupAbis = await Promise.all(
        uniqueChainContractGroups.map(({ chainId, contractGroup }) =>
            getContractGroupAbi(contractGroup, chainId)
        )
    )

    const abisForNsp = {}
    for (let i = 0; i < uniqueChainContractGroups.length; i++) {
        const { chainId, contractGroup } = uniqueChainContractGroups[i]

        const contractGroupAbi = contractGroupAbis[i]
        if (!contractGroupAbi || !contractGroupAbi?.length) continue

        const contractNamespace = contractNamespaceForChainId(chainId)
        if (!contractNamespace) continue

        const nsp = [contractNamespace, contractGroup].join('.')
        abisForNsp[nsp] = abisForNsp[nsp] || contractGroupAbi
    }

    const resolvedNamesMap = {}
    for (const { nsp, name, version } of inputComps) {
        const functionPath = [nsp, name].join('.')
        const contractGroupAbi = abisForNsp[nsp]
        if (!contractGroupAbi) continue

        const existingVersions = unique(
            contractGroupAbi
                .filter((item) => item.type === AbiItemType.Function && item.name === name)
                .map((item) => item.signature)
                .filter((v) => !!v)
        )

        const numExistingVersions = existingVersions.length

        // No registered functions were found for this contract group + function name.
        if (!numExistingVersions) continue

        // Multiple versions exist but no exact version was specified.
        if (numExistingVersions > 1 && !version) {
            return {
                data: {
                    error:
                        `Ambigious contract function call reference "${functionPath}"\n` +
                        `Multiple versions exist...Choose from one of the following:\n` +
                        `${existingVersions
                            .map((v) => `- ${toNamespacedVersion(nsp, name, v)}`)
                            .join('\n')}`,
                },
            }
        }

        // Version was specified but not registered.
        if (version && !existingVersions.includes(version)) continue

        const actualVersion = version || existingVersions[0]
        const givenInput = version ? toNamespacedVersion(nsp, name, version) : functionPath
        resolvedNamesMap[givenInput] = toNamespacedVersion(nsp, name, actualVersion)
    }

    return resolvedNamesMap
}
