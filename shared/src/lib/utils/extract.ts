export const contractGroupNameFromNamespace = (nsp: string): string | null => {
    const splitNsp = nsp.split('.')
    if (splitNsp.length !== 4) return null
    return splitNsp.slice(2).join('.') || null
}

export const customerNspFromContractNsp = (nsp) => {
    const splitNsp = nsp?.split('.')
    return splitNsp?.length > 1 ? splitNsp[2] : nsp
}
