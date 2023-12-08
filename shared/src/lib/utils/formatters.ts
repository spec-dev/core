import { numberToHex as nth, hexToNumber as htn, hexToNumberString as htns } from 'web3-utils'
import { StringKeyMap, ContractEventSpec } from '../types'
import { Abi } from '../abi/types'
import humps from 'humps'
import Web3 from 'web3'
import { ident } from 'pg-format'
import { toDate } from './date'
import { isContractNamespace } from './chainIds'
import logger from '../logger'
import { EvmTransaction } from '../shared-tables/db/entities/EvmTransaction'
import { hash } from '../utils/hash'
import { MAX_TABLE_NAME_LENGTH } from '../utils/pgMeta'
import { EventVersion } from '../core/db/entities/EventVersion'
import { getChainIdsForNamespace } from '../core/db/services/namespaceServices'
import { customerNspFromContractNsp } from './extract'

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const NULL_32_BYTE_HASH =
    '0x0000000000000000000000000000000000000000000000000000000000000000'
export const NULL_BYTE_DATE = '0x'

const ABI_INPUT_PLACEHOLDER_PREFIX = '___ph-'

const web3 = new Web3()

export const identPath = (value: string): string =>
    value
        .split('.')
        .map((v) => ident(v))
        .join('.')

export const mapByKey = (iterable: object[], key: string): { [key: string]: any } => {
    let m = {}
    let val
    for (let i = 0; i < iterable.length; i++) {
        val = iterable[i][key]
        m[val] = iterable[i]
    }
    return m
}

export const normalizeEthAddress = (
    value: any,
    replaceNullAddress: boolean = true,
    shrinkIfNeeded: boolean = false
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if (value === NULL_ADDRESS && replaceNullAddress) {
        return null
    } else {
        if (shrinkIfNeeded && value.length >= 40) {
            value = `0x${value.slice(value.length - 40)}`
        }
        value = value.toLowerCase()
        return value === NULL_ADDRESS && replaceNullAddress ? null : value
    }
}

export const normalize32ByteHash = (
    value: any,
    replaceNullAddress: boolean = true
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if ((value === NULL_32_BYTE_HASH || value === NULL_BYTE_DATE) && replaceNullAddress) {
        return null
    } else {
        return value
    }
}

export const normalizeByteData = (
    value: any,
    replaceNullAddress: boolean = true
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if (value === NULL_BYTE_DATE && replaceNullAddress) {
        return null
    } else {
        return value
    }
}

export const numberToHex = (value: any) => {
    if (typeof value !== 'number' && typeof value !== 'bigint') {
        return null
    }

    return nth(value as any)
}

export const hexToNumber = (value: any): any => {
    if (typeof value !== 'string') {
        return null
    }

    return htn(value)
}

export const hexToNumberString = (value: any): any => {
    if (typeof value !== 'string') {
        return null
    }
    return htns(value)
}

export const toString = (value: any): string => {
    if (value === null || value === undefined) {
        return ''
    }
    return value.toString()
}

