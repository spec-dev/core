import { StringKeyMap } from '../../lib/types'

export function groupInputKeys(input: StringKeyMap | StringKeyMap[]): StringKeyMap {
    const inputs = Array.isArray(input) ? input : [input]
    let groupedInputs = {}
    for (const entry of inputs) {
        for (const key in entry) {
            groupedInputs[key] = groupedInputs[key] || []
            groupedInputs[key].push(entry[key])
        }
    }
    for (const key in groupedInputs) {
        groupedInputs[key] = Array.from(new Set(groupedInputs[key]))
    }
    return groupedInputs
}