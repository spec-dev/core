import { StringKeyMap } from '../../shared'

export interface NewBlockSpec {
    number: number
    hash: string | null
}

export interface OpRecord {
    id: number
    pk_names: string
    pk_values: string
    before: StringKeyMap | null
    after: StringKeyMap | null
    block_number: number
    chain_id?: string
    ts: string 
}

export enum OpType {
    INSERT = 'insert',
    UPDATE = 'update',
    DELETE = 'delete'
}
