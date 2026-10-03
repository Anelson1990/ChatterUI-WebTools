import { mmkv } from '@lib/storage/MMKV'

export type WebSearchResult = {
    title: string
    url: string
    snippet: string
    source?: string
}

export type WebPageResult = {
    title: string
    url: string
    content: string
}

const JINA_API_KEY_STORAGE = 'nexus.jina.apiKey'
const SEARCH_CACHE_TTL = 60_000
const PAGE_CACHE_TTL = 300_000

const searchCache = new Map<
    string,
    {
        expiresAt: number
        results: WebSearchResult[]
    }
>()

const pageCache = new Map<
    string,
    {
        expiresAt: number
        page: WebPageResult
    }
>()

const decodeHtml = (value: string) =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, '/')

const stripTags = (value: string) =>
    decodeHtml(value.replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()

const unwrapDuckDuckGoUrl = (href: string) => {
    const decoded = decodeHtml(href)

    try {
        const absolute = new URL(decoded, 'https://html.duckduckgo.com')
        const target = absolute.searchParams.get('uddg')

        return target ? decodeURIComponent(target) : absolute.toString()
    } catch {
        return decoded
    }
}

const getJinaApiKey = () => mmkv.getString(JINA_API_KEY_STORAGE)?.trim() ?? ''

const truncate = (value: string, maxLength: number) => {
    const cleaned = value.replace(/\s+/g, ' ').trim()

    if (cleaned.length <= maxLength) return cleaned

    return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
}

const getCachedSearch = (query: string) => {
    const cached = searchCache.get(query)

    if (!cached) return undefined

    if (cached.expiresAt <= Date.now()) {
        searchCache.delete(query)
        return undefined
    }

    return cached.results
}

const setCachedSearch = (query: string, results: WebSearchResult[]) => {
    searchCache.set(query, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL,
        results,
    })
}

const getCachedPage = (url: string) => {
    const cached = pageCache.get(url)

    if (!cached) return undefined

    if (cached.expiresAt <= Date.now()) {
        pageCache.delete(url)
        return undefined
    }

    return cached.page
}

const setCachedPage = (url: string, page: WebPageResult) => {
    pageCache.set(url, {
        expiresAt: Date.now() + PAGE_CACHE_TTL,
        page,
    })
}

/**
 * Preferred search provider.
 *
 * Jina's hosted search endpoint returns web results already prepared
 * for downstream LLM processing. An API key is optional at the
 * architecture level; if no key is configured, we fall back to the
 * DuckDuckGo implementation below.
 */
const searchJina = async (
    query: string,
    maxResults = 5
): Promise<WebSearchResult[]> => {
    const apiKey = getJinaApiKey()

    if (!apiKey) return []

    const url = `https://s.jina.ai/${encodeURIComponent(query)}`

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
    })

    if (!response.ok) {
        throw new Error(`Jina Search returned HTTP ${response.status}`)
    }

    const raw = await response.json()

    const data = raw?.data

    if (Array.isArray(data)) {
        return data
            .slice(0, maxResults)
            .map((item: any) => ({
                title: String(item?.title ?? item?.name ?? '').trim(),
                url: String(item?.url ?? '').trim(),
                snippet: truncate(
                    String(item?.description ?? item?.snippet ?? item?.content ?? ''),
                    700
                ),
                source: item?.url
                    ? (() => {
                          try {
                              return new URL(item.url).hostname
                          } catch {
                              return undefined
                          }
                      })()
                    : undefined,
            }))
            .filter((item: WebSearchResult) => item.title || item.url)
    }

    if (typeof data === 'string') {
        return parseJinaSearchText(data, maxResults)
    }

    return []
}

/**
 * Jina sometimes returns a text/markdown representation instead of
 * a structured array. Keep this parser intentionally conservative.
 */
