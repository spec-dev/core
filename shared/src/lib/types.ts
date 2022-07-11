export interface NewReportedHead {
    id: number
    chainId: number
    blockNumber: number
    blockHash: string | null
    replace: boolean
}
