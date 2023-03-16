export function isEmail(val: string): boolean {
    return (
        (val || '').match(
            /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
        ) !== null
    )
}
