export async function nullPromise(): Promise<null> {
    return null
}

export const keys = (obj: object): string[] => {
    if (typeof obj !== 'object') return []
    try {
        return Object.keys(obj)
    } catch (err) {
        return []
    }
}

export const values = (obj: object): any[] => {
    if (typeof obj !== 'object') return []
    try {
        return Object.values(obj)
    } catch (err) {
        return []
    }
}
