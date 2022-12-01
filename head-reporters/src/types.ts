export interface Reporter {
    chainId: string
    listen(): Promise<void>
}
