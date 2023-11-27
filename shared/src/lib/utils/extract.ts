export const contractGroupNameFromNamespace = (nsp: string): string | null => {
    const splitNsp = nsp.split('.')
    if (splitNsp.length !== 2) return null
    return splitNsp.slice(2).join('.') || null
}

export const customerNspFromContractNsp = (nsp: string): string => nsp.split('.')[0]
