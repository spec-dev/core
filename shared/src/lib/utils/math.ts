export const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i)

export function randomIntegerInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min)
}
