import { ValidatedPayload, StringKeyMap, PublishLiveObjectVersionPayload } from '../../../types'
import { isValidVersionFormat } from '../../../../../shared'

interface IndexLiveObjectVersionsPayload {
    lovIds: number[],
    startTimestamp?: string
}

export function parsePublishLiveObjectVersionPayload(
    data: StringKeyMap
): ValidatedPayload<PublishLiveObjectVersionPayload> {
    const namespace = data?.namespace
    const name = data?.name
    const displayName = data?.displayName
    const version = data?.version
    const description = data?.description
    const inputEvents = data?.inputEvents || []
    const inputCalls = data?.inputCalls || []
    const config = data?.config
    const properties = data?.properties || []
    const additionalEventAssociations = data?.additionalEventAssociations || []

    if (!namespace) {
        return { isValid: false, error: '"namespace" required' }
    }

    if (!name) {
        return { isValid: false, error: '"name" required' }
    }

    if (!displayName) {
        return { isValid: false, error: '"displayName" required' }
    }

    if (!version || !isValidVersionFormat(version)) {
        return { isValid: false, error: `Invalid "version" ${version}` }
    }

    if (!description) {
        return { isValid: false, error: '"description" required' }
    }

    if (!config) {
        return { isValid: false, error: '"config" required' }
    }

    if (!config.primaryTimestampProperty) {
        return { isValid: false, error: '"config.primaryTimestampProperty" required' }
    }

    if (!config.uniqueBy || !config.uniqueBy.length) {
        return { isValid: false, error: '"config.uniqueBy" was empty' }
    }

    if (!config.folder) {
        return { isValid: false, error: '"config.folder" required' }
    }

    if (!config.table) {
        return { isValid: false, error: '"config.table" required' }
    }

    if (!properties || !properties.length) {
        return { isValid: false, error: '"properties" was empty' }
    }

    for (const property of properties) {
        if (!property.name) {
            return { isValid: false, error: 'property "name" was empty' }
        }

        if (!property.type) {
            return { isValid: false, error: 'property "type" was empty' }
        }

        if (!property.desc) {
            return { isValid: false, error: 'property "desc" was empty' }
        }

        const options = property.options || []
        if (!options.length) continue

        for (const option of options) {
            if (!option.name) {
                return { isValid: false, error: 'property option "name" was empty' }
            }

            if (!option.type) {
                return { isValid: false, error: 'property option "type" was empty' }
            }

            if (!option.hasOwnProperty('value')) {
                return { isValid: false, error: 'property option "value" was missing' }
            }
        }
    }

    return {
        isValid: true,
        payload: {
            namespace,
            name,
            displayName,
            version,
            description,
            inputEvents,
            inputCalls,
            config,
            properties,
            additionalEventAssociations,
        } as PublishLiveObjectVersionPayload,
    }
}

export function parseIndexLiveObjectVersionsPayload(
    data: StringKeyMap
): ValidatedPayload<IndexLiveObjectVersionsPayload> {
    const lovIds = data?.lovIds || []
    const startTimestamp = data?.startTimestamp || null

    if (!lovIds.length) {
        return { isValid: false, error: '"lovIds" was missing or empty' }
    }

    return {
        isValid: true,
        payload: { lovIds, startTimestamp }
    }
}