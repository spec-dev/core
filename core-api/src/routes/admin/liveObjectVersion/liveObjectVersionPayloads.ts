import { ValidatedPayload, StringKeyMap, PublishLiveObjectVersionPayload } from '../../../types'
import { isValidVersionFormat, keys } from '../../../../../shared'

export function parsePublishLiveObjectVersionPayload(
    data: StringKeyMap
): ValidatedPayload<PublishLiveObjectVersionPayload> {
    const folder = data?.folder
    const namespace = data?.namespace
    const name = data?.name
    const displayName = data?.displayName
    const version = data?.version
    const description = data?.description
    const events = data?.events || {}
    const config = data?.config
    const properties = data?.properties || []
    const additionalEventAssociations = data?.additionalEventAssociations || []
    
    if (!folder) {
        return { isValid: false, error: '"folder" required' }
    }

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

    if (!config.chains || !(keys(config.chains).length)) {
        return { isValid: false, error: '"config.chains" was empty' }
    }

    if (!config.uniqueBy || !config.uniqueBy.length) {
        return { isValid: false, error: '"config.uniqueBy" was empty' }
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
            folder,
            namespace,
            name,
            displayName,
            version,
            description,
            events,
            config,
            properties,
            additionalEventAssociations,
        } as PublishLiveObjectVersionPayload
    }
}