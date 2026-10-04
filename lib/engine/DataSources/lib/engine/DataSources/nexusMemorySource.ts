import {
    searchMemories,
    getRecentMemories,
    type Memory,
} from '@lib/memory/Memory'

import { DataSource, DataSourceResult } from './types'

const MEMORY_SOURCE_NAME = 'nexus_memory'

const MAX_MEMORY_RESULTS = 5

const formatMemory = (memory: Memory): string => {
    return `[${memory.type}] ${memory.content}`
}

const createNexusMemoryDataSource = (): DataSource => ({
    name: MEMORY_SOURCE_NAME,

    // Memory should be available early, but character examples and
    // other higher-priority context sources remain independent.
    priority: 10,

    // Memory is retrieved opportunistically rather than reserving a
    // fixed block of the context window.
    tokenBudget: 0,

    retrieve: async (
        params,
        messages,
        maxLength,
        currentLength,
        tokenBudget,
        lastMessageReached
    ): Promise<DataSourceResult[]> => {
        if (!lastMessageReached) return []

        if (!messages || messages.length === 0) {
            return []
        }

        const lastMessage = messages[messages.length - 1]

        if (!lastMessage || lastMessage.role !== 'user') {
            return []
        }

        const query = lastMessage.content?.trim()

        if (!query) {
            return []
        }

        let memories: Memory[] = []

        try {
            memories = searchMemories(query, MAX_MEMORY_RESULTS)

            // If there is no direct textual match, use a small set of
            // important/recent memories as a fallback.
            if (memories.length === 0) {
                memories = getRecentMemories(MAX_MEMORY_RESULTS)
            }
        } catch {
            // Memory must never prevent normal chat generation.
            return []
        }

        if (memories.length === 0) {
            return []
        }

        const content = memories
            .map(formatMemory)
            .join('\n')

        if (!content.trim()) {
            return []
        }

        let tokenLength = 0

        try {
            tokenLength = await params.tokenizer(content)
        } catch {
            // If tokenization fails, skip memory rather than breaking
            // the normal context-building process.
            return []
        }

        if (tokenLength <= 0) {
            return []
        }

        if (currentLength + tokenLength > maxLength) {
            return []
        }

        return [
            {
                content,
                source: MEMORY_SOURCE_NAME,
                tokenLength,
                position: {
                    type: 'relative',
                    location: 'afterSystem',
                },
            },
        ]
    },
})

export default createNexusMemoryDataSource
