import { StringKeyMap, buildIconUrl, chainIdForContractNamespace, getEvents, isContractNamespace } from '../../../../shared'
import paths from '../../utils/paths'
import { codes, errors } from '../../utils/requests'
import { app } from '../express'
import { parseEventsPayload } from './eventPayloads'

/**
 * Get all events.
 */
app.post(paths.EVENTS, async (req, res) => {
    const { payload, isValid, error } = parseEventsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const { filters } = payload
    const events = await getEvents(filters)
    if (!events) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    const groups:StringKeyMap = {}
    const groupedEvents = []

    events.forEach(event => {
        const name = event.name
        const chainId = chainIdForContractNamespace(event.namespace.slug)
        const isContractEvent = isContractNamespace(event.namespace.name)
        const icon = (isContractEvent 
            ? buildIconUrl(event.namespace.name.split('.')[2])
            : buildIconUrl(event.namespace.name)) 
            || null   
        groups[name] = groups[name] || 
            { 
                desc: event.desc, 
                chainIds: [], 
                createdAt: '', 
                version: 0,
                icon: icon,
            }
        if (!groups[name].chainIds.includes(chainId)) {
            groups[name].chainIds.push(chainId)
        }
        const latestVersion = event.eventVersions.reduce((a,b) => a.version > b.version ? a : b)
        groups[name].createdAt = latestVersion.createdAt
        groups[name].version = latestVersion.version
    })

    Object.entries(groups).forEach(([name, values]) => 
        groupedEvents.push({ 
            name, 
            ...values 
        })
    )

    return res.status(codes.SUCCESS).json(groupedEvents)
})