export const toSlug = (value: string): string => {
    return value
        .replace(/[']/g, '')
        .replace(/[^A-Za-z0-9-_]/g, '-')
        .toLowerCase()
}

export const toNamespaceSlug = (value: string): string => {
    return value
        .replace(/[']/g, '')
        .replace(/[^A-Za-z0-9-_.]/g, '-')
        .toLowerCase()
}

export const toNamespacedVersion = (nsp: string, name: string, version: string) =>
    `${nsp}.${name}@${version}`

export const fromNamespacedVersion = (
    namespacedVersion: string
): {
    nsp: string
    name: string
    version: string
} => {
    const atSplit = (namespacedVersion || '').split('@')
    if (atSplit.length !== 2) {
        return { nsp: '', name: '', version: '' }
    }

    const [nspName, version] = atSplit
    const dotSplit = (nspName || '').split('.')
    if (dotSplit.length < 2) {
        return { nsp: '', name: '', version: '' }
    }

    const name = dotSplit.pop()
    const nsp = dotSplit.join('.')

    return { nsp, name, version }
}

export const splitOnLastOccurance = (value: string, delimiter: string): string[] => {
    const index = value.lastIndexOf(delimiter)
    return index < 0 ? [value] : [value.slice(0, index), value.slice(index + 1)]
}

export const uniqueByKeys = (iterable: StringKeyMap[], keys: string[]): StringKeyMap[] => {
    const uniqueArr = []
    const keysSeen = new Set<string>()
    for (let i = 0; i < iterable.length; i++) {
        const obj = iterable[i]
        const uniqueKeyId = keys.map((key) => obj[key] || '').join('__')
        if (keysSeen.has(uniqueKeyId)) continue
        keysSeen.add(uniqueKeyId)
        uniqueArr.push(obj)
    }
    return uniqueArr
}

export const unique = (arr: any[]): any[] => Array.from(new Set(arr))

export const toChunks = (arr: any, chunkSize: number): any[][] => {
    const result = []
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize)
        result.push(chunk)
    }
    return result
}

export const formatAbiValueWithType = (value: any, dataType: string): any => {
    if (dataType?.includes('int')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return attemptToParseNumber(value)
    }
    if (dataType?.includes('address')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return attemptToLowerCase(value)
    }
    if (dataType?.includes('bool')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return parseAbiBool(value)
    }
    return value
}

export const attemptToParseNumber = (originalValue: any): any => {
    try {
        const numberValue = Number(originalValue)
        return numberValue > Number.MAX_SAFE_INTEGER ? originalValue : numberValue
    } catch (err) {
        return originalValue
    }
}

export const attemptToLowerCase = (originalValue: string): string => {
    try {
        return originalValue.toLowerCase()
    } catch (err) {
        return originalValue
    }
}

export const parseAbiBool = (value: any): boolean => {
    if (!value) return false
    switch (typeof value) {
        case 'string':
            return value.includes('true') || parseInt(value) === 1
        case 'number':
            return value === 1
        default:
            return value
    }
}

export const functionSignatureToAbiInputs = (value: string): StringKeyMap => {
    const [functionName, _] = value.split('(')
    const inputs = (groupArgs(value.replace(/,/g, ' '))[0] || {}).components || []
    return { functionName, inputs }
}

export const minimizeAbiInputs = (inputs: StringKeyMap[]): StringKeyMap[] => {
    return inputs
        .map((input) => {
            if (Array.isArray(input)) {
                return minimizeAbiInputs(input).filter((v) => !!v)
            } else if (typeof input === 'object' && input?.type) {
                const minInput: any = { type: input.type }
                if (input.hasOwnProperty('components')) {
                    minInput.components = minimizeAbiInputs(input.components || [])
                }
                return minInput
            } else {
                return null
            }
        })
        .filter((v) => !!v)
}

export const ensureNamesExistOnAbiInputs = (inputs: StringKeyMap[]): any => {
    return inputs.map((input) => {
        if (Array.isArray(input)) {
            return ensureNamesExistOnAbiInputs(input)
        } else if (typeof input === 'object' && input?.type) {
            if (!input.name) {
                input.name = `${ABI_INPUT_PLACEHOLDER_PREFIX}${parseInt(
                    (Math.random() * 1000000000) as any
                )}`
            }
            if (input.hasOwnProperty('components')) {
                input.components = ensureNamesExistOnAbiInputs(input.components || [])
            }
            return input
        } else {
            return input
        }
    })
}

export const groupAbiInputsWithValues = (inputs: StringKeyMap[], values: any): StringKeyMap[] => {
    return inputs.map((input, i) => {
        if (Array.isArray(input)) {
            return groupAbiInputsWithValues(input, values[i])
        } else if (typeof input === 'object' && input?.type) {
            let newInput = { ...input }
            if (newInput.hasOwnProperty('components')) {
                if (newInput.type?.match(/\[.*\]$/) !== null) {
                    newInput.value = (values[i] || []).map((valGroup) =>
                        groupAbiInputsWithValues(newInput.components || [], valGroup)
                    )
                } else {
                    newInput.value = groupAbiInputsWithValues(newInput.components || [], values[i])
                }
                delete newInput.components
            } else {
                newInput.value = formatAbiValueWithType(values[i], newInput.type)
            }
            if (newInput.name && newInput.name.startsWith(ABI_INPUT_PLACEHOLDER_PREFIX)) {
                delete newInput.name
            }
            Object.keys(newInput)
                .filter((k) => !['name', 'type', 'value'].includes(k))
                .forEach((k) => {
                    delete newInput[k]
                })
            return newInput
        } else {
            let newInput = { ...input }
            newInput.value = formatAbiValueWithType(values[i], newInput.type)
            return newInput
        }
    })
}

const groupArgs = (value: string): any => {
    var i = 0
    function recurse() {
        var arr = []
        var startIndex = i
        function addWord() {
            if (i - 1 > startIndex) {
                arr.push({ type: value.slice(startIndex, i - 1) })
            }
        }
        while (i < value.length) {
            switch (value[i++]) {
                case ' ':
                    addWord()
                    startIndex = i
                    continue
                case '(':
                    arr.push(recurse())
                    startIndex = i
                    continue
                case ')':
                    addWord()
                    let type = 'tuple'
                    if (value[i] === '[' && value[i + 1] === ']') {
                        i += 2
                        type += '[]'
                    }
                    return { type, components: arr }
            }
        }
        addWord()
        return arr
    }
    return recurse()
}

export const splitLogDataToWords = (data: string): string[] =>
    data?.length > 2 ? toChunks(data.slice(2), 64).map((w) => `0x${w}`) : []

export const removeAcronymFromCamel = (val: string): string => {
    val = val || ''

    let formattedVal = ''
    for (let i = 0; i < val.length; i++) {
        const [prevChar, char, nextChar] = [val[i - 1], val[i], val[i + 1]]
        const [prevCharIsUpperCase, charIsUpperCase, nextCharIsUpperCase] = [
            prevChar && prevChar === prevChar.toUpperCase(),
            char && char === char.toUpperCase(),
            nextChar && nextChar === nextChar.toUpperCase(),
        ]

        if (
            prevCharIsUpperCase &&
            charIsUpperCase &&
            (nextCharIsUpperCase || i === val.length - 1)
        ) {
            formattedVal += char.toLowerCase()
        } else {
            formattedVal += char
        }
    }

    return formattedVal
}

export const camelizeKeys = (any) => humps.camelizeKeys(any)

export const camelToSnake = (val: string): string => {
    return humps.decamelize(removeAcronymFromCamel(val))
}

export const snakeToCamel = (val: string): string => {
    return humps.camelize(val)
}

export const lowerCaseCamel = (val: string): string => {
    val = removeAcronymFromCamel(val)

    if (val[0] === val[0].toUpperCase()) {
        val = val[0].toLowerCase() + val.slice(1)
    }

    return val
}

export const buildIconUrl = (id: string) => `https://dbjzhg7yxqn0y.cloudfront.net/v1/${id}.jpg`

export const invert = (obj1: object): object => {
    const obj2 = {}
    for (const key in obj1) {
        obj2[obj1[key]] = key
    }
    return obj2
}

export const stripLeadingAndTrailingUnderscores = (val: string): string =>
    (val || '').replace(/^[_]+/g, '').replace(/[_]+$/g, '')

export const padDateNumber = (value: number): string => {
    const asString = value.toString()
    return asString.length < 2 ? `0${asString}` : asString
}

export const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0)

export const toNumber = (val: any): number | null => {
    const num = parseInt(val)
    return Number.isNaN(num) ? null : num
}

export const toSafeISOString = (val: any): string | null => {
    const d = toDate(val)
    return d ? d.toISOString() : null
}

export const shuffle = (arr: any[]) => {
    let currentIndex = arr.length
    let randomIndex: number
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex--
        ;[arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]]
    }
    return arr
}

