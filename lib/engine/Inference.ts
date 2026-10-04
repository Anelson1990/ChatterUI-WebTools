const runLocalToolCompletion = async (
    fields: ContextBuilderParams,
    payload: NonNullable<Awaited<ReturnType<typeof buildLocalPayload>>>
) => {
    const context = Llama.useLlamaModelStore.getState().context

    if (!context) return false

    const messages = await buildChatCompletionContext(fields)

    if (!messages) return false

    const engineData =
        Llama.useLlamaPreferencesStore.getState().config

    const baseParams: any = {
        ...payload,
        n_threads: engineData.threads,
        messages,
        jinja: true,
        tool_choice: 'auto',
        tools: [WEB_SEARCH_TOOL],
    }

    delete baseParams.prompt

    useInference.getState().setAbort(async () => {
        await Llama.useLlamaModelStore.getState().stopCompletion()
    })

    const first =
        await Llama.useLlamaModelStore
            .getState()
            .completionRaw(baseParams)

    if (!first) return false

    const structuredToolCalls = Array.isArray(first.tool_calls)
        ? first.tool_calls
        : []

    const rawToolCalls = parseRawToolCalls(first.text ?? '')

    const toolCalls =
        structuredToolCalls.length > 0
            ? structuredToolCalls
            : rawToolCalls

    if (toolCalls.length === 0) return false

    const searchBlocks: string[] = []
    let executedTool = false

    for (const call of toolCalls) {
        const name = normalizeToolName(
            call?.function?.name ?? call?.name
        )

        if (name !== 'web_search') continue

        let args: any =
            call?.function?.arguments ??
            call?.arguments ??
            {}

        args = parseToolArguments(args)

        const query =
            typeof args?.query === 'string'
                ? args.query.trim()
                : ''

        if (!query) continue

        const results = await searchWeb(query, 5)

        const formatted = formatSearchResults(results)

        searchBlocks.push(
            `SEARCH QUERY: ${query}\n\n${formatted}`
        )

        executedTool = true
    }

    if (!executedTool) return false

    /*
     * IMPORTANT:
     *
     * Do not send the results back as a native "tool" message.
     *
     * Some local Jinja/Gemma templates do not correctly interpret
     * OpenAI-style tool messages. Instead, explicitly inject the
     * research into the conversation as context the model can read.
     */

    const researchContext = `
WEB SEARCH RESULTS
==================

${searchBlocks.join('\n\n--------------------\n\n')}

==================
Use the web search results above as research for the user's question.

Answer the user's original question directly.
Do not mention internal tool calls.
Do not output tool-call syntax.
Do not invent information that is not supported by the available results.
`

    const finalMessages: any[] = [
        ...messages,
        {
            role: 'user',
            content: researchContext,
        },
    ]

    const final =
        await Llama.useLlamaModelStore
            .getState()
            .completionRaw({
                ...baseParams,
                messages: finalMessages,
                tools: [],
                tool_choice: 'none',
            })

    if (!final) return false

    if (final.text) {
        const cleaned = cleanToolControlTokens(final.text)

        if (cleaned) {
            Chats.useChatState
                .getState()
                .insertToBuffer(cleaned)

            useTTSStore
                .getState()
                .insertBuffer(cleaned)
        }
    }

    stopGenerating()

    return true
}
