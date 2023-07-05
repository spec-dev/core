import { app } from "../../express"
import paths from "../../../utils/paths"
import { authorizeAdminRequest, codes, errors } from "../../../utils/requests"
import { setCachedFeaturedNamespaces } from "../../../../../shared/src/lib/core/redis"
import { parsePostFeaturedNamespacePayload } from "./namespacePayloads"

/**
 * Cache featured namespaces.
 */
app.post(paths.CACHE_FEATURED_NAMESPACES, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parsePostFeaturedNamespacePayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { namespaceSlugs } = payload

    // Set cache.
    if (!await setCachedFeaturedNamespaces(namespaceSlugs)) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }

    // Send response.
    return res.status(codes.SUCCESS).json({ ok: true })
})