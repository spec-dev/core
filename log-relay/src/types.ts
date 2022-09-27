import { StringKeyMap } from '../../shared'
export { StringKeyMap }

export interface Log {
    message: string
    level: LogLevel
    timestamp: string
    projectId: string
}

export enum LogLevel {
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
}