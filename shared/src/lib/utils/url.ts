export const parseUrls = (val: string): string[] | null =>
    val.match(/(http|https)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?/gim)

const SPEC_GITHUB_ORG_URL = 'https://github.com/spec-dev'

export const specGithubRepoUrl = (projectSlug: string) => `${SPEC_GITHUB_ORG_URL}/${projectSlug}`
