export type WebSearchResult = {
    title: string
    url: string
    snippet: string
}

const decodeHtml = (value: string) =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, '/')

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

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

export const searchDuckDuckGo = async (query: string, maxResults = 6): Promise<WebSearchResult[]> => {
    const trimmed = query.trim()
    if (!trimmed) return []

    const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`,
        {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'ChatterUI/0.8.8 (Android)',
            },
        }
    )

    if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}`)

    const html = await response.text()
    const results: WebSearchResult[] = []
    const resultBlocks = html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1)

    for (const block of resultBlocks) {
        if (results.length >= maxResults) break

        const titleMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
        if (!titleMatch) continue

        const snippetMatch =
            block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)

        results.push({
            title: stripTags(titleMatch[2]),
            url: unwrapDuckDuckGoUrl(titleMatch[1]),
            snippet: snippetMatch ? stripTags(snippetMatch[1]) : '',
        })
    }

    return results
}

export const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'web_search',
        description:
            'Search the live web with DuckDuckGo. Use this when the user asks for current information, recent events, facts you need to verify, or information you do not know.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The concise web search query to run.',
                },
            },
            required: ['query'],
        },
    },
} as const

export const formatSearchResults = (results: WebSearchResult[]) =>
    results.length === 0
        ? 'No DuckDuckGo search results were found.'
        : results
              .map(
                  (result, index) =>
                      `${index + 1}. ${result.title}\nURL: ${result.url}\nSummary: ${result.snippet}`
              )
              .join('\n\n')
