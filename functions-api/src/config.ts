import { ev, config } from 'shared'

export default {
    PORT: ev('PORT', 4000),
    ...config,
}