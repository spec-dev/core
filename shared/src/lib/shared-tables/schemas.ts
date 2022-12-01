import { ev } from '../utils/env'
import chainIds from '../utils/chainIds'

export default {
    ETHEREUM: 'ethereum',
    polygon: () => {
        return ev('CHAIN_ID') == chainIds.MUMBAI ? 'mumbai' : 'polygon'
    },
}
