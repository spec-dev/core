import { ev, config, StringKeyMap } from '../../shared'

const eventGeneratorConfig: StringKeyMap = {
    ...config,
    MAX_CONTRACT_REGISTRATION_STACK_HEIGHT: 100,
}

export default eventGeneratorConfig