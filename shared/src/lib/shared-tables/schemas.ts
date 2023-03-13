import { ev } from '../utils/env'
import chainIds from '../utils/chainIds'

export default {
    ethereum: () => {
        return ev('CHAIN_ID') == chainIds.ETHEREUM ? 'ethereum' : 'goerli'
    },
    polygon: () => {
        return ev('CHAIN_ID') == chainIds.MUMBAI ? 'mumbai' : 'polygon'
    },
}
