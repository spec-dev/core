export interface QueryPayload {
    sql: string
    bindings: any[] | null
}

export type StringKeyMap = { [key: string]: any }