export function createAbiItemSignature(item: StringKeyMap): string | null {
    switch (item.type) {
        case 'function':
        case 'constructor':
            return web3.eth.abi.encodeFunctionSignature(item as any)
        case 'event':
            return web3.eth.abi.encodeEventSignature(item as any)
        default:
            return null
    }
}

export function polishAbis(abis: StringKeyMap): StringKeyMap[] {
    const abisMap = {}
    const funcSigHashesMap = {}

    for (const address in abis) {
        const abi = abis[address]
        const newAbi = []

        for (const item of abi) {
            let signature = item.signature
            if (signature) {
                newAbi.push(item)
            } else {
                signature = createAbiItemSignature(item)
                if (signature) {
                    newAbi.push({ ...item, signature })
                } else {
                    newAbi.push(item)
                }
            }

            if (
                ['function', 'constructor'].includes(item.type) &&
                signature &&
                !funcSigHashesMap.hasOwnProperty(signature)
            ) {
                funcSigHashesMap[signature] = {
                    name: item.name,
                    type: item.type,
                    inputs: minimizeAbiInputs(item.inputs),
                    signature,
                }
            }
        }

        abisMap[address] = newAbi
    }

    return [abisMap, funcSigHashesMap]
}

export function formatLogAsSpecEvent(
    log: StringKeyMap,
    contractGroupAbi: Abi,
    contractInstanceName: string,
    chainId: string,
    transaction: EvmTransaction
): StringKeyMap | null {
    let eventOrigin: StringKeyMap = {
        contractAddress: log.address,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        signature: log.topic0,
        blockHash: log.blockHash,
        blockNumber: Number(log.blockNumber),
        blockTimestamp: toSafeISOString(log.blockTimestamp),
        chainId,
    }

    const fixedContractEventProperties = {
        ...eventOrigin,
        contractName: contractInstanceName,
        logIndex: log.logIndex,
    }

    // add after creating the fixed properties above.
    eventOrigin = {
        ...eventOrigin,
        transaction,
    }

    const groupAbiItem = contractGroupAbi.find((item) => item.signature === log.topic0)
    if (!groupAbiItem) return null

    const groupArgNames = (groupAbiItem.inputs || []).map((input) => input.name).filter((v) => !!v)
    const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
    if (logEventArgs.length !== groupArgNames.length) return null

    const eventProperties = []
    for (let i = 0; i < logEventArgs.length; i++) {
        const arg = logEventArgs[i]
        if (!arg) return null

        const argName = groupArgNames[i]
        if (!argName) return null

        eventProperties.push({
            name: snakeToCamel(stripLeadingAndTrailingUnderscores(argName)),
            value: arg.value,
        })
    }

    // Ensure event arg property names are unique.
    const seenPropertyNames = new Set(Object.keys(fixedContractEventProperties))
    for (const property of eventProperties) {
        let propertyName = property.name
        while (seenPropertyNames.has(propertyName)) {
            propertyName = '_' + propertyName
        }
        seenPropertyNames.add(propertyName)
        property.name = propertyName
    }

    const data = {
        ...fixedContractEventProperties,
    }
    for (const property of eventProperties) {
        data[property.name] = property.value
    }

    return { data, eventOrigin }
}

