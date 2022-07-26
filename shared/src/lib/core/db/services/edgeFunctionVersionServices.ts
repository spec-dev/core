import { EdgeFunctionVersion } from '../entities/EdgeFunctionVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const edgeFunctionVersions = () => CoreDB.getRepository(EdgeFunctionVersion)

export async function createEdgeFunctionVersion(
    nsp: string,
    edgeFunctionId: number,
    name: string,
    version: string,
    url: string
): Promise<EdgeFunctionVersion> {
    const edgeFunctionVersion = new EdgeFunctionVersion()
    edgeFunctionVersion.nsp = nsp
    edgeFunctionVersion.name = name
    edgeFunctionVersion.version = version
    edgeFunctionVersion.url = url
    edgeFunctionVersion.edgeFunctionId = edgeFunctionId

    try {
        await edgeFunctionVersions().save(edgeFunctionVersion)
    } catch (err) {
        logger.error(
            `Error creating EdgeFunctionVersion(nsp=${nsp}, name=${name}, version=${version}): ${err}`
        )
        throw err
    }

    return edgeFunctionVersion
}

export async function getEdgeFunctionVersion(
    nsp: string,
    name: string,
    version: string
): Promise<EdgeFunctionVersion | null> {
    try {
        return await edgeFunctionVersions().findOneBy({ nsp, name, version })
    } catch (err) {
        logger.error(`Error getting EdgeFunctionVersion ${nsp}.${name}@${version}: ${err}`)
        return null
    }
}

export async function getLatestEdgeFunctionVersion(
    nsp: string,
    name: string
): Promise<EdgeFunctionVersion | null> {
    let edgeFunctionVersion
    try {
        edgeFunctionVersion = await edgeFunctionVersions().findOne({
            order: { createdAt: 'DESC' },
            where: { nsp, name },
        })
    } catch (err) {
        logger.error(`Error getting latest EdgeFunctionVersion ${nsp}.${name}: ${err}`)
        throw err
    }

    return edgeFunctionVersion || null
}