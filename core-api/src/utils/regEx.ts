export function regExSplitOnUppercase(column: string, isReplace: boolean): string {
    if (isReplace) {
        column = `REPLACE(${column}, '.', ' ')`
    }
    return `REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(${column}, '([0-9])([A-Z])', '\\1_\\2', 'g'), '([a-z])([A-Z])', '\\1_\\2', 'g'), '([A-Z])([A-Z][a-z])','\\1_\\2', 'g')`
}