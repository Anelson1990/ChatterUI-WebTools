import {
    searchMemories,
    type Memory,
} from '@lib/memory/Memory'

import { DataSource } from './types'

const MEMORY_SOURCE_NAME = 'nexus_memory'
const MAX_MEMORY_RESULTS = 5

const formatMemory = (memory: Memory): string => {
    return `[${memory.type}] ${memory.content}`
}

const createNexusMemoryDataSource = (): DataSource => ({
    name: MEMORY_SOURCE_NAME,
    priority: 10,
    tokenBudget: 0,

    retrieve: async (
        params,
        messages,
        maxLength,
        currentLength,
    ) => {
        if (!messages || messages.length === 0) return []

        const lastMessage = messages[messages.length - 1]

        if (
            !lastMessage ||
            lastMessage.role !== 'user'
        ) {
            return []
        }

        const query =
            lastMessage.content?.trim()

        if (!query) return []

        let memories: Memory[] = []

        try {
            memories =
                searchMemories(
                    query,
                    MAX_MEMORY_RESULTS
                )
        } catch {
            return []
        }

        if (memories.length === 0) {
            return []
        }

        const content =
            memories
                .map(formatMemory)
                .join('\n')

        if (!content.trim()) {
            return []
        }

        let tokenLength = 0

        try {
            tokenLength =
                await params.tokenizer(
                    content
                )
        } catch {
            return []
        }

        if (tokenLength <= 0) {
            return []
        }

        if (
            currentLength +
                tokenLength >
            maxLength
        ) {
            return []
        }

        return [
            {
                content,
                source:
                    MEMORY_SOURCE_NAME,
                tokenLength,
                position: {
                    type: 'relative',
                    location:
                        'afterSystem',
                },
            },
        ]
    },
})

export default createNexusMemoryDataSource
