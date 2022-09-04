import { ev, specEnvs } from './env'
import { StringKeyMap } from './types'

const functionsConfig: StringKeyMap = {
    ENV: ev('ENV', specEnvs.PROD),
    PORT: Number(ev('PORT', 4444)),
}

export default functionsConfig