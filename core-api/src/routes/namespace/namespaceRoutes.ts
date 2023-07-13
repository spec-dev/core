import { app } from '../express'
import paths from '../../utils/paths'
import { codes } from '../../utils/requests'
import { getCachedFeaturedNamespaces, getNamespaces } from '../../../../shared'

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
    return res.status(codes.SUCCESS).json({ featuredNamespaces })
})