export const parseUrls = (val: string): string[] | null =>
    val.match(/(http|https)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?/gim)
