export const contractGroupNameFromNamespace = (nsp: string): string | null => {
    const splitNsp = nsp.split('.')
    if (splitNsp.length !== 4) return null
    return splitNsp.slice(2).join('.') || null
}