export function formatTraceAsSpecCall(
    trace: StringKeyMap,
    signature: string,
    contractGroupAbi: Abi,
    contractInstanceName: string,
    chainId: string,
    transaction: EvmTransaction
): StringKeyMap {
    const callOrigin = {
        _id: trace.id,
        contractAddress: trace.to,
        contractName: contractInstanceName,
        transaction,
        transactionHash: trace.transactionHash,
        transactionIndex: trace.transactionIndex,
        traceIndex: trace.traceIndex,
        signature,
        blockHash: trace.blockHash,
        blockNumber: Number(trace.blockNumber),
        blockTimestamp: toSafeISOString(trace.blockTimestamp),
        chainId,
    }

    const groupAbiItem = contractGroupAbi.find((item) => item.signature === signature)
    if (!groupAbiItem) return null

    const groupArgNames = (groupAbiItem.inputs || []).map((input) => input.name)
    const functionArgs = (trace.functionArgs || []) as StringKeyMap[]
    const inputs = {}
    const inputArgs = []
    for (let i = 0; i < functionArgs.length; i++) {
        const arg = functionArgs[i]
        if (!arg) return null

        const argName = groupArgNames[i]
        if (argName) {
            inputs[argName] = arg.value
        }

        inputArgs.push(arg.value)
    }

    const groupOutputNames = (groupAbiItem.outputs || []).map((output) => output.name)
    const functionOutputs = (trace.functionOutputs || []) as StringKeyMap[]
    const outputs = {}
    const outputArgs = []
    for (let i = 0; i < functionOutputs.length; i++) {
        const output = functionOutputs[i]
        if (!output) return null

        const outputName = groupOutputNames[i]
        if (outputName) {
            outputs[outputName] = output.value
        }

        outputArgs.push(output.value)
    }

    return {
        callOrigin,
        inputs,
        inputArgs,
        outputs,
        outputArgs,
    }
}

