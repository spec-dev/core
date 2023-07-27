import fetch from 'cross-fetch'
import { StringKeyMap } from '../types'

export interface RaceFetchEntry {
    url: string
    headers?: StringKeyMap
}

type FetchResponse = Promise<[StringKeyMap, number]>

class RaceFetch {
    entries: RaceFetchEntry[]

    maxTimeout: number

    abortControllers: { [key: string]: AbortController | null } = {}

    entryPromises: FetchResponse[] = []

    dqIndexes: Set<number> = new Set()

    constructor(entries: RaceFetchEntry[], maxTimeout: number = 30000) {
        this.entries = entries
        this.maxTimeout = maxTimeout
    }

    async start(): Promise<StringKeyMap> {
        // Race all requests against each other.
        if (!this.entryPromises.length) {
            this.entryPromises = this.entries.map((entry, i) => this._fetchEntry(entry, i))
        }
        let contestants = this.entryPromises.filter((_, i) => !this.dqIndexes.has(i))
        const [fastestResponse, winningIndex] = await Promise.race(contestants)

        // DQ and continue racing if an error wins.
        if (fastestResponse.error) {
            this.dqIndexes.add(winningIndex)
            if (this.dqIndexes.size === this.entries.length) return fastestResponse
            return await this.start()
        }

        // Abort the losing requests.
        Object.values(this.abortControllers).forEach((ac) => ac?.abort())
        contestants = null
        this.entryPromises = null

        // Return the winner.
        return fastestResponse
    }

    async _fetchEntry(entry: RaceFetchEntry, i: number): FetchResponse {
        const abortController = new AbortController()
        this.abortControllers[i.toString()] = abortController
        let abortTimer = setTimeout(() => abortController.abort(), this.maxTimeout)

        let resp
        try {
            resp = await fetch(entry.url, {
                headers: entry.headers,
                signal: abortController.signal,
            })
        } catch (err) {
            clearTimeout(abortTimer)
            abortTimer = null
            this.abortControllers[i.toString()] = null
            const message = err.message || err.toString() || ''
            const aborted = message.toLowerCase().includes('user aborted')
            return aborted ? [{ data: {} }, i] : [{ error: { message } }, i]
        }
        clearTimeout(abortTimer)
        abortTimer = null
        this.abortControllers[i.toString()] = null

        let data
        try {
            data = (await resp.json()) || {}
        } catch (err) {
            data = {}
        }

        if (resp.status !== 200) {
            return [{ error: data }, i]
        }

        return [{ data }, i]
    }
}

export default RaceFetch
