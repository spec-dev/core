import { AbiItem, logger} from '../../../shared'
import { utils } from 'ethers'
const { Interface, FormatTypes } = utils

export function abiItemFromHumanReadableString(val: string): AbiItem | null {
    try {
        val = val.replace(/[;]/g, '')
        const json = new Interface([val]).format(FormatTypes.json) as string
        return JSON.parse(json)[0] as AbiItem
    } catch (err) {
        logger.error(`Error converting human readable abi to JSON item - ${val} - ${err}`)
        return null
    }
}