export function formatEventVersionViewNameFromEventSpec(
    eventSpec: ContractEventSpec,
    nsp: string
): string {
    const { contractName, eventName, abiItem } = eventSpec
    const shortSig = abiItem.signature.slice(0, 10)
    const viewName = [nsp, contractName, eventName, shortSig].join('_').toLowerCase()
    return viewName.length >= MAX_TABLE_NAME_LENGTH
        ? [nsp, hash(viewName).slice(0, 10)].join('_').toLowerCase()
        : viewName
}

export function formatEventVersionViewName(eventVersion: EventVersion): string | null {
    const splitNsp = eventVersion.nsp.split('.')
    if (splitNsp.length < 2) return null
    const nsp = splitNsp[0]
    const contractName = splitNsp[1]
    const eventName = eventVersion.name
    const shortSig = eventVersion.version.slice(0, 10)
    const viewName = [nsp, contractName, eventName, shortSig].join('_').toLowerCase()
    return viewName.length >= MAX_TABLE_NAME_LENGTH
        ? [nsp, hash(viewName).slice(0, 10)].join('_').toLowerCase()
        : viewName
}

export const splitOnUppercase = (val) => {
    return val
        ?.replace(/([0-9])([A-Z])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
}

export async function formatAlgoliaNamespace(result: StringKeyMap): Promise<StringKeyMap> {
    try {
        // Format results.
        const chainIds = await getChainIdsForNamespace(result.name)

        return {
            id: result.id,
            name: result.name,
            displayName: result.displayName,
            slug: result.slug,
            shortDesc: result.shortDesc,
            verified: result.verified || false,
            icon: result.hasIcon ? buildIconUrl(result.name) : null,
            blurhash: result.blurhash,
            chainIds: chainIds,
        }
    } catch (err) {
        logger.error('Error formatting Algolia namespace', err)
    }
}

export function formatAlgoliaLiveObject(result: StringKeyMap) {
    try {
        // Format results.
        const isContractEvent = isContractNamespace(result.namespaceName)
        const customerNsp = customerNspFromContractNsp(result.namespaceName)
        const searchAttribute = splitOnUppercase(result.liveObjectName)

        let icon
        if (result.liveObjectHasIcon) {
            icon = buildIconUrl(result.liveObjectUid)
        } else if (result.namespaceHasIcon) {
            icon = buildIconUrl(result.namespaceName)
        } else if (isContractEvent) {
            icon = buildIconUrl(result.namespaceName.split('.')[2])
        } else {
            icon = '' // TODO: Need fallback
        }

        return {
            id: result.liveObjectUid,
            name: result.liveObjectName,
            displayName: result.liveObjectDisplayName,
            desc: result.liveObjectDesc,
            icon,
            blurhash: result.namespaceBlurhash,
            verified: result.namespaceVerified,
            isContractEvent,
            customerNsp,
            searchAttribute,
            latestVersion: {
                nsp: result.versionNsp,
                name: result.versionName,
                version: result.versionVersion,
                chainIds: Object.keys(result.versionConfig.chains),
            },
        }
    } catch (err) {
        logger.error('Error formatting Algolia live object', err)
    }
}

export function formatAlgoliaContracts(contracts: StringKeyMap[]) {
    try {
        const groups: StringKeyMap = {}
        const groupedContracts = []

        contracts.forEach((contract) => {
            const groupName = contract.namespace.name
            const icon = buildIconUrl(groupName.split('.')[0]) || null
            const customerNsp = customerNspFromContractNsp(contract.namespace.name)
            const searchAttribute = splitOnUppercase(contract.name)
            groups[groupName] = groups[groupName] || {
                id: contract.uid,
                name: contract.name,
                numInstances: 0,
                customerNsp,
                searchAttribute,
                namespace: {
                    slug: contract.namespace.slug,
                    verified: contract.namespace.verified,
                    icon: icon,
                    blurhash: contract.namespace.blurhash,
                    chainIds: [],
                },
            }
            // groups[groupName].namespace.chainIds.push(chainId)
            groups[groupName].numInstances += contract.contractInstances.length
        })

        Object.entries(groups).forEach(([groupName, values]) =>
            groupedContracts.push({
                groupName,
                ...values,
            })
        )

        return groupedContracts
    } catch (err) {
        logger.error('Error formatting Algolia contracts', err)
    }
}

export const stripTrailingSlash = (val: string): string => {
    while (val.endsWith('/')) {
        val = val.slice(0, val.length - 1)
    }
    return val
}

export function formatLiveObjectVersionForPage(
    result: StringKeyMap,
    recordCountsData: StringKeyMap
) {
    const liveObject = result.liveObject
    const namespace = result.liveObject.namespace
    const isContractEvent = isContractNamespace(namespace.name)
    const config = result.config
    const tablePath = config?.table || null
    const recordCountInfo = tablePath ? recordCountsData[tablePath] || {} : {}
    let numRecords = parseInt(recordCountInfo.count)
    numRecords = Number.isNaN(numRecords) ? 0 : numRecords

    let icon
    if (liveObject.hasIcon) {
        icon = buildIconUrl(liveObject.uid)
    } else if (namespace.hasIcon) {
        icon = buildIconUrl(namespace.name)
    } else if (isContractEvent) {
        icon = buildIconUrl(namespace.name.split('.')[0])
    } else {
        icon = '' // TODO: Need fallback
    }

    let codeUrl = null
    if (!isContractEvent && namespace.codeUrl && !!config?.folder) {
        codeUrl = [
            stripTrailingSlash(namespace.codeUrl),
            'blob',
            'main',
            config.folder,
            'spec.ts',
        ].join('/')
    }

    return {
        id: liveObject.uid,
        name: liveObject.name,
        displayName: liveObject.displayName,
        desc: liveObject.desc,
        icon,
        codeUrl,
        blurhash: namespace.blurhash,
        verified: namespace.verified,
        isContractEvent,
        latestVersion: {
            id: result.uid,
            nsp: result.nsp,
            name: result.name,
            version: result.version,
            properties: result.properties,
            example: result.example,
            config: config,
            createdAt: result.createdAt.toISOString(),
        },
        records: numRecords,
        lastInteraction: recordCountInfo.updatedAt || null,
    }
}

export const getAbiSignature = (abi: Abi): string | null => {
    try {
        return hash(
            abi
                .map((item) => item.signature)
                .filter((v) => !!v)
                .sort()
                .join(':')
        )
    } catch (err) {
        logger.error(`Error generating ABI signature for ${abi}: ${err}`)
        return null
    }
}
