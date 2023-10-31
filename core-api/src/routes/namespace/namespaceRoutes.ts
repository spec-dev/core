import { app } from '../express'
import paths from '../../utils/paths'
import { codes, errors } from '../../utils/requests'
import { parseGetNamespacePayload, parseNamespaceRecordCountsPayload } from './namespacePayloads'
import { getCachedFeaturedNamespaces, getCachedNamespaceRecordCounts, getNamespace, getNamespaces } from '../../../../shared'

/**
 * Get namespace.
 */
app.get(paths.NAMESPACE, async (req, res) => {
    const { payload, isValid, error } = parseGetNamespacePayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { slug } = payload

    // Find namespace by slug.
    const namespace = await getNamespace(slug)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    const data = await namespace.publicView()
    return res.status(codes.SUCCESS).json(data)
})

/**
 * Get namespaces.
 */
app.get(paths.NAMESPACES, async (req, res) => {
    const namespaces = await getNamespaces([])
    if (!namespaces) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }

    const featuredNamespaces = await getCachedFeaturedNamespaces()
    namespaces.sort((a, b) => {
        return featuredNamespaces?.includes(a.slug) ? -1 : featuredNamespaces?.includes(b.slug) ? 1 : 0
    })

    const data = await Promise.all(namespaces.map(n => n.publicView()))
    return res.status(codes.SUCCESS).json(data)
})

/**
 * Get the current featured namespaces.
 */
app.get(paths.FEATURED_NAMESPACES, async (req, res) => {
    // Check cache.
    const namespaceSlugs = await getCachedFeaturedNamespaces()
    if (!namespaceSlugs) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }

    // Find namespaces by slugs.
    const featuredNamespaces = await getNamespaces(namespaceSlugs)
    if (!featuredNamespaces) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }

    // Send response.
    const data = await Promise.all(featuredNamespaces.map(n => n.publicView()))
    return res.status(codes.SUCCESS).json(data)
})

/**
 * Get record counts for namespaces.
 */
app.post(paths.NAMESPACE_RECORD_COUNTS, async (req, res) => {
    const { payload, isValid, error } = parseNamespaceRecordCountsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const recordCounts = await getCachedNamespaceRecordCounts(payload.nsps)
    return res.status(codes.SUCCESS).json(recordCounts)
})