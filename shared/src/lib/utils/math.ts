export const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i)

export function randomIntegerInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min)
}

export const sum = (numbers: number[]): number => {
    let total = 0
    numbers.forEach((number) => {
        total += number
    })
    return total
}

export const average = (numbers: number[]): number => {
    return sum(numbers) / numbers.length
}
