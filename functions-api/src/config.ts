import { ev, config } from 'shared'

export default {
    PORT: Number(ev('PORT', 4000)),
    ...config,
}