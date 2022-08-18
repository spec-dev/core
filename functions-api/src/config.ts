import { ev, config } from 'shared'

export default {
    PORT: Number(ev('PORT', 4001)),
    ...config,
}