import { User } from '../../../shared'
import { getRandomItem } from './random'

export const getLoginMessage = (user: User): string => {
    return getRandomItem([
        `You're in. Time to sling some data.`,
        `Successfully logged in as ${user.email}.`,
        `Welcome, ${user.firstName}.`,
    ])
}
