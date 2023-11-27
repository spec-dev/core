import { AbiItemInput } from '../abi/types'
import { LiveObjectVersionProperty } from '../core/db/entities/LiveObjectVersion'
import { PublishLiveObjectVersionPayload, StringKeyMap } from '../types'
import {
    TRANSACTION_HASH,
    BLOCK_HASH,
    BLOCK_NUMBER,
    TIMESTAMP,
    CHAIN_ID,
    STRING,
    NUMBER,
    guessPropertyTypeFromSolidityType,
} from './propertyTypes'
import { chainIdLiveObjectVersionPropertyOptions, fullNameForChainId } from './chainIds'
import {
    stripLeadingAndTrailingUnderscores,
    snakeToCamel,
    fromNamespacedVersion,
    camelToSnake,
    removeAcronymFromCamel,
} from './formatters'

const fixedEventViewProperties: { [key: string]: LiveObjectVersionProperty } = {
    CONTRACT_NAME: {
        name: 'contractName',
        type: STRING,
        desc: 'The name of the contract that emitted this event.',
    },
    CONTRACT_ADDRESS: {
        name: 'contractAddress',
        type: STRING,
        desc: 'The address of the contract that emitted this event.',
    },
    TRANSACTION_HASH: {
        name: 'transactionHash',
        type: TRANSACTION_HASH,
        desc: "The hash of the transaction this event's log was included in.",
    },
    LOG_INDEX: {
        name: 'logIndex',
        type: NUMBER,
        desc: "The index of this event's log within the transaction.",
    },
    BLOCK_HASH: {
        name: 'blockHash',
        type: BLOCK_HASH,
        desc: "The hash of the block this event's log was included in.",
    },
    BLOCK_NUMBER: {
        name: 'blockNumber',
        type: BLOCK_NUMBER,
        desc: "The number of the block this event's log was included in.",
    },
    BLOCK_TIMESTAMP: {
        name: 'blockTimestamp',
        type: TIMESTAMP,
        desc: "The timestamp of the block this event's log was included in.",
    },
    CHAIN_ID: {
        name: 'chainId',
        type: CHAIN_ID,
        desc: 'The blockchain id.',
        options: chainIdLiveObjectVersionPropertyOptions,
    },
}

const orderedFixedEventViewProperties = [
    fixedEventViewProperties.CONTRACT_NAME,
    fixedEventViewProperties.CONTRACT_ADDRESS,
    fixedEventViewProperties.TRANSACTION_HASH,
    fixedEventViewProperties.LOG_INDEX,
    fixedEventViewProperties.BLOCK_HASH,
    fixedEventViewProperties.BLOCK_NUMBER,
    fixedEventViewProperties.BLOCK_TIMESTAMP,
    fixedEventViewProperties.CHAIN_ID,
]

export const fixedEventViewPropertyNames = new Set(
    orderedFixedEventViewProperties.map((p) => p.name)
)

const formatEventParamAsProperty = (eventParam: StringKeyMap): LiveObjectVersionProperty => ({
    name: removeAcronymFromCamel(snakeToCamel(stripLeadingAndTrailingUnderscores(eventParam.name))),
    type: guessPropertyTypeFromSolidityType(eventParam.type),
    desc: `The "${eventParam.name}" contract event argument.`,
})

export const CONTRACT_NAME_COL = camelToSnake(fixedEventViewProperties.CONTRACT_NAME.name)
export const CONTRACT_ADDRESS_COL = camelToSnake(fixedEventViewProperties.CONTRACT_ADDRESS.name)
export const CHAIN_ID_COL = camelToSnake(fixedEventViewProperties.CHAIN_ID.name)

export function buildContractEventAsLiveObjectVersionPayload(
    nsp: string,
    contractName: string,
    eventName: string,
    namespacedEventVersion: string,
    eventParams: AbiItemInput[],
    viewName: string
): PublishLiveObjectVersionPayload {
    // Format event abi inputs as live object version properties.
    const eventParamProperties = eventParams.map(formatEventParamAsProperty)

    // Ensure event arg property names are unique.
    const seenPropertyNames = new Set(Array.from(fixedEventViewPropertyNames))
    for (const property of eventParamProperties) {
        let propertyName = property.name
        while (seenPropertyNames.has(propertyName)) {
            propertyName = '_' + propertyName
        }
        seenPropertyNames.add(propertyName)
        property.name = propertyName
    }

    const fullNspComps = fromNamespacedVersion(namespacedEventVersion)

    return {
        namespace: fullNspComps.nsp,
        name: eventName,
        version: fullNspComps.version,
        displayName: eventName,
        description: `${nsp}.${contractName}.${eventName} contract event.`,
        properties: [...eventParamProperties, ...orderedFixedEventViewProperties],
        config: {
            folder: [fullNspComps.nsp, fullNspComps.name].join('.').replace(/\./gi, '/'),
            primaryTimestampProperty: fixedEventViewProperties.BLOCK_TIMESTAMP.name,
            uniqueBy: [
                [
                    fixedEventViewProperties.TRANSACTION_HASH.name,
                    fixedEventViewProperties.LOG_INDEX.name,
                    fixedEventViewProperties.CHAIN_ID.name,
                ],
            ],
            table: ['spec', viewName].join('.'),
        },
        inputEvents: [],
        inputCalls: [],
        additionalEventAssociations: [namespacedEventVersion],
    }
}
