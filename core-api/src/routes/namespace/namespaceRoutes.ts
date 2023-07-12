import { app } from '../express'
import paths from '../../utils/paths'
import { codes } from '../../utils/requests'
import { buildIconUrl, getCachedFeaturedNamespaces, getNamespaces } from '../../../../shared'

/**
 * Get the current featured namespaces.
 */
app.get(paths.FEATURED_NAMESPACES, async (req, res) => {
    // Check cache.
    const namespaceSlugs = await getCachedFeaturedNamespaces()
    if (!namespaceSlugs) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }

    // Format namespaces.
    function formatNamespace(nsp) {
        const icon = nsp.hasIcon ? buildIconUrl(nsp.name) : ''
        return {...nsp, icon} 
    }

    // Find namespaces by slugs.
    const data = await getNamespaces(namespaceSlugs)
    if (!data) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }
    data.sort((a, b) => a.displayName.localeCompare(b.displayName))
    
    // Send response.
    return res.status(codes.SUCCESS).json(data.map(formatNamespace))
})