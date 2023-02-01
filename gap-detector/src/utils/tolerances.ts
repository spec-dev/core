import { chainIds } from '../../../shared'

export const gapTolerances = {
    [chainIds.ETHEREUM]: 4,
    [chainIds.POLYGON]: 5,
    [chainIds.MUMBAI]: 5,
}

export const checkInTolerances = {
    [chainIds.ETHEREUM]: 60000,
    [chainIds.POLYGON]: 20000,
    [chainIds.MUMBAI]: 30000,
}