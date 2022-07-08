export interface Reporter {
    chainId: number
    listen(): Promise<void>
}