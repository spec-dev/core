import { FilterOp } from './types'

export function applyFilter(query: any, colName: string, filters: any[]) {
    if (!filters) return
    filters = Array.isArray(filters) ? filters : [filters]

    const filterObj = filters.find(f => (
        typeof f === 'object' && !!f.op && f.hasOwnProperty('value')
    ))
    if (!filterObj) {
        query.whereIn(colName, filters)
        return
    }

    const { op, value } = filterObj
    switch (op) {
        case FilterOp.EqualTo:
            query.where(colName, value)
            break

        case FilterOp.GreaterThan:
            query.where(colName, '>', value)
            break

        case FilterOp.GreaterThanOrEqualTo:
            query.where(colName, '>=', value)
            break

        case FilterOp.LessThan:
            query.where(colName, '<', value)
            break

        case FilterOp.LessThanOrEqualTo:
            query.where(colName, '<=', value)
            break
    }
}