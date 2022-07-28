import LRU from 'lru-cache'

export const edgeFunctionUrls = new LRU<string, string>({
    max: 1000,
})