const parseJinaSearchText = (
    value: string,
    maxResults: number
): WebSearchResult[] => {
    const results: WebSearchResult[] = []

    const blocks = value
        .split(/\n(?=\s*(?:#{1,3}\s*)?\d+[\).\s])/g)
        .map((block) => block.trim())
        .filter(Boolean)

    for (const block of blocks) {
        if (results.length >= maxResults) break

        const urlMatch = block.match(/https?:\/\/[^\s)\]>]+/i)

        if (!urlMatch) continue

        const url = urlMatch[0].replace(/[.,;]+$/, '')
        const lines = block
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)

        const title =
            lines.find(
                (line) =>
                    !/^https?:\/\//i.test(line) &&
                    !/^\d+[\).\s]/.test(line)
            ) ?? url

        const snippet = lines
            .filter((line) => line !== title && !line.includes(url))
            .join(' ')

        let source: string | undefined

        try {
            source = new URL(url).hostname
        } catch {
            // Ignore malformed URLs.
        }

        results.push({
            title: truncate(title.replace(/^#+\s*/, ''), 220),
            url,
            snippet: truncate(snippet, 700),
            source,
        })
    }

    return results
}

/**
 * Existing DuckDuckGo fallback.
 */
export const searchDuckDuckGo = async (
    query: string,
    maxResults = 6
): Promise<WebSearchResult[]> => {
    const trimmed = query.trim()

    if (!trimmed) return []

    const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`,
        {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'NEXUS/1.0 (Android)',
            },
        }
    )

    if (!response.ok) {
        throw new Error(`DuckDuckGo returned HTTP ${response.status}`)
    }

    const html = await response.text()
    const results: WebSearchResult[] = []

    const resultBlocks = html
        .split(
            /<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i
        )
        .slice(1)

    for (const block of resultBlocks) {
        if (results.length >= maxResults) break

        const titleMatch = block.match(
            /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
        )

        if (!titleMatch) continue

        const snippetMatch =
            block.match(
                /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
            ) ||
            block.match(
                /<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
            )

        const url = unwrapDuckDuckGoUrl(titleMatch[1])

        let source: string | undefined

        try {
            source = new URL(url).hostname
        } catch {
            // Ignore malformed URLs.
        }

        results.push({
            title: truncate(stripTags(titleMatch[2]), 220),
            url,
            snippet: truncate(
                snippetMatch ? stripTags(snippetMatch[1]) : '',
                700
            ),
            source,
        })
    }

    return results
}

/**
 * Main NEXUS search entry point.
 *
 * Provider order:
 *   1. Jina when a Jina API key is configured
 *   2. DuckDuckGo fallback
 *
 * Results are cached briefly to avoid repeating identical searches.
 */
export const searchWeb = async (
    query: string,
    maxResults = 5
): Promise<WebSearchResult[]> => {
    const trimmed = query.trim()

    if (!trimmed) return []

    const cacheKey = `${trimmed.toLowerCase()}::${maxResults}`
    const cached = getCachedSearch(cacheKey)

    if (cached) return cached

    let results: WebSearchResult[] = []

    try {
        results = await searchJina(trimmed, maxResults)
    } catch {
        // Jina failure should never prevent the fallback provider.
        results = []
    }

    if (results.length === 0) {
        try {
            results = await searchDuckDuckGo(trimmed, maxResults)
        } catch {
            results = []
        }
    }

    setCachedSearch(cacheKey, results)

    return results
}

/**
 * Read a specific web page through Jina Reader.
 *
 * This is intentionally separate from search. NEXUS should not
 * download full webpages unless the model actually needs them.
 */
export const readWebPage = async (
    url: string
): Promise<WebPageResult | undefined> => {
    const trimmed = url.trim()

    if (!trimmed) return undefined

    const cached = getCachedPage(trimmed)

    if (cached) return cached

    const apiKey = getJinaApiKey()

    if (!apiKey) return undefined

    const response = await fetch(
        `https://r.jina.ai/${encodeURIComponent(trimmed)}`,
        {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'X-Engine': 'auto',
                'X-Cache-Tolerance': '300',
            },
        }
    )

    if (!response.ok) {
        throw new Error(`Jina Reader returned HTTP ${response.status}`)
    }

    const raw = await response.json()
    const data = raw?.data

    const page: WebPageResult = {
        title: String(data?.title ?? raw?.title ?? '').trim(),
        url: String(data?.url ?? trimmed).trim(),
        content: truncate(
            String(data?.content ?? data ?? '').trim(),
            12000
        ),
    }

    setCachedPage(trimmed, page)

    return page
}

export const setJinaApiKey = (apiKey: string) => {
    const value = apiKey.trim()

    if (!value) {
        mmkv.remove(JINA_API_KEY_STORAGE)
        return
    }

    mmkv.set(JINA_API_KEY_STORAGE, value)
}

export const clearJinaApiKey = () => {
    mmkv.remove(JINA_API_KEY_STORAGE)
}

export const hasJinaApiKey = () => Boolean(getJinaApiKey())

export const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'web_search',
        description:
            'Search the live web for current information, recent events, facts that need verification, or information the model does not know.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description:
                        'A concise search query containing the important terms needed to find the answer.',
                },
            },
            required: ['query'],
        },
    },
} as const

export const formatSearchResults = (
    results: WebSearchResult[]
): string => {
    if (results.length === 0) {
        return 'No web search results were found.'
    }

    return results
        .slice(0, 5)
        .map(
            (result, index) =>
                `${index + 1}. ${result.title}\n` +
                `Source: ${result.source ?? 'web'}\n` +
                `URL: ${result.url}\n` +
                `Summary: ${result.snippet}`
        )
        .join('\n\n')
}
