import { getContractGroupAbi } from '../abi/redis'
import { AbiItemType } from '../abi/types'
import { StringKeyMap } from '../types'
import { chainIdForContractNamespace, contractNamespaceForChainId } from '../utils/chainIds'
import { unique, fromNamespacedVersion, toNamespacedVersion } from '../utils/formatters'

export async function resolveCallVersionNames(inputs: string[]): Promise<StringKeyMap> {
    const uniqueInputs = unique(inputs).filter((v) => !!v)
    const fakeVersion = 'fake'
    const uniqueContractGroupsSet = new Set<string>()
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

        uniqueContractGroupsSet.add(contractGroup)
    }
    if (!uniqueContractGroupsSet.size) return { data: {} }

    const uniqueContractGroups = Array.from(uniqueContractGroupsSet)
    const contractGroupAbis = await Promise.all(uniqueContractGroups.map(getContractGroupAbi))
    const groupAbis = {}
    for (let i = 0; i < uniqueContractGroups.length; i++) {
        groupAbis[uniqueContractGroups[i]] = contractGroupAbis[i]
    }

    const resolvedNamesMap = {}
    for (const { nsp, name, version } of inputComps) {
        const functionPath = [nsp, name].join('.')
        const contractGroup = nsp.split('.').slice(2).join('.')
        const contractGroupAbi = groupAbis[contractGroup]
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

    return { data: resolvedNamesMap }
}
