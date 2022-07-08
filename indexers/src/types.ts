import { NewReportedHead } from 'shared'

export interface Indexer {
    head: NewReportedHead
    perform(): Promise<void>
}