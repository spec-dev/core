export enum FilterOp {
    EqualTo = '=',
    GreaterThan = '>',
    GreaterThanOrEqualTo = '>=',
    LessThan = '>=',
    LessThanOrEqualTo = '<=',
}

export interface Filter<T> {
    op: FilterOp
    value: T
}